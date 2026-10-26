import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../client.ts";
import { block, storyChapter, timelineItem, unit } from "../schema/index.ts";
import { type AuthoredContent, mapAuthored } from "./map-authored.ts";
import { updateContent } from "./seed-content.ts";

export type AuthoredSeedResult = {
  chapters: number;
  timelineItems: number;
  unitExtras: number;
  /** Rows inserted or whose content changed; 0 on an unchanged re-run. */
  changed: number;
};

/**
 * Upserts authored content (story chapters, timeline items, unit extras) in one transaction.
 * Runs after the book content seed, since every row references a seeded block or unit.
 * Idempotent; never touches learner-progress tables or columns.
 */
export async function seedAuthored(db: Db, content: AuthoredContent): Promise<AuthoredSeedResult> {
  const changed = await db.transaction(async (tx) => {
    const known = {
      blockIds: new Set((await tx.select({ id: block.id }).from(block)).map((r) => r.id)),
      unitIds: new Set((await tx.select({ id: unit.id }).from(unit)).map((r) => r.id)),
    };
    const rows = mapAuthored(content, known);
    let count = 0;

    if (rows.chapters.length > 0) {
      const written = await tx
        .insert(storyChapter)
        .values(rows.chapters)
        .onConflictDoUpdate({
          target: storyChapter.id,
          ...updateContent(
            storyChapter,
            [
              "blockId",
              "unitId",
              "position",
              "storyTitle",
              "title",
              "body",
              "grammarSpans",
              "teaser",
            ],
            { touchUpdatedAt: false },
          ),
        })
        .returning({ id: storyChapter.id });
      count += written.length;
    }

    if (rows.timelineItems.length > 0) {
      const written = await tx
        .insert(timelineItem)
        .values(rows.timelineItems)
        .onConflictDoUpdate({
          target: timelineItem.id,
          ...updateContent(timelineItem, ["unitId", "position", "sentence", "expectedShape"], {
            touchUpdatedAt: false,
          }),
        })
        .returning({ id: timelineItem.id });
      count += written.length;
    }

    for (const { unitId, extras } of rows.unitExtras) {
      const json = JSON.stringify(extras);
      const written = await tx
        .update(unit)
        .set({ extras, updatedAt: sql`now()` })
        .where(and(eq(unit.id, unitId), sql`${unit.extras} is distinct from ${json}::jsonb`))
        .returning({ id: unit.id });
      count += written.length;
    }

    return count;
  });

  return {
    chapters: content.stories.reduce((sum, s) => sum + s.chapters.length, 0),
    timelineItems: content.timelines.reduce((sum, t) => sum + t.items.length, 0),
    unitExtras: content.extras.length,
    changed,
  };
}
