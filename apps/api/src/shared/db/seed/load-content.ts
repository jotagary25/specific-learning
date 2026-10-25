import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Unit, UnitIndex } from "@english-course/shared";
import type { z } from "zod";

async function readJson<T extends z.ZodType>(file: string, schema: T): Promise<z.infer<T>> {
  const raw: unknown = JSON.parse(await readFile(file, "utf8"));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid content file ${file}: ${parsed.error.message}`);
  }
  return parsed.data;
}

/**
 * Reads `units/index.json` and every unit file it lists, validated with the shared content
 * schemas. Fails when a unit disagrees with the counts declared in the index.
 */
export async function loadUnits(contentDir: string): Promise<Unit[]> {
  const unitsDir = join(contentDir, "units");
  const index = await readJson(join(unitsDir, "index.json"), UnitIndex);

  return Promise.all(
    index.units.map(async (summary) => {
      const unit = await readJson(join(unitsDir, summary.file), Unit);
      const itemCount = unit.exercises.reduce((sum, ex) => sum + ex.items.length, 0);
      if (
        unit.number !== summary.number ||
        unit.exercises.length !== summary.exerciseCount ||
        itemCount !== summary.itemCount
      ) {
        throw new Error(
          `Content index mismatch for ${summary.file}: expected unit ${summary.number} with ` +
            `${summary.exerciseCount} exercises / ${summary.itemCount} items, found unit ` +
            `${unit.number} with ${unit.exercises.length} / ${itemCount}`,
        );
      }
      return unit;
    }),
  );
}
