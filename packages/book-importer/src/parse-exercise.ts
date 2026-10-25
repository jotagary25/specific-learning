import type { Exercise, ExerciseItem, Segment, WordBankEntry } from "@english-course/shared";
import type { CheerioAPI } from "cheerio";
import { type AnyNode, type Element, isTag, isText } from "domhandler";
import { parseAnswer } from "./parse-answer.ts";
import { type SanitizeOptions, sanitizeNodes } from "./sanitize-html.ts";

/** One exercise of `answers_data.js`: `{ items: [{ num: "2.", ans: "…" }], note?: "…" }`. */
export interface ExerciseAnswers {
  items: { num: string; ans: string }[];
  note?: string;
}

export interface ExerciseContext extends SanitizeOptions {
  answers: ExerciseAnswers | undefined;
  warn: (message: string) => void;
}

const OPEN_NOTE = /example answers|answers will vary/i;
const ITEM_NUMBER = /^\d+\.$/;

export function parseExercise($: CheerioAPI, block: Element, context: ExerciseContext): Exercise {
  const id = collapse($(block).find(".exercise-number").first().text());
  const instruction = collapse($(block).find(".exercise-instruction").first().text());
  const note = context.answers?.note?.trim();
  const open = OPEN_NOTE.test(note ?? "");

  const items = rawItems($, block).map(({ num, nodes }) =>
    buildItem(id, num, nodes, { ...context, open }),
  );

  const exercise: Exercise = {
    id,
    instruction,
    evaluation: open ? "ai" : "auto",
    items,
  };
  const wordBank = parseWordBank($, block);
  if (wordBank.length > 0) exercise.wordBank = wordBank;
  const passage = parsePassage($, block, context);
  if (passage) exercise.passage = passage;
  if (note) exercise.answerNote = note;

  const nums = new Set(items.map((item) => item.num));
  for (const answer of context.answers?.items ?? []) {
    if (!nums.has(answer.num)) context.warn(`${id} ${answer.num}: answer has no matching item`);
  }
  return exercise;
}

interface RawItem {
  num: string;
  nodes: AnyNode[];
}

/** Items come from `li.exercise-item`, or from numbered dialogue paragraphs (e.g., 1.3). */
function rawItems($: CheerioAPI, block: Element): RawItem[] {
  const listItems = $(block).find(".exercise-item").toArray();
  if (listItems.length > 0) {
    return listItems.map((li) => ({
      num: collapse($(li).find(".item-index").first().text()),
      nodes: $(li).find(".item-content").first().contents().toArray(),
    }));
  }
  return $(block)
    .find("p")
    .toArray()
    .filter((p) => isDialogueParagraph($, p))
    .map((p) => {
      const [label, ...nodes] = trimLeadingWhitespace($(p).contents().toArray());
      return { num: collapse($(label).text()), nodes };
    });
}

function isDialogueParagraph($: CheerioAPI, p: Element): boolean {
  const first = trimLeadingWhitespace($(p).contents().toArray())[0];
  return (
    first !== undefined &&
    isTag(first) &&
    first.name === "strong" &&
    ITEM_NUMBER.test(collapse($(first).text()))
  );
}

function trimLeadingWhitespace(nodes: AnyNode[]): AnyNode[] {
  const start = nodes.findIndex((node) => !(isText(node) && node.data.trim() === ""));
  return start === -1 ? [] : nodes.slice(start);
}

function buildItem(
  exerciseId: string,
  num: string,
  nodes: AnyNode[],
  context: ExerciseContext & { open: boolean },
): ExerciseItem {
  const lines = itemLines(nodes, `${exerciseId}-${num.replace(/\.$/, "")}`);
  const segments = lines.flat();
  const blankCount = segments.filter((segment) => segment.type === "blank").length;
  const isExample = blankCount === 0 && segments.some((segment) => segment.type === "example");
  const item: ExerciseItem = { num, isExample, lines };
  if (isExample) return item;

  const key = context.answers?.items.find((answer) => answer.num === num);
  if (!key) {
    context.warn(`${exerciseId} ${num}: no answer in the key`);
    return item;
  }
  item.answer = parseAnswer(key.ans, {
    blankCount,
    hasUnderline: segments.some((segment) => segment.type === "underline"),
    open: context.open,
  });
  return item;
}

/** Walks item content into lines of segments; `<br>` starts a new line. */
function itemLines(nodes: AnyNode[], blankIdPrefix: string): Segment[][] {
  const lines: Segment[][] = [[]];
  let blanks = 0;
  const push = (segment: Segment) => lines[lines.length - 1]?.push(segment);

  const walk = (node: AnyNode): void => {
    if (isText(node)) {
      push({ type: "text", text: node.data });
      return;
    }
    if (!isTag(node)) return;
    const classes = (node.attribs.class ?? "").split(/\s+/);
    if (node.name === "br") {
      lines.push([]);
    } else if (classes.includes("blank-line")) {
      blanks += 1;
      push({
        type: "blank",
        id: `${blankIdPrefix}-${blanks}`,
        size: classes.includes("long") ? "long" : "short",
      });
    } else if (classes.includes("example-answer")) {
      push({ type: "example", text: collapse(textOf(node)) });
    } else if (node.name === "u") {
      push({ type: "underline", text: collapse(textOf(node)) });
    } else {
      node.children.forEach(walk);
    }
  };
  nodes.forEach(walk);
  return lines.map(tidyLine).filter((line) => line.length > 0);
}

/** Merges adjacent text, collapses whitespace, trims line edges and drops empty segments. */
function tidyLine(line: Segment[]): Segment[] {
  const merged: Segment[] = [];
  for (const segment of line) {
    const previous = merged[merged.length - 1];
    if (segment.type === "text" && previous?.type === "text") {
      previous.text += segment.text;
    } else {
      merged.push({ ...segment });
    }
  }
  merged.forEach((segment, index) => {
    if (segment.type !== "text") return;
    let text = segment.text.replace(/\s+/g, " ");
    if (index === 0) text = text.trimStart();
    if (index === merged.length - 1) text = text.trimEnd();
    segment.text = text;
  });
  return merged.filter((segment) => segment.type !== "text" || segment.text.length > 0);
}

function parseWordBank($: CheerioAPI, block: Element): WordBankEntry[] {
  return $(block)
    .find(".word-bank-item")
    .toArray()
    .map((entry) => ({ text: collapse($(entry).text()), used: $(entry).hasClass("used") }))
    .filter((entry) => entry.text.length > 0);
}

/** Extra content in the block (reading text, context lines), e.g., 5.1 and 5.3. */
function parsePassage($: CheerioAPI, block: Element, options: SanitizeOptions): string | undefined {
  const clone = $(block).clone();
  clone.find(".exercise-title-row, .word-bank, .exercise-list").remove();
  clone.find("p").each((_, p) => {
    if (isDialogueParagraph($, p)) $(p).remove();
  });
  if (collapse(clone.text()) === "") return undefined;
  return sanitizeNodes(clone.contents().toArray(), options).trim();
}

function textOf(node: Element): string {
  return node.children
    .map((child) => (isText(child) ? child.data : isTag(child) ? textOf(child) : ""))
    .join("");
}

export function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
