import {
  Inspiration,
  type MissionFormat,
  PublishedVersion,
  RewriteView,
  ScoresView,
  type TheorySection,
  WritingErrorStatus,
  WritingErrorType,
  WritingFlowStatus,
} from "@english-course/shared";
import { asc, desc, eq, gte, inArray, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../shared/db/client.ts";
import {
  article,
  event,
  readingSession,
  unit,
  writingError,
  writingMission,
  writingSubmission,
} from "../shared/db/schema/index.ts";
import type { WritingMissionStatus } from "../shared/db/schema/writing.ts";

// ---------------------------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------------------------

export type UnitInfo = {
  id: number;
  title: string;
  subtitle: string;
  completed: boolean;
  priority: number;
  theory: TheorySection[];
};

const FormatLimitsShape = z.object({
  minWords: z.number().int(),
  maxWords: z.number().int(),
  maxChars: z.number().int().nullable(),
});

/** Mission details beyond the `writing_mission` columns (stored as a tagged entry). */
export const MissionMeta = z.object({
  topic: z.string(),
  whyEs: z.string().nullable(),
  grammarTargets: z.array(z.string()),
  suggestedWords: z.array(z.string()),
  limits: FormatLimitsShape,
  inspiration: z.array(Inspiration),
  source: z.enum(["ai", "fallback"]),
});
export type MissionMeta = z.infer<typeof MissionMeta>;

/** Review-flow state of a submission (stored as a tagged entry). */
export const FlowState = z.object({
  status: WritingFlowStatus,
  round: z.number().int(),
  strengthEs: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  publishedAt: z.string().nullable(),
  publishedVersion: PublishedVersion.nullable(),
});
export type FlowState = z.infer<typeof FlowState>;

export const initialFlow = (): FlowState => ({
  status: "draft",
  round: 0,
  strengthEs: null,
  reviewedAt: null,
  completedAt: null,
  publishedAt: null,
  publishedVersion: null,
});

export type MissionRecord = {
  id: string;
  level: number;
  format: MissionFormat;
  title: string;
  promptEn: string;
  targetUnitId: number | null;
  status: WritingMissionStatus;
  createdAt: Date;
  /** Bumped on every draft save, submission update and status change. */
  updatedAt: Date;
};

export type SubmissionRecord = {
  id: string;
  missionId: string;
  /** The draft, then the text as submitted for review. */
  textOriginal: string;
  /** The learner's self-fixed text (after review). */
  textFixed: string | null;
  scores: ScoresView | null;
  meta: MissionMeta;
  flow: FlowState;
  rewrites: RewriteView[];
  createdAt: Date;
};

export type MissionAggregate = { mission: MissionRecord; submission: SubmissionRecord };

/** Everything about one error beyond the `writing_error` columns (stored in `span`). */
export const ErrorSpan = z.object({
  /** Id the AI used for this error ("e1"… for the review, "n1"… for recheck issues). */
  key: z.string(),
  text: z.string(),
  status: WritingErrorStatus,
  feedbackEs: z.string().nullable(),
  origin: z.enum(["review", "recheck"]),
  round: z.number().int(),
  /** The learner's sentence that contains the error. */
  sentence: z.string().nullable(),
  /** The learner's corrected sentence, once fixed. */
  correctedSentence: z.string().nullable(),
  cardId: z.string().nullable(),
  reveal: z
    .object({ explanationEs: z.string(), correctedFragment: z.string().nullable() })
    .nullable(),
});
export type ErrorSpan = z.infer<typeof ErrorSpan>;

export type ErrorRecord = {
  id: string;
  submissionId: string;
  span: ErrorSpan;
  type: WritingErrorType;
  unitId: number | null;
  hint: string;
  fixed: boolean;
  createdAt: Date;
};

export type NewMission = Omit<MissionRecord, "id" | "createdAt" | "updatedAt">;
export type NewSubmission = Pick<SubmissionRecord, "textOriginal" | "meta" | "flow">;
export type NewError = Omit<ErrorRecord, "id" | "submissionId" | "createdAt">;
export type SubmissionPatch = Partial<
  Pick<SubmissionRecord, "textOriginal" | "textFixed" | "scores" | "flow" | "rewrites">
>;

/** Persistence port of the Writing feature. */
export interface WritingStore {
  listUnits(): Promise<UnitInfo[]>;
  raiseUnitPriority(unitId: number, by: number): Promise<void>;
  /** Articles the learner started reading since `since`, newest first, with their opinion. */
  recentReading(since: Date, limit: number): Promise<Inspiration[]>;
  /** The mission still in progress (not completed or skipped), if any. */
  activeMission(): Promise<MissionAggregate | undefined>;
  getMission(id: string): Promise<MissionAggregate | undefined>;
  /** Newest first. */
  listMissions(): Promise<MissionAggregate[]>;
  createMission(mission: NewMission, submission: NewSubmission): Promise<MissionAggregate>;
  setMissionStatus(id: string, status: WritingMissionStatus): Promise<void>;
  updateSubmission(id: string, patch: SubmissionPatch): Promise<void>;
  /** In creation order. */
  listErrors(submissionIds: string[]): Promise<ErrorRecord[]>;
  insertErrors(submissionId: string, errors: NewError[]): Promise<ErrorRecord[]>;
  updateError(id: string, patch: { span?: ErrorSpan; fixed?: boolean }): Promise<void>;
  /** Newest first, across all submissions. */
  recentErrors(limit: number): Promise<ErrorRecord[]>;
  insertEvent(type: string, payload: Record<string, unknown>): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// Tagged entries in `writing_submission.rewrites` (no dedicated columns yet, see T18)
// ---------------------------------------------------------------------------------------------

type Entries = Pick<SubmissionRecord, "meta" | "flow" | "rewrites">;

const FALLBACK_META: MissionMeta = {
  topic: "",
  whyEs: null,
  grammarTargets: [],
  suggestedWords: [],
  limits: { minWords: 1, maxWords: 600, maxChars: null },
  inspiration: [],
  source: "fallback",
};

export function packEntries(entries: Entries): Record<string, unknown>[] {
  return [
    { kind: "mission", ...entries.meta },
    { kind: "flow", ...entries.flow },
    ...entries.rewrites.map((rewrite) => ({ kind: "rewrite", ...rewrite })),
  ];
}

export function unpackEntries(raw: Record<string, unknown>[] | null): Entries {
  const list = raw ?? [];
  const of = (kind: string) => list.filter((entry) => entry.kind === kind);
  const meta = MissionMeta.safeParse(of("mission")[0]);
  const flow = FlowState.safeParse(of("flow")[0]);
  return {
    meta: meta.success ? meta.data : FALLBACK_META,
    flow: flow.success ? flow.data : initialFlow(),
    rewrites: of("rewrite").flatMap((entry) => {
      const parsed = RewriteView.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    }),
  };
}

const parseScores = (value: unknown): ScoresView | null => {
  const parsed = ScoresView.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export function parseErrorSpan(value: unknown): ErrorSpan {
  const parsed = ErrorSpan.safeParse(value);
  if (parsed.success) return parsed.data;
  const text =
    typeof (value as { text?: unknown })?.text === "string"
      ? String((value as { text: string }).text)
      : "";
  return {
    key: "e?",
    text,
    status: "open",
    feedbackEs: null,
    origin: "review",
    round: 0,
    sentence: null,
    correctedSentence: null,
    cardId: null,
    reveal: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Drizzle adapter
// ---------------------------------------------------------------------------------------------

function toMission(row: typeof writingMission.$inferSelect): MissionRecord {
  return {
    id: row.id,
    level: row.level,
    format: row.format,
    title: row.title,
    promptEn: row.prompt,
    targetUnitId: row.targetUnitId,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSubmission(row: typeof writingSubmission.$inferSelect): SubmissionRecord {
  return {
    id: row.id,
    missionId: row.missionId ?? "",
    textOriginal: row.textOriginal,
    textFixed: row.textFixed,
    scores: parseScores(row.scores),
    ...unpackEntries(row.rewrites),
    createdAt: row.createdAt,
  };
}

function toError(row: typeof writingError.$inferSelect): ErrorRecord {
  const type = WritingErrorType.safeParse(row.type);
  return {
    id: row.id,
    submissionId: row.submissionId,
    span: parseErrorSpan(row.span),
    type: type.success ? type.data : "grammar",
    unitId: row.unitId,
    hint: row.hint,
    fixed: row.fixed,
    createdAt: row.createdAt,
  };
}

export function createDrizzleWritingStore(db: Db): WritingStore {
  async function aggregates(where?: SQL): Promise<MissionAggregate[]> {
    const rows = await db
      .select({ mission: writingMission, submission: writingSubmission })
      .from(writingMission)
      .innerJoin(writingSubmission, eq(writingSubmission.missionId, writingMission.id))
      .where(where)
      .orderBy(desc(writingMission.createdAt), asc(writingSubmission.createdAt));
    const seen = new Set<string>();
    const result: MissionAggregate[] = [];
    for (const row of rows) {
      if (seen.has(row.mission.id)) continue;
      seen.add(row.mission.id);
      result.push({ mission: toMission(row.mission), submission: toSubmission(row.submission) });
    }
    return result;
  }

  return {
    async listUnits() {
      const rows = await db
        .select({
          id: unit.id,
          title: unit.title,
          subtitle: unit.subtitle,
          completedAt: unit.completedAt,
          priority: unit.priority,
          theory: unit.theory,
        })
        .from(unit)
        .orderBy(asc(unit.id));
      return rows.map(({ completedAt, ...row }) => ({ ...row, completed: completedAt !== null }));
    },

    async raiseUnitPriority(unitId, by) {
      await db
        .update(unit)
        .set({ priority: sql`${unit.priority} + ${by}`, updatedAt: new Date() })
        .where(eq(unit.id, unitId));
    },

    async recentReading(since, limit) {
      const rows = await db
        .select({ title: article.title, opinion: readingSession.opinion })
        .from(readingSession)
        .innerJoin(article, eq(article.id, readingSession.articleId))
        .where(gte(readingSession.startedAt, since))
        .orderBy(desc(readingSession.startedAt))
        .limit(limit);
      return rows;
    },

    async activeMission() {
      const [found] = await aggregates(
        inArray(writingMission.status, ["pending", "draft", "submitted"]),
      );
      return found;
    },

    async getMission(id) {
      const [found] = await aggregates(eq(writingMission.id, id));
      return found;
    },

    async listMissions() {
      return aggregates();
    },

    async createMission(mission, submission) {
      return db.transaction(async (tx) => {
        const [m] = await tx
          .insert(writingMission)
          .values({
            level: mission.level,
            format: mission.format,
            title: mission.title,
            prompt: mission.promptEn,
            targetUnitId: mission.targetUnitId,
            status: mission.status,
          })
          .returning();
        if (!m) throw new Error("writing mission insert returned no row");
        const [s] = await tx
          .insert(writingSubmission)
          .values({
            missionId: m.id,
            textOriginal: submission.textOriginal,
            rewrites: packEntries({ meta: submission.meta, flow: submission.flow, rewrites: [] }),
          })
          .returning();
        if (!s) throw new Error("writing submission insert returned no row");
        return { mission: toMission(m), submission: toSubmission(s) };
      });
    },

    async setMissionStatus(id, status) {
      await db
        .update(writingMission)
        .set({ status, updatedAt: sql`now()` })
        .where(eq(writingMission.id, id));
    },

    async updateSubmission(id, patch) {
      await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(writingSubmission)
          .where(eq(writingSubmission.id, id))
          .limit(1)
          .for("update");
        if (!row) return;
        const entries = unpackEntries(row.rewrites);
        const touchesEntries = patch.flow || patch.rewrites;
        await tx
          .update(writingSubmission)
          .set({
            ...(patch.textOriginal !== undefined ? { textOriginal: patch.textOriginal } : {}),
            ...(patch.textFixed !== undefined ? { textFixed: patch.textFixed } : {}),
            ...(patch.scores !== undefined ? { scores: patch.scores } : {}),
            ...(touchesEntries
              ? {
                  rewrites: packEntries({
                    meta: entries.meta,
                    flow: patch.flow ?? entries.flow,
                    rewrites: patch.rewrites ?? entries.rewrites,
                  }),
                }
              : {}),
          })
          .where(eq(writingSubmission.id, id));
        if (row.missionId) {
          await tx
            .update(writingMission)
            .set({ updatedAt: sql`now()` })
            .where(eq(writingMission.id, row.missionId));
        }
      });
    },

    async listErrors(submissionIds) {
      if (submissionIds.length === 0) return [];
      const rows = await db
        .select()
        .from(writingError)
        .where(inArray(writingError.submissionId, submissionIds))
        .orderBy(asc(writingError.createdAt), asc(writingError.id));
      return rows.map(toError);
    },

    async insertErrors(submissionId, errors) {
      if (errors.length === 0) return [];
      const rows = await db
        .insert(writingError)
        .values(
          errors.map((error) => ({
            submissionId,
            span: error.span,
            type: error.type,
            unitId: error.unitId,
            hint: error.hint,
            fixed: error.fixed,
          })),
        )
        .returning();
      return rows.map(toError);
    },

    async updateError(id, patch) {
      if (patch.span === undefined && patch.fixed === undefined) return;
      await db
        .update(writingError)
        .set({
          ...(patch.span ? { span: patch.span } : {}),
          ...(patch.fixed !== undefined ? { fixed: patch.fixed } : {}),
        })
        .where(eq(writingError.id, id));
    },

    async recentErrors(limit) {
      const rows = await db
        .select()
        .from(writingError)
        .orderBy(desc(writingError.createdAt), desc(writingError.id))
        .limit(limit);
      return rows.map(toError);
    },

    async insertEvent(type, payload) {
      await db.insert(event).values({ type, payload });
    },
  };
}
