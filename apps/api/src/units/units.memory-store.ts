// In-memory UnitsStore for tests, built from the real content folder through the seed mappers.
import type { TimelineExpected, UnitExtras } from "@english-course/shared";
import { resolveContentDir } from "../content/content-dir.ts";
import { mapAuthored, mapUnit } from "../shared/db/seed/index.ts";
import { loadAuthored } from "../shared/db/seed/load-authored.ts";
import { loadUnits } from "../shared/db/seed/load-content.ts";
import type {
  AttemptRecord,
  BlockRecord,
  ChapterRecord,
  ExerciseRecord,
  ItemRecord,
  TimelineRecord,
  UnitRecord,
  UnitsStore,
} from "./units.store.ts";

export type MemoryUnitsStore = UnitsStore & {
  units: Map<number, UnitRecord>;
  attempts: AttemptRecord[];
  events: Array<{ type: string; payload: Record<string, unknown> }>;
  canDos: Array<{ text: string; source: "learner" | "suggested" }>;
  doubts: Array<{ text: string; context: Record<string, unknown> }>;
};

export async function createMemoryUnitsStore(
  contentDir = resolveContentDir(),
): Promise<MemoryUnitsStore> {
  const [contentUnits, authored] = await Promise.all([
    loadUnits(contentDir),
    loadAuthored(contentDir),
  ]);
  const blocks = new Map<number, BlockRecord>();
  const units = new Map<number, UnitRecord>();
  const exercises: ExerciseRecord[] = [];
  const items: ItemRecord[] = [];

  for (const content of contentUnits) {
    const rows = mapUnit(content);
    blocks.set(rows.block.id, { id: rows.block.id, title: rows.block.title });
    units.set(rows.unit.id, {
      ...rows.unit,
      extras: null,
      status: "new",
      priority: 0,
      completedAt: null,
    });
    for (const e of rows.exercises) {
      exercises.push({
        id: e.id,
        unitId: e.unitId,
        position: e.position,
        instruction: e.instruction,
        evaluation: e.evaluation,
        wordBank: e.wordBank ?? null,
        passage: e.passage ?? null,
        answerNote: e.answerNote ?? null,
      });
    }
    for (const i of rows.items) items.push({ ...i, answer: i.answer ?? null });
  }

  const authoredRows = mapAuthored(authored, {
    blockIds: new Set(blocks.keys()),
    unitIds: new Set(units.keys()),
  });
  for (const { unitId, extras } of authoredRows.unitExtras) {
    const record = units.get(unitId);
    if (record) record.extras = extras as UnitExtras;
  }
  const chapters: ChapterRecord[] = authoredRows.chapters.map((c) => ({
    id: c.id,
    blockId: c.blockId,
    unitId: c.unitId ?? null,
    position: c.position,
    title: c.title,
    body: c.body,
    grammarSpans: c.grammarSpans as ChapterRecord["grammarSpans"],
    teaser: c.teaser,
  }));
  const timeline: TimelineRecord[] = authoredRows.timelineItems.map((t) => {
    const shape = t.expectedShape as {
      expected: TimelineExpected;
      tolerance: number;
      explanationEs: string;
    };
    return {
      id: t.id,
      unitId: t.unitId,
      position: t.position,
      sentence: t.sentence,
      ...shape,
    };
  });

  const unitOfItem = (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    return exercises.find((e) => e.id === item?.exerciseId)?.unitId ?? 0;
  };

  const store: MemoryUnitsStore = {
    units,
    attempts: [],
    events: [],
    canDos: [],
    doubts: [],
    listBlocks: async () => [...blocks.values()],
    listUnits: async () => [...units.values()].sort((a, b) => a.id - b.id),
    listItemRefs: async () =>
      items.map((i) => ({ id: i.id, unitId: unitOfItem(i.id), isExample: i.isExample })),
    async getUnitContent(unitId) {
      const record = units.get(unitId);
      if (!record) return undefined;
      const unitExercises = exercises.filter((e) => e.unitId === unitId);
      const ids = new Set(unitExercises.map((e) => e.id));
      return {
        unit: { ...record },
        block: blocks.get(record.blockId) ?? { id: record.blockId, title: "" },
        exercises: unitExercises,
        items: items.filter((i) => ids.has(i.exerciseId)),
        chapter: chapters.find((c) => c.unitId === unitId) ?? null,
        timeline: timeline.filter((t) => t.unitId === unitId),
      };
    },
    listAttempts: async (unitId) =>
      store.attempts.filter((a) => unitId === undefined || a.unitId === unitId),
    async insertAttempt(value) {
      store.attempts.push({
        ...structuredClone(value),
        unitId: unitOfItem(value.itemId),
        createdAt: new Date(),
      });
    },
    async markInProgress(unitId) {
      const record = units.get(unitId);
      if (record?.status === "new") record.status = "in_progress";
    },
    async completeUnit(unitId, payload, canDoEs) {
      const record = units.get(unitId);
      if (!record || record.completedAt) return false;
      record.status = "completed";
      record.completedAt = new Date();
      store.events.push({ type: "unit_completed", payload: { unitId, ...payload } });
      for (const text of canDoEs) store.canDos.push({ text, source: "suggested" });
      return true;
    },
    async insertDoubt(text, context) {
      store.doubts.push({ text, context });
    },
  };
  return store;
}
