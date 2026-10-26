import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveContentDir } from "../../../content/content-dir.ts";
import { loadAuthored } from "./load-authored.ts";
import { mapAuthored } from "./map-authored.ts";

describe("loadAuthored", () => {
  it("loads the real block 1 material and maps it onto units 1–6", async () => {
    const content = await loadAuthored(resolveContentDir());

    expect(content.stories.map((s) => s.blockId)).toEqual([1]);
    expect(content.extras.map((e) => e.unitId)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(content.timelines.map((t) => t.unitId)).toEqual([1, 2, 3, 4, 5, 6]);

    const rows = mapAuthored(content, {
      blockIds: new Set([1]),
      unitIds: new Set([1, 2, 3, 4, 5, 6]),
    });
    expect(rows.chapters).toHaveLength(6);
    expect(rows.unitExtras).toHaveLength(6);
    expect(rows.timelineItems).toHaveLength(30);
  });

  it("returns empty content when there is no authored folder", async () => {
    const dir = await mkdtemp(join(tmpdir(), "content-"));
    try {
      expect(await loadAuthored(dir)).toEqual({ stories: [], extras: [], timelines: [] });
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
