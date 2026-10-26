import { randomUUID } from "node:crypto";
import type { EvalRunState } from "@english-course/shared";
import type { EvalRunRecord, EvalStore } from "./eval.store.ts";

/** In-memory `EvalStore` for tests; runs are kept per user like the Drizzle store. */
export function createMemoryEvalStore(now: () => number = Date.now): EvalStore & {
  records: EvalRunRecord[];
} {
  const records: EvalRunRecord[] = [];
  const clone = (state: EvalRunState): EvalRunState => structuredClone(state);
  const copy = (record: EvalRunRecord) => ({ ...record, state: clone(record.state) });
  const newestFirst = (list: EvalRunRecord[], limit: number) =>
    [...list]
      .reverse()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map(copy);
  const find = (userId: string, id: string) =>
    records.find((r) => r.id === id && r.userId === userId);
  return {
    records,
    async create(userId, model, state) {
      const record = {
        id: randomUUID(),
        userId,
        model,
        createdAt: new Date(now()),
        state: clone(state),
      };
      records.push(record);
      return copy(record);
    },
    async save(userId, id, state) {
      const record = find(userId, id);
      if (record) record.state = clone(state);
    },
    async get(userId, id) {
      const record = find(userId, id);
      return record && copy(record);
    },
    async list(userId, limit) {
      return newestFirst(
        records.filter((r) => r.userId === userId),
        limit,
      );
    },
    async listAllUsers(limit) {
      return newestFirst(records, limit);
    },
  };
}
