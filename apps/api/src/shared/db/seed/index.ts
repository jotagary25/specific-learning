import type { Db } from "../client.ts";
import { loadAuthored } from "./load-authored.ts";
import { loadUnits } from "./load-content.ts";
import { type AuthoredSeedResult, seedAuthored } from "./seed-authored.ts";
import { type SeedResult, seedContent } from "./seed-content.ts";

export { mapAuthored } from "./map-authored.ts";
export { itemId, mapUnit } from "./map-unit.ts";
export type { AuthoredSeedResult } from "./seed-authored.ts";
export type { SeedResult } from "./seed-content.ts";

export type FullSeedResult = SeedResult & { authored: AuthoredSeedResult };

/**
 * Loads and validates the content folder (book units, then authored material), then upserts
 * it. Both file sets are validated before anything is written.
 */
export async function seed(db: Db, contentDir: string): Promise<FullSeedResult> {
  const [units, authored] = await Promise.all([loadUnits(contentDir), loadAuthored(contentDir)]);
  const book = await seedContent(db, units);
  return { ...book, authored: await seedAuthored(db, authored) };
}

export function formatSeedResult(r: SeedResult & { authored?: AuthoredSeedResult }): string {
  const changed = r.changed + (r.authored?.changed ?? 0);
  const authored = r.authored
    ? `, ${r.authored.chapters} story chapters, ${r.authored.timelineItems} timeline items, ` +
      `${r.authored.unitExtras} unit extras`
    : "";
  return (
    `seed: ${r.blocks} blocks, ${r.units} units, ${r.exercises} exercises, ${r.items} items` +
    `${authored} (${changed} rows written)`
  );
}
