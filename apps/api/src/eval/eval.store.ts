import { EvalRunState, type ThinkValue } from "@english-course/shared";
import { desc, eq } from "drizzle-orm";
import type { Db } from "../shared/db/client.ts";
import { evalRun } from "../shared/db/schema/index.ts";

export type EvalRunRecord = {
  id: string;
  model: string;
  createdAt: Date;
  state: EvalRunState;
};

/** Persistence of eval runs: one `eval_run` row per model config, state in `results`. */
export interface EvalStore {
  create(model: string, state: EvalRunState): Promise<EvalRunRecord>;
  save(id: string, state: EvalRunState): Promise<void>;
  get(id: string): Promise<EvalRunRecord | undefined>;
  /** Newest first. */
  list(limit: number): Promise<EvalRunRecord[]>;
}

/** `eval_run.effort` column: a readable copy of the think value (the source of truth is `results.think`). */
export const effortColumn = (think: ThinkValue): string | null =>
  think === null ? null : String(think);

type Row = typeof evalRun.$inferSelect;

function toRecord(row: Row): EvalRunRecord | undefined {
  const state = EvalRunState.safeParse(row.results);
  if (!state.success) return undefined;
  return { id: row.id, model: row.model, createdAt: row.createdAt, state: state.data };
}

export function createDrizzleEvalStore(db: Db): EvalStore {
  return {
    async create(model, state) {
      const [row] = await db
        .insert(evalRun)
        .values({ model, effort: effortColumn(state.think), results: state })
        .returning();
      const record = row && toRecord(row);
      if (!record) throw new Error("eval: insert returned no row");
      return record;
    },
    async save(id, state) {
      await db.update(evalRun).set({ results: state }).where(eq(evalRun.id, id));
    },
    async get(id) {
      const [row] = await db.select().from(evalRun).where(eq(evalRun.id, id)).limit(1);
      return row && toRecord(row);
    },
    async list(limit) {
      const rows = await db.select().from(evalRun).orderBy(desc(evalRun.createdAt)).limit(limit);
      return rows.flatMap((row) => toRecord(row) ?? []);
    },
  };
}
