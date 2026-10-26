import { EvalRunState, type ThinkValue } from "@english-course/shared";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../shared/db/client.ts";
import { evalRun } from "../shared/db/schema/index.ts";

export type EvalRunRecord = {
  id: string;
  userId: string;
  model: string;
  createdAt: Date;
  state: EvalRunState;
};

/**
 * Persistence of eval runs: one `eval_run` row per model config, state in `results`. Runs
 * belong to the user who started them.
 */
export interface EvalStore {
  create(userId: string, model: string, state: EvalRunState): Promise<EvalRunRecord>;
  save(userId: string, id: string, state: EvalRunState): Promise<void>;
  get(userId: string, id: string): Promise<EvalRunRecord | undefined>;
  /** The user's runs, newest first. */
  list(userId: string, limit: number): Promise<EvalRunRecord[]>;
  /** Every user's runs, newest first: only for start-up recovery of interrupted runs. */
  listAllUsers(limit: number): Promise<EvalRunRecord[]>;
}

/** `eval_run.effort` column: a readable copy of the think value (the source of truth is `results.think`). */
export const effortColumn = (think: ThinkValue): string | null =>
  think === null ? null : String(think);

type Row = typeof evalRun.$inferSelect;

function toRecord(row: Row): EvalRunRecord | undefined {
  const state = EvalRunState.safeParse(row.results);
  if (!state.success) return undefined;
  return {
    id: row.id,
    userId: row.userId,
    model: row.model,
    createdAt: row.createdAt,
    state: state.data,
  };
}

const UUID = /^[0-9a-f-]{36}$/i;

export function createDrizzleEvalStore(db: Db): EvalStore {
  return {
    async create(userId, model, state) {
      const [row] = await db
        .insert(evalRun)
        .values({ userId, model, effort: effortColumn(state.think), results: state })
        .returning();
      const record = row && toRecord(row);
      if (!record) throw new Error("eval: insert returned no row");
      return record;
    },
    async save(userId, id, state) {
      await db
        .update(evalRun)
        .set({ results: state })
        .where(and(eq(evalRun.userId, userId), eq(evalRun.id, id)));
    },
    async get(userId, id) {
      if (!UUID.test(id)) return undefined;
      const [row] = await db
        .select()
        .from(evalRun)
        .where(and(eq(evalRun.userId, userId), eq(evalRun.id, id)))
        .limit(1);
      return row && toRecord(row);
    },
    async list(userId, limit) {
      const rows = await db
        .select()
        .from(evalRun)
        .where(eq(evalRun.userId, userId))
        .orderBy(desc(evalRun.createdAt))
        .limit(limit);
      return rows.flatMap((row) => toRecord(row) ?? []);
    },
    async listAllUsers(limit) {
      const rows = await db.select().from(evalRun).orderBy(desc(evalRun.createdAt)).limit(limit);
      return rows.flatMap((row) => toRecord(row) ?? []);
    },
  };
}
