import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Unit, UnitIndex } from "@english-course/shared";
import { contentFileName, DEFAULT_BOOK_DIR, importBook } from "./import-book.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

const USAGE = `Usage: pnpm import:book -- [--units 1-6|1,3,5-7|all] [--book <dir>] [--out <dir>]`;

function main(): number {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    options: {
      units: { type: "string", default: "1-6" },
      book: { type: "string", default: DEFAULT_BOOK_DIR },
      out: { type: "string", default: join(REPO_ROOT, "content") },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const bookDir = resolve(values.book);
  const outDir = resolve(values.out);
  const units = parseUnitSelection(values.units, bookDir);
  const result = importBook({ bookDir, units });

  // Validate everything before writing anything.
  const errors = [
    ...result.units.flatMap((unit) => issues(`unit ${unit.number}`, Unit.safeParse(unit))),
    ...issues("index", UnitIndex.safeParse(result.index)),
  ];
  if (errors.length > 0) {
    console.error(`Validation failed:\n${errors.join("\n")}`);
    return 1;
  }

  const unitsDir = join(outDir, "units");
  const imagesDir = join(outDir, "images");
  mkdirSync(unitsDir, { recursive: true });
  mkdirSync(imagesDir, { recursive: true });
  for (const unit of result.units) {
    writeJson(join(unitsDir, contentFileName(unit.number)), unit);
  }
  writeJson(join(unitsDir, "index.json"), result.index);
  for (const image of result.images) {
    copyFileSync(join(bookDir, "units", "img", image), join(imagesDir, image));
  }

  printSummary(result);
  return 0;
}

/** "1-6" | "1,3,5-7" | "all" → sorted unit numbers. */
function parseUnitSelection(selection: string, bookDir: string): number[] {
  if (selection === "all") {
    return readdirSync(join(bookDir, "units"))
      .map((file) => /^unit_(\d+)\.html$/.exec(file)?.[1])
      .filter((number): number is string => number !== undefined)
      .map(Number)
      .sort((a, b) => a - b);
  }
  const numbers = new Set<number>();
  for (const part of selection.split(",")) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!match) throw new Error(`Invalid --units value "${selection}". ${USAGE}`);
    const from = Number(match[1]);
    const to = Number(match[2] ?? match[1]);
    for (let number = from; number <= to; number++) numbers.add(number);
  }
  return [...numbers].sort((a, b) => a - b);
}

function issues(
  label: string,
  parsed: { success: boolean; error?: { issues: unknown[] } },
): string[] {
  if (parsed.success) return [];
  return (parsed.error?.issues ?? []).map((issue) => `  ${label}: ${JSON.stringify(issue)}`);
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function printSummary(result: ReturnType<typeof importBook>): void {
  const exercises = result.units.flatMap((unit) => unit.exercises);
  const items = exercises.flatMap((exercise) => exercise.items.map((item) => ({ exercise, item })));
  const graded = items.filter(({ item }) => !item.isExample);
  const needsAi = graded.filter(({ item }) => item.answer?.needsAi);

  console.log(
    [
      `units: ${result.units.length}`,
      `exercises: ${exercises.length}`,
      `items: ${items.length} (graded ${graded.length})`,
      `needsAi items: ${needsAi.length}`,
      `images: ${result.images.length}`,
    ].join(" · "),
  );
  for (const { exercise, item } of needsAi) {
    console.log(`  needsAi ${exercise.id} ${item.num} ${item.answer?.aiReason ?? ""}`);
  }
  for (const warning of result.warnings) console.warn(`  warning: ${warning}`);
}

process.exitCode = main();
