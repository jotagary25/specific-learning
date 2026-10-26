// The tutor's tools: zod-validated thin adapters over the other features' services.
import { PARKING_TEXT_MAX, type TutorContext, type TutorToolUse } from "@english-course/shared";
import { z } from "zod";
import type { Progress } from "../progress/progress.service.ts";
import { renderItemLines } from "../prompts/shared.ts";
import type { Reading } from "../reading/reading.service.ts";
import type { ToolDefinition } from "../shared/llm/types.ts";
import type { Today } from "../today/today.service.ts";
import { type Units, UnitsError } from "../units/units.service.ts";
import type { Vocabulary } from "../vocabulary/vocabulary.service.ts";
import type { VocabularyStore } from "../vocabulary/vocabulary.store.ts";

/** Tool results are cut to this many characters before they go back to the model. */
export const MAX_TOOL_RESULT_CHARS = 4000;

export type TutorToolDeps = {
  units?: Pick<Units, "detail" | "answers">;
  reading?: Pick<Reading, "today" | "detail">;
  vocabulary?: Pick<Vocabulary, "list">;
  progress?: Pick<Progress, "summary" | "errors">;
  today?: Pick<Today, "addParking">;
  /**
   * Word cards. The vocabulary service only creates word cards from a reading article, so the
   * tutor writes new-card rows through the vocabulary store port (same shape as reading's cards).
   */
  wordCards?: Pick<VocabularyStore, "insertCard" | "findCardByRef">;
  saveDoubt?: (
    userId: string,
    text: string,
    context: Record<string, unknown>,
    explanation?: string | null,
  ) => Promise<{ id: string }>;
  now?: () => Date;
};

/** What a tool sees about the conversation it runs in, including whose conversation it is. */
export type ToolRunContext = { userId: string; conversationId: string; context: TutorContext };

type ToolSpec<S extends z.ZodType> = {
  name: string;
  description: string;
  args: S;
  label: (args: z.output<S>) => string;
  run: (args: z.output<S>, ctx: ToolRunContext) => Promise<unknown>;
};

export type ToolOutcome = {
  content: string;
  tool: TutorToolUse;
  arguments: Record<string, unknown>;
};

const define = <S extends z.ZodType>(spec: ToolSpec<S>) => spec as unknown as ToolSpec<z.ZodType>;

const TRUNCATED = "… [truncated]";

export function truncate(text: string, max = MAX_TOOL_RESULT_CHARS): string {
  return text.length <= max ? text : `${text.slice(0, max - TRUNCATED.length)}${TRUNCATED}`;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  hellip: "…",
  mdash: "—",
  ndash: "–",
};

/** Theory sections are stored as HTML; the model reads plain text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|li|h\d|tr|div)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&([a-z]+|#\d+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

const paragraphsOf = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

const unitOfItem = (itemId: string) => Number(itemId.split(".")[0]);

function buildTools(deps: TutorToolDeps): ToolSpec<z.ZodType>[] {
  const now = deps.now ?? (() => new Date());
  const tools: ToolSpec<z.ZodType>[] = [];
  const { units, reading, vocabulary, progress, today, wordCards, saveDoubt } = deps;

  if (units) {
    tools.push(
      define({
        name: "get_unit_theory",
        description:
          "Read the book's theory for a unit (sections A, B, C…). Use it to ground explanations in what the learner studied.",
        args: z.object({
          unitNumber: z.number().int().min(1).max(200),
          section: z.string().trim().min(1).max(3).optional().describe("Section letter, e.g. B"),
        }),
        label: (a) => `looked up Unit ${a.unitNumber} theory${a.section ? ` (${a.section})` : ""}`,
        run: async (a, ctx) => {
          const unit = await units.detail(ctx.userId, a.unitNumber);
          const sections = unit.theory
            .filter((s) => !a.section || s.letter.toLowerCase() === a.section.toLowerCase())
            .map((s) => ({ section: s.letter, text: htmlToText(s.html) }));
          if (sections.length === 0) return `Unit ${a.unitNumber} has no section "${a.section}".`;
          return { unit: unit.number, title: unit.title, subtitle: unit.subtitle, sections };
        },
      }),
      define({
        name: "get_item",
        description:
          "Read one exercise item (e.g. 1.1-2) with its instruction and the learner's attempts. The answer key is included only after the learner attempted every item of that exercise.",
        args: z.object({
          itemId: z
            .string()
            .trim()
            .regex(/^\d+\.\d+-\d+$/, "Item ids look like 1.1-2"),
        }),
        label: (a) => `looked at item ${a.itemId}`,
        run: async (a, ctx) => {
          const unit = await units.detail(ctx.userId, unitOfItem(a.itemId));
          const exercise = unit.exercises.find((e) => e.items.some((i) => i.id === a.itemId));
          const item = exercise?.items.find((i) => i.id === a.itemId);
          if (!exercise || !item) throw new UnitsError("not_found", `Item ${a.itemId} not found`);
          const attempt = unit.progress.items.find((p) => p.itemId === a.itemId);
          // Same gate as the units answers route: the key only after every item was attempted.
          let answerKey: unknown =
            "LOCKED: the learner has not attempted every item of this exercise. Do not reveal or guess the answer; explain the rule instead.";
          try {
            const answers = await units.answers(ctx.userId, unit.number, exercise.id);
            const own = answers.items.find((i) => i.itemId === a.itemId);
            if (own) answerKey = { raw: own.raw, blanks: own.blanks };
          } catch (error) {
            if (!(error instanceof UnitsError && error.code === "answers_locked")) throw error;
          }
          return {
            unit: unit.number,
            unitTitle: unit.title,
            exercise: exercise.id,
            instruction: exercise.instruction,
            wordBank: exercise.wordBank,
            passage: exercise.passage,
            item: renderItemLines(item.lines),
            isExample: item.isExample,
            learner: attempt
              ? {
                  attempts: attempt.attempts,
                  latestInputs: attempt.latest.inputs,
                  latestResult: attempt.latest.result.status,
                }
              : { attempts: 0 },
            answerKey,
          };
        },
      }),
    );
  }

  if (reading) {
    tools.push(
      define({
        name: "get_today_article_excerpt",
        description:
          "Read today's reading article (or the article the learner opened the tutor from). Without a paragraph number it returns the first paragraphs.",
        args: z.object({ paragraph: z.number().int().min(1).max(200).optional() }),
        label: (a) =>
          a.paragraph ? `read paragraph ${a.paragraph} of the article` : "read the article",
        run: async (a, ctx) => {
          const detail =
            ctx.context.kind === "article" && ctx.context.ref
              ? await reading.detail(ctx.userId, ctx.context.ref)
              : (await reading.today(ctx.userId)).reading;
          if (!detail) return "There is no article today.";
          const paragraphs = paragraphsOf(detail.article.text);
          const selected = a.paragraph
            ? paragraphs.slice(a.paragraph - 1, a.paragraph)
            : paragraphs.slice(0, 3);
          if (selected.length === 0) return `The article has only ${paragraphs.length} paragraphs.`;
          return {
            title: detail.article.title,
            paragraphs: paragraphs.length,
            from: a.paragraph ?? 1,
            text: selected.join("\n\n"),
          };
        },
      }),
    );
  }

  if (progress || vocabulary) {
    tools.push(
      define({
        name: "get_recent_errors",
        description:
          "The learner's recent writing errors (their sentence and the fix) and the error types that keep recurring.",
        args: z.object({ limit: z.number().int().min(1).max(10).default(5) }),
        label: () => "checked your recent errors",
        run: async (a, ctx) => {
          const [cards, trends] = await Promise.all([
            vocabulary?.list(ctx.userId, { source: "own_error" }),
            progress?.errors(ctx.userId),
          ]);
          return {
            recent: (cards?.cards ?? []).slice(0, a.limit).map((c) => ({
              wrote: c.front,
              fix: c.back,
              on: c.createdAt.slice(0, 10),
            })),
            recurringTypes: (trends?.recurring ?? []).map((t) => ({
              type: t.type,
              total: t.total,
              trend: t.trend,
              units: t.units.map((u) => u.unit),
            })),
          };
        },
      }),
    );
  }

  if (progress) {
    tools.push(
      define({
        name: "get_progress_summary",
        description: "Units completed, words saved, writing trend and study minutes.",
        args: z.object({}),
        label: () => "checked your progress",
        run: (_a, ctx) => progress.summary(ctx.userId),
      }),
    );
  }

  if (vocabulary) {
    tools.push(
      define({
        name: "search_my_cards",
        description: "Search the learner's flashcards (words, own errors, exercise items).",
        args: z.object({ query: z.string().trim().min(1).max(80) }),
        label: (a) => `searched your cards for "${a.query}"`,
        run: async (a, ctx) => {
          const { cards } = await vocabulary.list(ctx.userId, { q: a.query });
          return {
            found: cards.length,
            cards: cards.slice(0, 10).map((c) => ({
              source: c.source,
              front: c.front,
              back: c.back,
              phase: c.phase,
            })),
          };
        },
      }),
    );
  }

  if (wordCards) {
    tools.push(
      define({
        name: "create_vocab_card",
        description:
          "Save a word as a flashcard for spaced repetition. Only when the learner asks or clearly wants to keep it.",
        args: z.object({
          word: z.string().trim().min(1).max(60),
          sentence: z.string().trim().min(1).max(300).describe("An English example sentence"),
          meaningEs: z.string().trim().min(1).max(200).describe("Short Spanish meaning"),
        }),
        label: (a) => `saved "${a.word}" as a card`,
        run: async (a, ctx) => {
          const key = a.word.toLowerCase();
          const existing = await wordCards.findCardByRef(ctx.userId, "word", "word", key);
          if (existing) return { cardId: existing.id, created: false, note: "Already saved." };
          const card = await wordCards.insertCard(ctx.userId, {
            source: "word",
            front: `${a.word}\n${a.sentence}`,
            back: a.meaningEs,
            ref: {
              word: key,
              sentence: a.sentence,
              origin: "tutor",
              conversationId: ctx.conversationId,
            },
            state: {},
            due: now(),
          });
          return { cardId: card.id, created: true };
        },
      }),
    );
  }

  if (today) {
    tools.push(
      define({
        name: "add_parking_item",
        description:
          "Park an unrelated idea or curiosity on the learner's 'later' list so they can return to the task now.",
        args: z.object({ text: z.string().trim().min(1).max(PARKING_TEXT_MAX) }),
        label: () => "parked a note for later",
        run: async (a, ctx) => {
          const item = await today.addParking(ctx.userId, a.text);
          return { parked: true, id: item.id };
        },
      }),
    );
  }

  if (saveDoubt) {
    tools.push(
      define({
        name: "save_doubt",
        description: "Save a doubt the learner wants to revisit later.",
        args: z.object({
          text: z.string().trim().min(1).max(500),
          explanation: z
            .string()
            .trim()
            .min(1)
            .max(2000)
            .optional()
            .describe("Short explanation you gave for the doubt, if any"),
        }),
        label: () => "saved your doubt",
        run: async (a, ctx) => {
          const saved = await saveDoubt(
            ctx.userId,
            a.text,
            {
              screen: "tutor",
              conversationId: ctx.conversationId,
              tutorContext: ctx.context,
            },
            a.explanation ?? null,
          );
          return { saved: true, id: saved.id };
        },
      }),
    );
  }

  return tools;
}

/** The tool catalog: JSON-schema definitions for the model and a safe executor. */
export function createTutorTools(deps: TutorToolDeps) {
  const tools = buildTools(deps);
  const byName = new Map(tools.map((t) => [t.name, t]));

  const definitions: ToolDefinition[] = tools.map((t) => {
    const { $schema: _, ...parameters } = z.toJSONSchema(t.args, { io: "input" }) as Record<
      string,
      unknown
    >;
    return { name: t.name, description: t.description, parameters };
  });

  /** Runs one tool call. Never throws: bad arguments and failures become an error result. */
  async function run(
    name: string,
    rawArgs: Record<string, unknown>,
    ctx: ToolRunContext,
  ): Promise<ToolOutcome> {
    const args = rawArgs ?? {};
    const spec = byName.get(name);
    if (!spec) {
      return {
        content: `Error: unknown tool "${name}". Available tools: ${[...byName.keys()].join(", ")}.`,
        tool: { name, label: `tried an unknown tool (${name})`, ok: false },
        arguments: args,
      };
    }
    const parsed = spec.args.safeParse(args);
    if (!parsed.success) {
      return {
        content: truncate(`Error: invalid arguments for ${name}: ${z.prettifyError(parsed.error)}`),
        tool: { name, label: `tried ${name.replaceAll("_", " ")}`, ok: false },
        arguments: args,
      };
    }
    const label = spec.label(parsed.data);
    try {
      const result = await spec.run(parsed.data, ctx);
      const content = typeof result === "string" ? result : JSON.stringify(result);
      return { content: truncate(content), tool: { name, label, ok: true }, arguments: args };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`tutor: tool ${name} failed (${message})`);
      return {
        content: truncate(`Error: ${name} failed: ${message}`),
        tool: { name, label, ok: false },
        arguments: args,
      };
    }
  }

  return { definitions, run, names: [...byName.keys()] };
}

export type TutorTools = ReturnType<typeof createTutorTools>;
