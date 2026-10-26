// In-memory WritingStore for tests.

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

    async listUnits() {
      return clone([...units].sort((a, b) => a.id - b.id));
    },
    async raiseUnitPriority(unitId, by) {
      const found = units.find((u) => u.id === unitId);
      if (found) found.priority += by;
    },
    async recentReading(since, limit) {
      return reading
        .filter((r) => r.startedAt >= since)
        .sort((a, b) => +b.startedAt - +a.startedAt)
        .slice(0, limit)
        .map(({ title, opinion }) => ({ title, opinion }));
    },
    async activeMission() {
      const found = newestFirst().find((m) => m.status !== "done");
      return found ? aggregate(found) : undefined;
    },
    async getMission(id) {
      const found = missions.find((m) => m.id === id);
      return found ? aggregate(found) : undefined;
    },
    async listMissions() {
      return newestFirst().flatMap((m) => aggregate(m) ?? []);
    },
    async createMission(mission, submission) {
      const m: MissionRecord = { ...clone(mission), id: randomUUID(), createdAt: stamp() };
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
    async setMissionStatus(id, status) {
      const found = missions.find((m) => m.id === id);
      if (found) found.status = status;
    },
    async updateSubmission(id, patch) {
      const found = submissions.find((s) => s.id === id);
      if (found) Object.assign(found, clone(patch));
    },
    async listErrors(submissionIds) {
      return clone(errors.filter((e) => submissionIds.includes(e.submissionId)));
    },
    async insertErrors(submissionId, rows) {
      const created = rows.map((row) => ({
        ...clone(row),
        id: randomUUID(),
        submissionId,
        createdAt: stamp(),
      }));
      errors.push(...created);
      return clone(created);
    },
    async updateError(id, patch) {
      const found = errors.find((e) => e.id === id);
      if (found) Object.assign(found, clone(patch));
    },
    async recentErrors(limit) {
      return clone([...errors].reverse().slice(0, limit));
    },
    async insertEvent(type, payload) {
      events.push({ type, payload: clone(payload) });
    },
  };
}
