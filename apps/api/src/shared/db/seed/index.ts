import type { Db } from "../client.ts";
import { loadUnits } from "./load-content.ts";
import { type SeedResult, seedContent } from "./seed-content.ts";

export { itemId, mapUnit } from "./map-unit.ts";
export type { SeedResult } from "./seed-content.ts";

/** Loads and validates the content folder, then upserts it. */
export async function seed(db: Db, contentDir: string): Promise<SeedResult> {
  return seedContent(db, await loadUnits(contentDir));
}

export function formatSeedResult(r: SeedResult): string {
  return `seed: ${r.blocks} blocks, ${r.units} units, ${r.exercises} exercises, ${r.items} items (${r.changed} rows written)`;
}
