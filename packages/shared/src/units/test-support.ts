// Test-only helpers: load the real imported units 1–6 and look items up by "exercise#item".
import unit1 from "../../../../content/units/unit-001.json" with { type: "json" };
import unit2 from "../../../../content/units/unit-002.json" with { type: "json" };
import unit3 from "../../../../content/units/unit-003.json" with { type: "json" };
import unit4 from "../../../../content/units/unit-004.json" with { type: "json" };
import unit5 from "../../../../content/units/unit-005.json" with { type: "json" };
import unit6 from "../../../../content/units/unit-006.json" with { type: "json" };
import { type ExerciseItem, Unit } from "../content/index.ts";

export const realUnits: Unit[] = [unit1, unit2, unit3, unit4, unit5, unit6].map((raw) =>
  Unit.parse(raw),
);

export interface RealItem {
  id: string;
  item: ExerciseItem;
}

export const realItems: RealItem[] = realUnits.flatMap((unit) =>
  unit.exercises.flatMap((exercise) =>
    exercise.items.map((item) => ({ id: `${exercise.id}#${item.num.replace(".", "")}`, item })),
  ),
);

/** Looks up a real item by id, e.g. "1.1#2" (exercise 1.1, item 2). */
export function realItem(id: string): ExerciseItem {
  const found = realItems.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown item ${id}`);
  return found.item;
}
