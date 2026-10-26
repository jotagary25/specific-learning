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
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../shared/db/client.ts";
import {
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
  createdAt: Date;
};

export type ItemRef = { id: string; unitId: number; isExample: boolean };

export type NewAttempt = Omit<AttemptRecord, "createdAt" | "unitId">;

export type UnitContent = {
  unit: UnitRecord;
  block: BlockRecord;
  exercises: ExerciseRecord[];
  items: ItemRecord[];
  chapter: ChapterRecord | null;
  timeline: TimelineRecord[];
};

/** Persistence port of the Units feature: book content, learner attempts, completion side effects. */
export interface UnitsStore {
  listBlocks(): Promise<BlockRecord[]>;
  listUnits(): Promise<UnitRecord[]>;
  /** Every exercise item with its unit (no content), for per-unit scores. */
  listItemRefs(): Promise<ItemRef[]>;
  getUnitContent(unitId: number): Promise<UnitContent | undefined>;
  /** Attempts in creation order; all units when `unitId` is omitted. */
  listAttempts(unitId?: number): Promise<AttemptRecord[]>;
  insertAttempt(value: NewAttempt): Promise<void>;
  /** `new` → `in_progress`; other states are kept. */
  markInProgress(unitId: number): Promise<void>;
  /**
   * Marks the unit completed, writes a `unit_completed` event and the can-do statements, in one
   * transaction, only when it was not completed before. Returns whether this call completed it.
   */
  completeUnit(
    unitId: number,
    payload: Record<string, unknown>,
    canDoEs: string[],
  ): Promise<boolean>;
  insertDoubt(text: string, context: Record<string, unknown>): Promise<void>;
}

type TimelineShape = { expected: TimelineExpected; tolerance: number; explanationEs: string };

function toUnitRecord(row: typeof unit.$inferSelect): UnitRecord {
  const extras = row.extras as unknown as UnitExtras;
  return {
    id: row.id,
    blockId: row.blockId,
    title: row.title,
    subtitle: row.subtitle,
    theory: row.theory,
    extras: extras && "puzzle" in extras ? extras : null,
    status: row.status,
    priority: row.priority,
    completedAt: row.completedAt,
  };
}

export function createDrizzleUnitsStore(db: Db): UnitsStore {
  return {
    async listBlocks() {
      return db.select({ id: block.id, title: block.title }).from(block).orderBy(asc(block.id));
    },

    async listUnits() {
      return (await db.select().from(unit).orderBy(asc(unit.id))).map(toUnitRecord);
    },

    async listItemRefs() {
      return db
        .select({ id: exerciseItem.id, unitId: exercise.unitId, isExample: exerciseItem.isExample })
        .from(exerciseItem)
        .innerJoin(exercise, eq(exercise.id, exerciseItem.exerciseId));
    },

    async getUnitContent(unitId) {
      const [row] = await db.select().from(unit).where(eq(unit.id, unitId)).limit(1);
      if (!row) return undefined;
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
        unit: toUnitRecord(row),
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

    async listAttempts(unitId) {
      const rows = await db
        .select({
          itemId: attempt.itemId,
          unitId: exercise.unitId,
          inputs: attempt.answer,
          result: attempt.result,
          method: attempt.method,
          attemptNo: attempt.attemptNo,
          createdAt: attempt.createdAt,
        })
        .from(attempt)
        .innerJoin(exerciseItem, eq(exerciseItem.id, attempt.itemId))
        .innerJoin(exercise, eq(exercise.id, exerciseItem.exerciseId))
        .where(unitId === undefined ? undefined : eq(exercise.unitId, unitId))
        // uuidv7 ids are time-ordered: a stable tie-breaker for equal timestamps.
        .orderBy(asc(attempt.createdAt), asc(attempt.id));
      return rows;
    },

    async insertAttempt(value) {
      await db.insert(attempt).values({
        itemId: value.itemId,
        answer: value.inputs,
        result: value.result,
        correct: value.result.status === "correct",
        score: value.result.score,
        method: value.method,
        attemptNo: value.attemptNo,
      });
    },

    async markInProgress(unitId) {
      await db
        .update(unit)
        .set({ status: "in_progress", updatedAt: sql`now()` })
        .where(and(eq(unit.id, unitId), eq(unit.status, "new")));
    },

    async completeUnit(unitId, payload, canDoEs) {
      return db.transaction(async (tx) => {
        const updated = await tx
          .update(unit)
          .set({ status: "completed", completedAt: sql`now()`, updatedAt: sql`now()` })
          .where(and(eq(unit.id, unitId), isNull(unit.completedAt)))
          .returning({ id: unit.id });
        if (updated.length === 0) return false;
        await tx.insert(event).values({ type: "unit_completed", payload: { unitId, ...payload } });
        if (canDoEs.length > 0) {
          await tx
            .insert(canDo)
            .values(canDoEs.map((text) => ({ text, source: "suggested" as const })));
        }
        return true;
      });
    },

    async insertDoubt(text, context) {
      await db.insert(doubt).values({ text, context });
    },
  };
}
