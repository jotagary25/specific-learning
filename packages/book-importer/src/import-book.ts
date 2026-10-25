import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Block, TheorySection, Unit, UnitIndex } from "@english-course/shared";
import { load } from "cheerio";
import { collapse, type ExerciseAnswers, parseExercise } from "./parse-exercise.ts";
import { sanitizeNodes } from "./sanitize-html.ts";

/** The book lives next to this repository (spec §9). */
export const DEFAULT_BOOK_DIR = resolve(
  import.meta.dirname,
  "../../../../english-intermediate-book",
);

type BookAnswers = Record<string, Record<string, ExerciseAnswers>>;

export interface ImportOptions {
  bookDir: string;
  units: number[];
}

export interface ImportResult {
  units: Unit[];
  index: UnitIndex;
  /** Image file names (in `units/img/`) referenced by the imported units. */
  images: string[];
  /** Items or answers that could not be classified. */
  warnings: string[];
}

/** Converts book units into content objects. Pure: reads the book, writes nothing. */
export function importBook({ bookDir, units: numbers }: ImportOptions): ImportResult {
  const answers = readAnswers(bookDir);
  const blocks = readBlocks(bookDir);
  const images = new Set<string>();
  const warnings: string[] = [];

  const units = numbers.map((number) =>
    parseUnit(number, {
      html: readFileSync(join(bookDir, "units", unitFileName(number)), "utf8"),
      answers: answers[String(number)] ?? {},
      block: blockFor(blocks, number),
      onImage: (file) => images.add(file),
      warn: (message) => warnings.push(`unit ${number}: ${message}`),
    }),
  );

  const index: UnitIndex = {
    units: units.map((unit) => ({
      number: unit.number,
      title: unit.title,
      subtitle: unit.subtitle,
      block: unit.block,
      file: contentFileName(unit.number),
      exerciseCount: unit.exercises.length,
      itemCount: unit.exercises.reduce((sum, exercise) => sum + exercise.items.length, 0),
    })),
  };
  return { units, index, images: [...images].sort(), warnings };
}

export function unitFileName(number: number): string {
  return `unit_${String(number).padStart(3, "0")}.html`;
}

export function contentFileName(number: number): string {
  return `unit-${String(number).padStart(3, "0")}.json`;
}

interface UnitSource {
  html: string;
  answers: Record<string, ExerciseAnswers>;
  block: Block;
  onImage: (file: string) => void;
  warn: (message: string) => void;
}

function parseUnit(number: number, source: UnitSource): Unit {
  const $ = load(source.html);
  const theoryPage = $("article.page-left");
  const exercisePage = $("article.page-right");

  const theory: TheorySection[] = theoryPage
    .find("section.lesson-section")
    .toArray()
    .map((section) => ({
      letter: collapse($(section).find(".section-tab").first().text()),
      html: sanitizeNodes(
        $(section).find(".section-content").first().contents().toArray(),
        source,
      ).trim(),
    }));

  const exercises = exercisePage
    .find(".exercise-block")
    .toArray()
    .map((block) => {
      const id = collapse($(block).find(".exercise-number").first().text());
      return parseExercise($, block, { ...source, answers: source.answers[id] });
    });

  return {
    number,
    title: collapse(theoryPage.find(".unit-title-group h2").first().text()),
    subtitle: collapse(theoryPage.find(".unit-title-group .subtitle").first().text()),
    block: source.block,
    theory,
    exercises,
  };
}

/** `js/answers_data.js` is `window.BOOK_ANSWERS = {…};` — keep the JSON object. */
function readAnswers(bookDir: string): BookAnswers {
  const script = readFileSync(join(bookDir, "js", "answers_data.js"), "utf8");
  return JSON.parse(script.slice(script.indexOf("{"), script.lastIndexOf("}") + 1)) as BookAnswers;
}

/** Blocks come from the index categories, e.g., "Present and Past (Units 1 – 6)". */
function readBlocks(bookDir: string): Block[] {
  const $ = load(readFileSync(join(bookDir, "index.html"), "utf8"));
  return $(".category-card .category-title")
    .toArray()
    .flatMap((title, index) => {
      const match = /^(.+?)\s*\(Units?\s+(\d+)\s*[–-]\s*(\d+)\)$/.exec(collapse($(title).text()));
      if (!match) return [];
      const [, name = "", from = "0", to = "0"] = match;
      return [{ id: index + 1, title: name, range: { from: Number(from), to: Number(to) } }];
    });
}

function blockFor(blocks: Block[], unit: number): Block {
  const block = blocks.find(({ range }) => unit >= range.from && unit <= range.to);
  if (!block) throw new Error(`Unit ${unit} is not in any block of the book index`);
  return block;
}
