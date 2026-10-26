import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Story, UnitExtrasFile, UnitTimelineFile } from "@english-course/shared";
import type { z } from "zod";
import type { AuthoredContent } from "./map-authored.ts";

async function readJson<T extends z.ZodType>(file: string, schema: T): Promise<z.infer<T>> {
  const raw: unknown = JSON.parse(await readFile(file, "utf8"));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid authored file ${file}: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** Directory entries, or [] when the directory does not exist. */
async function list(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/**
 * Reads `authored/block-N/story.json` and `authored/units/unit-NNN.{extras,timeline}.json`,
 * validated with the shared schemas. A missing `authored/` folder yields empty content.
 */
export async function loadAuthored(contentDir: string): Promise<AuthoredContent> {
  const root = join(contentDir, "authored");

  const blockDirs = (await list(root)).filter((name) => /^block-\d+$/.test(name));
  const stories: Story[] = [];
  for (const dir of blockDirs) {
    if ((await list(join(root, dir))).includes("story.json")) {
      stories.push(await readJson(join(root, dir, "story.json"), Story));
    }
  }

  const unitsDir = join(root, "units");
  const files = await list(unitsDir);
  const extras = await Promise.all(
    files
      .filter((f) => /^unit-\d{3}\.extras\.json$/.test(f))
      .map((f) => readJson(join(unitsDir, f), UnitExtrasFile)),
  );
  const timelines = await Promise.all(
    files
      .filter((f) => /^unit-\d{3}\.timeline\.json$/.test(f))
      .map((f) => readJson(join(unitsDir, f), UnitTimelineFile)),
  );

  return { stories, extras, timelines };
}
