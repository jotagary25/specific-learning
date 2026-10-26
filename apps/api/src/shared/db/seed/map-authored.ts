import type { Story, UnitExtras, UnitExtrasFile, UnitTimelineFile } from "@english-course/shared";
import type { storyChapter, timelineItem } from "../schema/index.ts";

/** Validated files from `content/authored/` (see packages/shared/src/content/authored.ts). */
export type AuthoredContent = {
  stories: Story[];
  extras: UnitExtrasFile[];
  timelines: UnitTimelineFile[];
};

export type StoryChapterRow = typeof storyChapter.$inferInsert;
export type TimelineItemRow = typeof timelineItem.$inferInsert;
export type UnitExtrasRow = { unitId: number; extras: UnitExtras };

export type AuthoredRows = {
  chapters: StoryChapterRow[];
  timelineItems: TimelineItemRow[];
  unitExtras: UnitExtrasRow[];
};

/** Ids already present in the content tables; authored rows must reference them (FKs). */
export type KnownContent = { blockIds: ReadonlySet<number>; unitIds: ReadonlySet<number> };

function requireUnit(known: KnownContent, unitId: number, where: string): void {
  if (!known.unitIds.has(unitId)) {
    throw new Error(`Authored ${where} references unit ${unitId}, which is not seeded`);
  }
}

/**
 * Maps authored content to rows of story_chapter, timeline_item and unit.extras. Pure; throws on
 * dangling unit/block references, grammar spans missing from their chapter, or duplicate ids.
 */
export function mapAuthored(content: AuthoredContent, known: KnownContent): AuthoredRows {
  const chapters: StoryChapterRow[] = [];
  for (const story of content.stories) {
    if (!known.blockIds.has(story.blockId)) {
      throw new Error(
        `Authored story "${story.title}" references block ${story.blockId}, which is not seeded`,
      );
    }
    for (const chapter of story.chapters) {
      requireUnit(known, chapter.unitId, `chapter ${chapter.id}`);
      const missing = chapter.grammarSpans.find((span) => !chapter.body.includes(span.text));
      if (missing) {
        throw new Error(`Chapter ${chapter.id}: grammar span "${missing.text}" is not in the body`);
      }
      chapters.push({
        id: chapter.id,
        blockId: story.blockId,
        unitId: chapter.unitId,
        position: chapter.position,
        title: chapter.title,
        body: chapter.body,
        grammarSpans: chapter.grammarSpans,
        teaser: chapter.teaser,
      });
    }
  }

  const timelineItems: TimelineItemRow[] = [];
  const seen = new Set<string>();
  for (const file of content.timelines) {
    requireUnit(known, file.unitId, "timeline");
    file.items.forEach((item, position) => {
      if (seen.has(item.id)) throw new Error(`Duplicate timeline item id ${item.id}`);
      seen.add(item.id);
      timelineItems.push({
        id: item.id,
        unitId: file.unitId,
        position,
        sentence: item.sentence,
        // The column holds everything the drag check and its feedback need.
        expectedShape: {
          expected: item.expected,
          tolerance: item.tolerance,
          explanationEs: item.explanationEs,
        },
      });
    });
  }

  const unitExtras: UnitExtrasRow[] = content.extras.map(({ unitId, ...extras }) => {
    requireUnit(known, unitId, "extras");
    return { unitId, extras };
  });

  return { chapters, timelineItems, unitExtras };
}
