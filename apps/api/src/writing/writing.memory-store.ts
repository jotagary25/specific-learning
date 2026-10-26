// In-memory WritingStore for tests. Single-learner fake: user ids are accepted and ignored
// (isolation is covered by the DB integration test).

import { randomUUID } from "node:crypto";
import type { Inspiration } from "@english-course/shared";
import type {
  ErrorRecord,
  MissionAggregate,
  MissionRecord,
  SubmissionRecord,
  UnitInfo,
  WritingStore,
} from "./writing.store.ts";

export type MemoryWritingStore = WritingStore & {
  units: UnitInfo[];
  reading: Array<Inspiration & { startedAt: Date }>;
  missions: MissionRecord[];
  submissions: SubmissionRecord[];
  errors: ErrorRecord[];
  events: Array<{ type: string; payload: Record<string, unknown> }>;
};

const clone = <T>(value: T): T => structuredClone(value);

export const sampleUnits = (): UnitInfo[] =>
  [
    [1, "Present Continuous", "(I am doing)"],
    [2, "Simple Present", "(I do)"],
    [5, "Simple Past", "(I did)"],
  ].map(([id, title, subtitle]) => ({
    id: id as number,
    title: title as string,
    subtitle: subtitle as string,
    completed: false,
    priority: 0,
    theory: [{ letter: "A", html: `<p>${title} theory.</p>` }],
  }));

export function createMemoryWritingStore(units: UnitInfo[] = sampleUnits()): MemoryWritingStore {
  const missions: MissionRecord[] = [];
  const submissions: SubmissionRecord[] = [];
  const errors: ErrorRecord[] = [];
  const events: MemoryWritingStore["events"] = [];
  const reading: MemoryWritingStore["reading"] = [];
  let tick = 0;
  const stamp = () => new Date(Date.UTC(2026, 9, 1) + ++tick * 1000);

  const aggregate = (mission: MissionRecord): MissionAggregate | undefined => {
    const submission = submissions.find((s) => s.missionId === mission.id);
    return submission ? clone({ mission, submission }) : undefined;
  };
  const newestFirst = () => [...missions].sort((a, b) => +b.createdAt - +a.createdAt);

  return {
    units,
    reading,
    missions,
    submissions,
    errors,
    events,

    async listUnits(_userId) {
      return clone([...units].sort((a, b) => a.id - b.id));
    },
    async raiseUnitPriority(_userId, unitId, by) {
      const found = units.find((u) => u.id === unitId);
      if (found) found.priority += by;
    },
    async recentReading(_userId, since, limit) {
      return reading
        .filter((r) => r.startedAt >= since)
        .sort((a, b) => +b.startedAt - +a.startedAt)
        .slice(0, limit)
        .map(({ title, opinion }) => ({ title, opinion }));
    },
    async activeMission(_userId) {
      const found = newestFirst().find((m) => m.status !== "done");
      return found ? aggregate(found) : undefined;
    },
    async getMission(_userId, id) {
      const found = missions.find((m) => m.id === id);
      return found ? aggregate(found) : undefined;
    },
    async listMissions(_userId) {
      return newestFirst().flatMap((m) => aggregate(m) ?? []);
    },
    async createMission(_userId, mission, submission) {
      const createdAt = stamp();
      const m: MissionRecord = {
        ...clone(mission),
        id: randomUUID(),
        createdAt,
        updatedAt: createdAt,
      };
      const s: SubmissionRecord = {
        ...clone(submission),
        id: randomUUID(),
        missionId: m.id,
        textFixed: null,
        scores: null,
        rewrites: [],
        createdAt: m.createdAt,
      };
      missions.push(m);
      submissions.push(s);
      return clone({ mission: m, submission: s });
    },
    async setMissionStatus(_userId, id, status) {
      const found = missions.find((m) => m.id === id);
      if (found) {
        found.status = status;
        found.updatedAt = stamp();
      }
    },
    async updateSubmission(_userId, id, patch) {
      const found = submissions.find((s) => s.id === id);
      if (!found) return;
      Object.assign(found, clone(patch));
      const mission = missions.find((m) => m.id === found.missionId);
      if (mission) mission.updatedAt = stamp();
    },
    async listErrors(_userId, submissionIds) {
      return clone(errors.filter((e) => submissionIds.includes(e.submissionId)));
    },
    async insertErrors(_userId, submissionId, rows) {
      const created = rows.map((row) => ({
        ...clone(row),
        id: randomUUID(),
        submissionId,
        createdAt: stamp(),
      }));
      errors.push(...created);
      return clone(created);
    },
    async updateError(_userId, id, patch) {
      const found = errors.find((e) => e.id === id);
      if (found) Object.assign(found, clone(patch));
    },
    async recentErrors(_userId, limit) {
      return clone([...errors].reverse().slice(0, limit));
    },
    async insertEvent(_userId, type, payload) {
      events.push({ type, payload: clone(payload) });
    },
  };
}
