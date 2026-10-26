import type {
  GrammarSpan,
  ItemAnswer,
  ItemCheckResult,
  Segment,
  TheorySection,
  TimelineExpected,
  UnitExtras,
  WordBankEntry,
} from "@english-course/shared";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../shared/db/client.ts";
import {
  type AttemptFeedback,
  attempt,
  block,
  canDo,
  doubt,
  event,
  exercise,
  exerciseItem,
  storyChapter,
  timelineItem,
  type UnitStatus,
  unit,
  unitProgress,
} from "../shared/db/schema/index.ts";

export type BlockRecord = { id: number; title: string };

export type UnitRecord = {
  id: number;
  blockId: number;
  title: string;
  subtitle: string;
  theory: TheorySection[];
  /** Authored extras; `null` when the unit has none yet. */
  extras: UnitExtras | null;
  status: UnitStatus;
  priority: number;
  completedAt: Date | null;
};

export type ExerciseRecord = {
  id: string;
  unitId: number;
  position: number;
  instruction: string;
  evaluation: "auto" | "ai";
  wordBank: WordBankEntry[] | null;
  passage: string | null;
  answerNote: string | null;
};

export type ItemRecord = {
  id: string;
  exerciseId: string;
  num: string;
  position: number;
  isExample: boolean;
  isOpen: boolean;
  lines: Segment[][];
  answer: ItemAnswer | null;
};

export type ChapterRecord = {
  id: string;
  blockId: number;
  unitId: number | null;
  position: number;
  /** Title of the serial story; null for rows seeded before T18. */
  storyTitle: string | null;
  title: string;
  body: string;
  grammarSpans: GrammarSpan[];
  teaser: string;
};

export type TimelineRecord = {
  id: string;
  unitId: number;
  position: number;
  sentence: string;
  expected: TimelineExpected;
  tolerance: number;
  explanationEs: string;
};

export type AttemptRecord = {
  itemId: string;
  unitId: number;
  inputs: string[];
  result: ItemCheckResult;
  method: "deterministic" | "ai";
  attemptNo: number;
  /** AI feedback returned with the attempt; null for deterministic checks. */
  feedback: AttemptFeedback | null;
  /** Highest hint level shown while this was the item's latest attempt (0 = none). */
  hintLevel: number;
  createdAt: Date;
};

export type ItemRef = { id: string; unitId: number; isExample: boolean };

export type NewAttempt = Omit<AttemptRecord, "createdAt" | "unitId" | "hintLevel">;

export type UnitContent = {
  unit: UnitRecord;
  block: BlockRecord;
  exercises: ExerciseRecord[];
  items: ItemRecord[];
  chapter: ChapterRecord | null;
  timeline: TimelineRecord[];
};

/**
 * Persistence port of the Units feature: shared book content plus one learner's attempts,
 * progress and completion side effects. Unit records carry the given user's progress.
 */
export interface UnitsStore {
  listBlocks(): Promise<BlockRecord[]>;
  listUnits(userId: string): Promise<UnitRecord[]>;
  /** Every exercise item with its unit (no content), for per-unit scores. */
  listItemRefs(): Promise<ItemRef[]>;
  getUnitContent(userId: string, unitId: number): Promise<UnitContent | undefined>;
  /** The user's attempts in creation order; all units when `unitId` is omitted. */
  listAttempts(userId: string, unitId?: number): Promise<AttemptRecord[]>;
  insertAttempt(userId: string, value: NewAttempt): Promise<void>;
  /**
   * Raises `hint_level` of the item's latest attempt to `level` (never lowers it). Returns false
   * when the item has no attempt yet: hints before the first attempt are not stored.
   */
  recordHintLevel(userId: string, itemId: string, level: number): Promise<boolean>;
  /** `new` → `in_progress`; other states are kept. */
  markInProgress(userId: string, unitId: number): Promise<void>;
  /**
   * Marks the unit completed, writes a `unit_completed` event and the can-do statements, in one
   * transaction, only when it was not completed before. Returns whether this call completed it.
   */
  completeUnit(
    userId: string,
    unitId: number,
    payload: Record<string, unknown>,
    canDoEs: string[],
  ): Promise<boolean>;
  insertDoubt(
    userId: string,
    text: string,
    context: Record<string, unknown>,
    explanation: string | null,
  ): Promise<void>;
}

type TimelineShape = { expected: TimelineExpected; tolerance: number; explanationEs: string };

type UnitRow = typeof unit.$inferSelect;
type ProgressRow = Pick<typeof unitProgress.$inferSelect, "status" | "priority" | "completedAt">;

function toUnitRecord(row: UnitRow, progress: ProgressRow | null): UnitRecord {
  const extras = row.extras as unknown as UnitExtras;
  return {
    id: row.id,
    blockId: row.blockId,
    title: row.title,
    subtitle: row.subtitle,
    theory: row.theory,
    extras: extras && "puzzle" in extras ? extras : null,
    // No progress row yet: the unit is new for this user.
    status: progress?.status ?? "new",
    priority: progress?.priority ?? 0,
    completedAt: progress?.completedAt ?? null,
  };
}

export function createDrizzleUnitsStore(db: Db): UnitsStore {
  /** Units with the user's progress (left join: missing progress reads as `new`). */
  const unitsWithProgress = (userId: string) =>
    db
      .select({
        unit,
        progress: {
          status: unitProgress.status,
          priority: unitProgress.priority,
          completedAt: unitProgress.completedAt,
        },
      })
      .from(unit)
      .leftJoin(
        unitProgress,
        and(eq(unitProgress.unitId, unit.id), eq(unitProgress.userId, userId)),
      );

  return {
    async listBlocks() {
      return db.select({ id: block.id, title: block.title }).from(block).orderBy(asc(block.id));
    },

    async listUnits(userId) {
      const rows = await unitsWithProgress(userId).orderBy(asc(unit.id));
      return rows.map((row) => toUnitRecord(row.unit, row.progress));
    },

    async listItemRefs() {
      return db
        .select({ id: exerciseItem.id, unitId: exercise.unitId, isExample: exerciseItem.isExample })
        .from(exerciseItem)
        .innerJoin(exercise, eq(exercise.id, exerciseItem.exerciseId));
    },

    async getUnitContent(userId, unitId) {
      const [found] = await unitsWithProgress(userId).where(eq(unit.id, unitId)).limit(1);
      if (!found) return undefined;
      const row = found.unit;
      const [blockRow] = await db
        .select({ id: block.id, title: block.title })
        .from(block)
        .where(eq(block.id, row.blockId));
      const exercises = await db
        .select()
        .from(exercise)
        .where(eq(exercise.unitId, unitId))
        .orderBy(asc(exercise.position));
      const items =
        exercises.length === 0
          ? []
          : await db
              .select()
              .from(exerciseItem)
              .where(
                inArray(
                  exerciseItem.exerciseId,
                  exercises.map((e) => e.id),
                ),
              )
              .orderBy(asc(exerciseItem.exerciseId), asc(exerciseItem.position));
      const [chapter] = await db
        .select()
        .from(storyChapter)
        .where(eq(storyChapter.unitId, unitId))
        .orderBy(asc(storyChapter.position))
        .limit(1);
      const timeline = await db
        .select()
        .from(timelineItem)
        .where(eq(timelineItem.unitId, unitId))
        .orderBy(asc(timelineItem.position));

      return {
        unit: toUnitRecord(row, found.progress),
        block: blockRow ?? { id: row.blockId, title: "" },
        exercises: exercises.map(({ updatedAt: _u, ...rest }) => rest),
        items: items.map(({ updatedAt: _u, ...rest }) => rest),
        chapter: chapter
          ? { ...chapter, grammarSpans: chapter.grammarSpans as unknown as GrammarSpan[] }
          : null,
        timeline: timeline.map((t) => {
          const shape = t.expectedShape as unknown as TimelineShape;
          return {
            id: t.id,
            unitId: t.unitId,
            position: t.position,
            sentence: t.sentence,
            expected: shape.expected,
            tolerance: shape.tolerance,
            explanationEs: shape.explanationEs,
          };
        }),
      };
    },

    async listAttempts(userId, unitId) {
      const rows = await db
        .select({
          itemId: attempt.itemId,
          unitId: exercise.unitId,
          inputs: attempt.answer,
          result: attempt.result,
          method: attempt.method,
          attemptNo: attempt.attemptNo,
          feedback: attempt.feedback,
          hintLevel: attempt.hintLevel,
          createdAt: attempt.createdAt,
        })
        .from(attempt)
        .innerJoin(exerciseItem, eq(exerciseItem.id, attempt.itemId))
        .innerJoin(exercise, eq(exercise.id, exerciseItem.exerciseId))
        .where(
          and(
            eq(attempt.userId, userId),
            unitId === undefined ? undefined : eq(exercise.unitId, unitId),
          ),
        )
        // uuidv7 ids are time-ordered: a stable tie-breaker for equal timestamps.
        .orderBy(asc(attempt.createdAt), asc(attempt.id));
      return rows;
    },

    async insertAttempt(userId, value) {
      await db.insert(attempt).values({
        userId,
        itemId: value.itemId,
        answer: value.inputs,
        result: value.result,
        correct: value.result.status === "correct",
        score: value.result.score,
        method: value.method,
        attemptNo: value.attemptNo,
        feedback: value.feedback,
      });
    },

    async recordHintLevel(userId, itemId, level) {
      const latest = db
        .select({ id: attempt.id })
        .from(attempt)
        .where(and(eq(attempt.userId, userId), eq(attempt.itemId, itemId)))
        .orderBy(desc(attempt.createdAt), desc(attempt.id))
        .limit(1);
      const rows = await db
        .update(attempt)
        .set({ hintLevel: sql`greatest(${attempt.hintLevel}, ${level})` })
        .where(inArray(attempt.id, latest))
        .returning({ id: attempt.id });
      return rows.length > 0;
    },

    async markInProgress(userId, unitId) {
      await db
        .insert(unitProgress)
        .values({ userId, unitId, status: "in_progress" })
        .onConflictDoUpdate({
          target: [unitProgress.userId, unitProgress.unitId],
          set: { status: "in_progress", updatedAt: sql`now()` },
          setWhere: eq(unitProgress.status, "new"),
        });
    },

    async completeUnit(userId, unitId, payload, canDoEs) {
      return db.transaction(async (tx) => {
        const completed = await tx
          .insert(unitProgress)
          .values({ userId, unitId, status: "completed", completedAt: sql`now()` })
          .onConflictDoUpdate({
            target: [unitProgress.userId, unitProgress.unitId],
            set: { status: "completed", completedAt: sql`now()`, updatedAt: sql`now()` },
            setWhere: isNull(unitProgress.completedAt),
          })
          .returning({ unitId: unitProgress.unitId });
        if (completed.length === 0) return false;
        await tx
          .insert(event)
          .values({ userId, type: "unit_completed", payload: { unitId, ...payload } });
        if (canDoEs.length > 0) {
          await tx
            .insert(canDo)
            .values(canDoEs.map((text) => ({ userId, text, source: "suggested" as const })));
        }
        return true;
      });
    },

    async insertDoubt(userId, text, context, explanation) {
      await db.insert(doubt).values({ userId, text, context, explanation });
    },
  };
}
