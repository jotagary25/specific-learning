// In-memory TodayStore for tests.

import { randomUUID } from "node:crypto";
import type { ParkingRecord, SessionRecord, TodayEvent, TodayStore } from "./today.store.ts";

export type MemoryTodayStore = TodayStore & {
  sessions: SessionRecord[];
  parking: ParkingRecord[];
  events: TodayEvent[];
  writingActivity: Date | undefined;
};

const clone = <T>(value: T): T => structuredClone(value);

export function createMemoryTodayStore(): MemoryTodayStore {
  const sessions: SessionRecord[] = [];
  const parking: ParkingRecord[] = [];
  const events: TodayEvent[] = [];
  let created = 0;

  const store: MemoryTodayStore = {
    sessions,
    parking,
    events,
    writingActivity: undefined,

    async createSession(session) {
      const record: SessionRecord = {
        ...clone(session),
        id: randomUUID(),
        endedAt: null,
        bonusMin: 0,
      };
      sessions.push(record);
      return clone(record);
    },

    async getSession(id) {
      const found = sessions.find((s) => s.id === id);
      return found && clone(found);
    },

    async listSessionsSince(since) {
      return sessions
        .filter((s) => s.startedAt.getTime() >= since.getTime())
        .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
        .map(clone);
    },

    async listOpenSessions() {
      return sessions.filter((s) => s.endedAt === null).map(clone);
    },

    async endSession(id, end, ev) {
      const found = sessions.find((s) => s.id === id);
      if (!found || found.endedAt !== null) return undefined;
      found.endedAt = end.endedAt;
      found.bonusMin = end.bonusMin;
      if (ev) events.push(clone(ev));
      return clone(found);
    },

    async listParking() {
      return [...parking]
        .sort(
          (a, b) =>
            Number(a.done) - Number(b.done) || b.createdAt.getTime() - a.createdAt.getTime(),
        )
        .map(clone);
    },

    async createParking(text) {
      // Strictly increasing timestamps keep "newest first" deterministic within one test.
      const record = { id: randomUUID(), text, done: false, createdAt: new Date(++created * 1000) };
      parking.push(record);
      return clone(record);
    },

    async updateParking(id, patch) {
      const found = parking.find((p) => p.id === id);
      if (!found) return undefined;
      Object.assign(found, patch);
      return clone(found);
    },

    async deleteParking(id) {
      const index = parking.findIndex((p) => p.id === id);
      if (index === -1) return false;
      parking.splice(index, 1);
      return true;
    },

    async lastWritingActivity() {
      return store.writingActivity;
    },
  };
  return store;
}
