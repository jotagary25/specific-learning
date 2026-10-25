import type { Unit } from "@english-course/shared";
import type { block, exercise, exerciseItem, unit } from "../schema/index.ts";

export type BlockRow = typeof block.$inferInsert;
/** Only the content columns: learner progress (status, priority, completed_at) is never seeded. */
export type UnitRow = Pick<
  typeof unit.$inferInsert,
  "id" | "blockId" | "title" | "subtitle" | "theory"
>;
export type ExerciseRow = typeof exercise.$inferInsert;
export type ItemRow = typeof exerciseItem.$inferInsert;

export type UnitRows = {
  block: BlockRow;
  unit: UnitRow;
  exercises: ExerciseRow[];
  items: ItemRow[];
};

/** Stable item id: `<exercise code>-<item number>` ("1.1" + "2." → "1.1-2"). */
export function itemId(exerciseId: string, num: string): string {
  return `${exerciseId}-${num.replace(/\.$/, "")}`;
}

/** Maps one validated content unit to the rows of the content tables. Pure. */
export function mapUnit(content: Unit): UnitRows {
  const exercises: ExerciseRow[] = [];
  const items: ItemRow[] = [];

  content.exercises.forEach((ex, exercisePosition) => {
    exercises.push({
      id: ex.id,
      unitId: content.number,
      position: exercisePosition,
      instruction: ex.instruction,
      evaluation: ex.evaluation,
      wordBank: ex.wordBank ?? null,
      passage: ex.passage ?? null,
      answerNote: ex.answerNote ?? null,
    });

    ex.items.forEach((item, itemPosition) => {
      const answer = item.answer ?? null;
      items.push({
        id: itemId(ex.id, item.num),
        exerciseId: ex.id,
        num: item.num,
        position: itemPosition,
        isExample: item.isExample,
        isOpen: answer !== null && (answer.kind === "open" || answer.needsAi),
        lines: item.lines,
        answer,
      });
    });
  });

  return {
    block: {
      id: content.block.id,
      title: content.block.title,
      unitFrom: content.block.range.from,
      unitTo: content.block.range.to,
    },
    unit: {
      id: content.number,
      blockId: content.block.id,
      title: content.title,
      subtitle: content.subtitle,
      theory: content.theory,
    },
    exercises,
    items,
  };
}
