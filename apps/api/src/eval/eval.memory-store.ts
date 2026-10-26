import { randomUUID } from "node:crypto";
import type { EvalRunState } from "@english-course/shared";
import type { EvalRunRecord, EvalStore } from "./eval.store.ts";

/** In-memory `EvalStore` for tests. */
export function createMemoryEvalStore(now: () => number = Date.now): EvalStore & {
  records: EvalRunRecord[];
} {
  const records: EvalRunRecord[] = [];
  const clone = (state: EvalRunState): EvalRunState => structuredClone(state);
  return {
    records,
    async create(model, state) {
      const record = { id: randomUUID(), model, createdAt: new Date(now()), state: clone(state) };
      records.push(record);
      return { ...record, state: clone(record.state) };
    },
    async save(id, state) {
      const record = records.find((r) => r.id === id);
      if (record) record.state = clone(state);
    },
    async get(id) {
      const record = records.find((r) => r.id === id);
      return record && { ...record, state: clone(record.state) };
    },
    async list(limit) {
      return [...records]
        .reverse()
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit)
        .map((r) => ({ ...r, state: clone(r.state) }));
    },
  };
}
