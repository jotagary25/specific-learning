import {
  type AnswersResponse,
  type AttemptResponse,
  checkItem,
  checkTimelinePlacement,
  type ExplainContext,
  type ExplainResponse,
  type HintResponse,
  type ItemCheckResult,
  type ItemOutcome,
  type ItemProgress,
  type TimelineCheckResponse,
  type TimelinePlacement,
  type UnitCompletion,
  type UnitDetail,
  type UnitProgressStatus,
  type UnitsListResponse,
  unitCompletion,
} from "@english-course/shared";
import type { z } from "zod";
import { hintLevelFor, prompts } from "../prompts/index.ts";
import { renderItemLines } from "../prompts/shared.ts";
import type { Settings } from "../settings/settings.service.ts";
import { isLlmError } from "../shared/llm/errors.ts";
import { fallbackHint, leaksAnswer } from "./hint-guard.ts";
import type {
  AttemptRecord,
  ExerciseRecord,
  ItemRecord,
  UnitContent,
  UnitRecord,
  UnitsStore,
} from "./units.store.ts";

/** Port to the vocabulary feature: turns an item the learner keeps missing into an SRS card. */
export type MissedItemCards = {
  createCardFromMissedItem(itemId: string): Promise<unknown>;
};

export type UnitsDeps = {
  store: UnitsStore;
  /** AI model resolution; without it every AI path degrades to "ai-unavailable". */
  ai?: Pick<Settings, "getLlmForFunction">;
  /** Optional: without it missed items create no SRS card. */
  missedItems?: MissedItemCards;
};

export class UnitsError extends Error {
  override readonly name = "UnitsError";
  readonly code: "not_found" | "invalid_item" | "answers_locked" | "ai-unavailable";

  constructor(code: UnitsError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

const notFound = (what: string) => new UnitsError("not_found", `${what} not found`);

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

const PENDING: ItemCheckResult = { status: "needs-ai", blanks: [], score: 0 };
const UNANSWERED: ItemCheckResult = { status: "incorrect", blanks: [], score: 0 };

/**
 * Completion over every gradable item of a unit: the first resolved attempt of each item counts
 * (a "needs-ai" attempt is replaced once an attempt is resolved); unanswered items count as 0, so
 * the 80% threshold needs most of the unit, not just the items tried so far.
 */
export function completionFor(
  items: ReadonlyArray<{ id: string; isExample: boolean }>,
  attempts: readonly AttemptRecord[],
): UnitCompletion {
  const outcomes: ItemOutcome[] = items
    .filter((item) => !item.isExample)
    .map((item) => {
      const own = attempts.filter((a) => a.itemId === item.id);
      const resolved = own.find((a) => a.result.status !== "needs-ai");
      return {
        isExample: false,
        result: resolved?.result ?? (own.length > 0 ? PENDING : UNANSWERED),
      };
    });
  return unitCompletion(outcomes);
}

/** An item counts as missed on its 3rd incorrect attempt… */
export const MISSED_AFTER_INCORRECT = 3;
/** …or on an incorrect attempt made after the learner saw this hint level. */
export const MISSED_AFTER_HINT_LEVEL = 3;

function missedAt(own: readonly AttemptRecord[], index: number): boolean {
  const current = own[index];
  if (current?.result.status !== "incorrect") return false;
  const before = own.slice(0, index);
  const incorrect = before.filter((a) => a.result.status === "incorrect").length + 1;
  const hintSeen = Math.max(0, ...before.map((a) => a.hintLevel));
  return incorrect >= MISSED_AFTER_INCORRECT || hintSeen >= MISSED_AFTER_HINT_LEVEL;
}

/**
 * True when the latest of an item's attempts (oldest first) is the first one that makes the item
 * "missed": still incorrect after hint level 3 was shown, or the 3rd incorrect attempt. Hint levels
 * are stored on the attempt that was latest when the hint was shown, so they count for later ones.
 */
export function isNewlyMissed(own: readonly AttemptRecord[]): boolean {
  const last = own.length - 1;
  if (!missedAt(own, last)) return false;
  return !own.slice(0, last).some((_, index) => missedAt(own, index));
}

function hasGradedAttempt(attempts: readonly AttemptRecord[]): boolean {
  return attempts.some((a) => a.result.status !== "needs-ai");
}

function progressStatus(unit: UnitRecord, attempts: readonly AttemptRecord[]): UnitProgressStatus {
  if (unit.completedAt) return "completed";
  if (attempts.length > 0 || unit.status !== "new") return "in-progress";
  return "not-started";
}

function blankCount(item: ItemRecord): number {
  return item.lines.flat().filter((segment) => segment.type === "blank").length;
}

/** Maps the AI verdict to the checker result shape, so completion treats both alike. */
function resultFromVerdict(
  verdict: "correct" | "almost" | "incorrect",
  inputs: readonly string[],
): ItemCheckResult {
  const blanks = inputs.map(() => ({ verdict }));
  return verdict === "incorrect"
    ? { status: "incorrect", blanks, score: 0 }
    : { status: "correct", blanks, score: 1 };
}

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

function theorySummary(unit: UnitRecord, maxChars = 2500): string {
  return unit.theory
    .map((section) => `${section.letter}. ${stripHtml(section.html)}`)
    .join("\n")
    .slice(0, maxChars);
}

const unitRef = (unit: UnitRecord) => ({
  id: unit.id,
  title: unit.title,
  grammarFocus: unit.subtitle ? `${unit.title} (${unit.subtitle})` : unit.title,
});

// ---------------------------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------------------------

export function createUnits(deps: UnitsDeps) {
  const { store } = deps;

  async function content(unitNumber: number): Promise<UnitContent> {
    const found = await store.getUnitContent(unitNumber);
    if (!found) throw notFound(`Unit ${unitNumber}`);
    return found;
  }

  function gradedItem(unitContent: UnitContent, itemId: string) {
    const item = unitContent.items.find((i) => i.id === itemId);
    if (!item) throw notFound(`Item ${itemId}`);
    if (item.isExample || !item.answer) {
      throw new UnitsError("invalid_item", `Item ${itemId} is a worked example and is not graded`);
    }
    const exercise = unitContent.exercises.find((e) => e.id === item.exerciseId) as ExerciseRecord;
    return { item, answer: item.answer, exercise };
  }

  /** Runs one AI function; any LLM failure (no key, offline, invalid output) → undefined. */
  async function runAi<K extends "check_answer" | "hint_exercise" | "explain_tutor">(
    id: K,
    input: Parameters<(typeof prompts)[K]["build"]>[0],
  ): Promise<z.output<(typeof prompts)[K]["schema"]> | undefined> {
    if (!deps.ai) return undefined;
    try {
      const { client, model, think } = await deps.ai.getLlmForFunction(id);
      const prompt = prompts[id];
      const messages = (prompt.build as (value: typeof input) => ReturnType<typeof prompt.build>)(
        input,
      );
      const { data } = await client.chatJson({ model, think, messages }, prompt.schema);
      return data as z.output<(typeof prompts)[K]["schema"]>;
    } catch (error) {
      if (!isLlmError(error)) throw error;
      console.warn(`units: ${id} unavailable (${error.code})`);
      return undefined;
    }
  }

  return {
    async list(): Promise<UnitsListResponse> {
      const [blocks, units, refs, attempts] = await Promise.all([
        store.listBlocks(),
        store.listUnits(),
        store.listItemRefs(),
        store.listAttempts(),
      ]);
      return {
        blocks: blocks
          .map((b) => ({
            id: b.id,
            title: b.title,
            units: units
              .filter((u) => u.blockId === b.id)
              .map((u) => {
                const own = attempts.filter((a) => a.unitId === u.id);
                const completion = completionFor(
                  refs.filter((r) => r.unitId === u.id),
                  own,
                );
                return {
                  number: u.id,
                  title: u.title,
                  subtitle: u.subtitle,
                  status: progressStatus(u, own),
                  score: hasGradedAttempt(own) ? completion.ratio : null,
                  priority: u.priority > 0 || u.status === "needs_review",
                };
              }),
          }))
          .filter((b) => b.units.length > 0),
      };
    },

    async detail(unitNumber: number): Promise<UnitDetail> {
      const c = await content(unitNumber);
      const attempts = await store.listAttempts(unitNumber);
      const progressItems: ItemProgress[] = [];
      for (const item of c.items) {
        const own = attempts.filter((a) => a.itemId === item.id);
        const latest = own.at(-1);
        if (latest) {
          const { feedbackEs, hintEs } = latest.feedback ?? {};
          progressItems.push({
            itemId: item.id,
            attempts: own.length,
            latest: {
              inputs: latest.inputs,
              result: latest.result,
              method: latest.method,
              ...(feedbackEs ? { feedbackEs } : {}),
              ...(hintEs ? { hintEs } : {}),
            },
          });
        }
      }
      const extras = c.unit.extras;
      return {
        number: c.unit.id,
        title: c.unit.title,
        subtitle: c.unit.subtitle,
        block: c.block,
        theory: c.unit.theory,
        extras,
        story: c.chapter
          ? {
              title: c.chapter.storyTitle,
              chapter: {
                id: c.chapter.id,
                position: c.chapter.position,
                title: c.chapter.title,
                body: c.chapter.body,
                grammarSpans: c.chapter.grammarSpans,
                teaser: c.chapter.teaser,
              },
            }
          : null,
        timeline: c.timeline.map((t) => ({ id: t.id, sentence: t.sentence })),
        exercises: c.exercises.map((e) => ({
          id: e.id,
          instruction: e.instruction,
          evaluation: e.evaluation,
          wordBank: e.wordBank,
          passage: e.passage,
          answerNote: e.answerNote,
          // Never send the answer key: only the item's shape and whether the AI grades it.
          items: c.items
            .filter((i) => i.exerciseId === e.id)
            .map((i) => ({
              id: i.id,
              num: i.num,
              isExample: i.isExample,
              isOpen: i.isOpen,
              kind: i.answer?.kind ?? null,
              lines: i.lines,
            })),
        })),
        progress: {
          status: progressStatus(c.unit, attempts),
          completedAt: c.unit.completedAt?.toISOString() ?? null,
          completion: completionFor(c.items, attempts),
          items: progressItems,
        },
      };
    },

    async attempt(unitNumber: number, itemId: string, inputs: string[]): Promise<AttemptResponse> {
      const c = await content(unitNumber);
      const { item, answer, exercise } = gradedItem(c, itemId);
      const blanks = blankCount(item);
      if (blanks > 0 && inputs.length !== blanks) {
        throw new UnitsError("invalid_item", `Item ${itemId} expects ${blanks} answer(s)`);
      }

      let result = checkItem({ answer }, inputs);
      let method: "deterministic" | "ai" = "deterministic";
      let feedbackEs: string | undefined;
      let hintEs: string | undefined;
      let error: "ai-unavailable" | undefined;

      if (result.status === "needs-ai") {
        const isOpen = answer.kind === "open";
        const ai = await runAi("check_answer", {
          unit: unitRef(c.unit),
          instruction: exercise.instruction,
          lines: item.lines,
          key: isOpen ? { examples: answer.blanks.flat() } : { raw: answer.raw },
          answers: inputs,
        });
        if (ai) {
          result = resultFromVerdict(ai.verdict, inputs);
          method = "ai";
          feedbackEs = ai.feedbackEs;
          hintEs = ai.hintEs && !leaksAnswer(ai.hintEs, answer.blanks) ? ai.hintEs : undefined;
        } else {
          error = "ai-unavailable";
        }
      }

      const before = await store.listAttempts(unitNumber);
      const attemptNo = before.filter((a) => a.itemId === itemId).length + 1;
      const feedback =
        feedbackEs || hintEs
          ? { ...(feedbackEs ? { feedbackEs } : {}), ...(hintEs ? { hintEs } : {}) }
          : null;
      await store.insertAttempt({ itemId, inputs, result, method, attemptNo, feedback });
      await store.markInProgress(unitNumber);

      const attempts = await store.listAttempts(unitNumber);
      if (deps.missedItems && isNewlyMissed(attempts.filter((a) => a.itemId === itemId))) {
        try {
          await deps.missedItems.createCardFromMissedItem(itemId);
        } catch (cardError) {
          // A missing card must never fail the learner's attempt.
          console.warn(`units: missed-item card for ${itemId} failed`, cardError);
        }
      }
      const completion = completionFor(c.items, attempts);
      const canDoEs = c.unit.extras?.canDoEs ?? [];
      const unitCompleted =
        completion.completed && !c.unit.completedAt
          ? await store.completeUnit(
              unitNumber,
              { ratio: completion.ratio, graded: completion.graded },
              canDoEs,
            )
          : false;

      return {
        itemId,
        status: result.status,
        result,
        method,
        attemptNo,
        ...(feedbackEs ? { feedbackEs } : {}),
        ...(hintEs ? { hintEs } : {}),
        ...(error ? { error } : {}),
        completion,
        unitCompleted,
        canDoEs: unitCompleted ? canDoEs : [],
      };
    },

    async hint(unitNumber: number, itemId: string, shown: number): Promise<HintResponse> {
      const c = await content(unitNumber);
      const { item, answer, exercise } = gradedItem(c, itemId);
      const own = (await store.listAttempts(unitNumber)).filter((a) => a.itemId === itemId);
      const level = hintLevelFor(Math.max(own.length, shown + 1));
      // Stored on the item's latest attempt; it makes a later wrong attempt count as "missed".
      await store.recordHintLevel(itemId, level);
      const ai = await runAi("hint_exercise", {
        unit: unitRef(c.unit),
        theorySummary: theorySummary(c.unit),
        instruction: exercise.instruction,
        lines: item.lines,
        keyAnswers: answer.blanks.map((alternatives) => alternatives[0] ?? "").filter(Boolean),
        attempt: level,
        previousAnswers: own.map((a) => a.inputs.join(" | ")),
      });
      // The model is told never to reveal the answer; this guard enforces it.
      if (ai && !leaksAnswer(ai.hintEs, answer.blanks)) {
        return { level, hintEs: ai.hintEs, source: "ai" };
      }
      return { level, hintEs: fallbackHint(level), source: "fallback" };
    },

    async explain(unitNumber: number, context: ExplainContext): Promise<ExplainResponse> {
      const c = await content(unitNumber);
      let task = `Unit ${c.unit.id}, ${context.step} step`;
      let snippet: string | undefined;
      if (context.itemId) {
        const item = c.items.find((i) => i.id === context.itemId);
        const exercise = c.exercises.find((e) => e.id === item?.exerciseId);
        if (item && exercise) {
          task = `Exercise ${exercise.id}, item ${item.num.replace(/\.$/, "")}`;
          snippet = `${exercise.instruction}\n${renderItemLines(item.lines)}`;
        }
      } else if (context.timelineItemId) {
        const timeline = c.timeline.find((t) => t.id === context.timelineItemId);
        if (timeline) {
          task = "Timeline: place the action of the sentence on the time axis";
          snippet = timeline.sentence;
        }
      } else if (context.step === "puzzle" && c.unit.extras) {
        const { puzzle } = c.unit.extras;
        snippet = `${puzzle.sentenceA}\n${puzzle.sentenceB}\n${puzzle.question}`;
      } else if (context.step === "story" && c.chapter) {
        snippet = c.chapter.grammarSpans.map((span) => span.text).join("\n");
      }

      const explanation = await runAi("explain_tutor", {
        screen: context.itemId ? "exercise" : "unit",
        unit: unitRef(c.unit),
        task,
        snippet,
        question: context.question,
        previousExplanations: context.previousExplanations,
        wantsProgrammerAnalogy: context.wantsProgrammerAnalogy,
      });
      await store.insertDoubt(
        context.question ?? task,
        {
          screen: "unit",
          unitId: c.unit.id,
          step: context.step,
          itemId: context.itemId,
          timelineItemId: context.timelineItemId,
        },
        explanation?.explanationEs ?? null,
      );
      if (!explanation) {
        throw new UnitsError("ai-unavailable", "The AI tutor is unavailable right now");
      }
      return explanation;
    },

    async checkTimeline(
      unitNumber: number,
      timelineItemId: string,
      placement: TimelinePlacement,
    ): Promise<TimelineCheckResponse> {
      const c = await content(unitNumber);
      const item = c.timeline.find((t) => t.id === timelineItemId);
      if (!item) throw notFound(`Timeline item ${timelineItemId}`);
      const check = checkTimelinePlacement(item.expected, item.tolerance, placement);
      return {
        ...check,
        handles: Object.fromEntries(
          Object.entries(check.handles).filter(
            (entry): entry is [string, boolean] => entry[1] !== undefined,
          ),
        ),
        expected: item.expected,
        explanationEs: item.explanationEs,
      };
    },

    async answers(unitNumber: number, exerciseId: string): Promise<AnswersResponse> {
      const c = await content(unitNumber);
      if (!c.exercises.some((e) => e.id === exerciseId)) throw notFound(`Exercise ${exerciseId}`);
      const graded = c.items.filter((i) => i.exerciseId === exerciseId && !i.isExample && i.answer);
      const attempted = new Set((await store.listAttempts(unitNumber)).map((a) => a.itemId));
      if (graded.some((i) => !attempted.has(i.id))) {
        throw new UnitsError(
          "answers_locked",
          "Answer every item of the exercise at least once to see the answers",
        );
      }
      return {
        exerciseId,
        items: graded.flatMap((i) =>
          i.answer
            ? [
                {
                  itemId: i.id,
                  raw: i.answer.raw,
                  blanks: i.answer.blanks,
                  kind: i.answer.kind,
                  needsAi: i.answer.needsAi,
                },
              ]
            : [],
        ),
      };
    },
  };
}

export type Units = ReturnType<typeof createUnits>;
