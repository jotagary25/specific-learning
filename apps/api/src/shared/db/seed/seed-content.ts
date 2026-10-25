import type { Unit } from "@english-course/shared";
import { getTableColumns, type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Db } from "../client.ts";
import { block, exercise, exerciseItem, unit } from "../schema/index.ts";
import { type BlockRow, mapUnit, type UnitRows } from "./map-unit.ts";

export type SeedResult = {
  blocks: number;
  units: number;
  exercises: number;
  items: number;
  /** Rows inserted or whose content changed; 0 on an unchanged re-run. */
  changed: number;
};

/**
 * ON CONFLICT update of the given content columns from `excluded`, applied only when one of
 * them actually differs, so an unchanged re-run writes nothing. Other columns are left alone.
 */
function updateContent<T extends PgTable>(table: T, keys: (keyof T["$inferInsert"] & string)[]) {
  const columns = getTableColumns(table);
  const current: SQL[] = [];
  const incoming: SQL[] = [];
  const set: Record<string, SQL> = { updatedAt: sql`now()` };
  for (const key of keys) {
    const column = columns[key];
    if (!column) throw new Error(`Unknown column ${key}`);
    const excluded = sql.raw(`excluded."${column.name}"`);
    set[key] = excluded;
    current.push(sql`${column}`);
    incoming.push(excluded);
  }
  return {
    set,
    setWhere: sql`(${sql.join(current, sql`, `)}) is distinct from (${sql.join(incoming, sql`, `)})`,
  };
}

/**
 * Upserts content (blocks, units, exercises, items) by stable ids in one transaction.
 * Idempotent; never writes learner-progress columns or tables. Content rows that disappear
 * from the files are kept (deleting them would cascade to learner attempts).
 */
export async function seedContent(db: Db, units: Unit[]): Promise<SeedResult> {
  const mapped: UnitRows[] = units.map(mapUnit);
  const blocks = [...new Map<number, BlockRow>(mapped.map((m) => [m.block.id, m.block])).values()];
  const unitRows = mapped.map((m) => m.unit);
  const exerciseRows = mapped.flatMap((m) => m.exercises);
  const itemRows = mapped.flatMap((m) => m.items);

  const changed = await db.transaction(async (tx) => {
    let count = 0;
    if (blocks.length > 0) {
      const rows = await tx
        .insert(block)
        .values(blocks)
        .onConflictDoUpdate({
          target: block.id,
          ...updateContent(block, ["title", "unitFrom", "unitTo"]),
        })
        .returning({ id: block.id });
      count += rows.length;
    }
    if (unitRows.length > 0) {
      const rows = await tx
        .insert(unit)
        .values(unitRows)
        .onConflictDoUpdate({
          target: unit.id,
          ...updateContent(unit, ["blockId", "title", "subtitle", "theory"]),
        })
        .returning({ id: unit.id });
      count += rows.length;
    }
    if (exerciseRows.length > 0) {
      const rows = await tx
        .insert(exercise)
        .values(exerciseRows)
        .onConflictDoUpdate({
          target: exercise.id,
          ...updateContent(exercise, [
            "unitId",
            "position",
            "instruction",
            "evaluation",
            "wordBank",
            "passage",
            "answerNote",
          ]),
        })
        .returning({ id: exercise.id });
      count += rows.length;
    }
    if (itemRows.length > 0) {
      const rows = await tx
        .insert(exerciseItem)
        .values(itemRows)
        .onConflictDoUpdate({
          target: exerciseItem.id,
          ...updateContent(exerciseItem, [
            "exerciseId",
            "num",
            "position",
            "isExample",
            "isOpen",
            "lines",
            "answer",
          ]),
        })
        .returning({ id: exerciseItem.id });
      count += rows.length;
    }
    return count;
  });

  return {
    blocks: blocks.length,
    units: unitRows.length,
    exercises: exerciseRows.length,
    items: itemRows.length,
    changed,
  };
}
