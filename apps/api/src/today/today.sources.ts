// Adapter that reads the other features (through their services, read-only) into the
// state the Today planner needs. No AI call happens here.

import type { UnitDetail, UnitListEntry, UnitStep } from "@english-course/shared";
import { addDays, localDate } from "../reading/dates.ts";
import type { Reading } from "../reading/reading.service.ts";
import type { ReadingStore } from "../reading/reading.store.ts";
import type { Units } from "../units/units.service.ts";
import type { Vocabulary } from "../vocabulary/vocabulary.service.ts";
import type { Writing } from "../writing/writing.service.ts";
import type { TodaySources, TodayState } from "./today.service.ts";

export const WRITING_DAY_KEY = "today.writingDay";
export const DEFAULT_WRITING_DAY = 6; // Saturday

export type TodaySourcesDeps = {
  units: Pick<Units, "list" | "detail">;
  reading: Pick<Reading, "today">;
  readingStore: Pick<ReadingStore, "getArticleForDate" | "getSession">;
  vocabulary: Pick<Vocabulary, "stats" | "queue">;
  writing: Pick<Writing, "current">;
  getSetting?: (userId: string, key: string) => Promise<unknown>;
};

/** Priority unit (raised by writing errors) first, else the lowest unit not completed. */
export function pickCurrentUnit(units: readonly UnitListEntry[]): UnitListEntry | undefined {
  const ordered = [...units].sort((a, b) => a.number - b.number);
  return ordered.find((u) => u.priority) ?? ordered.find((u) => u.status !== "completed");
}

/** Same step order as the unit page: story → puzzle → theory → timeline → exercises. */
export function nextUnitStep(detail: UnitDetail): UnitStep {
  if (detail.progress.items.length > 0 || detail.progress.status === "completed") {
    return "exercises";
  }
  if (detail.story) return "story";
  if (detail.extras) return "puzzle";
  return "theory";
}

export function itemsLeft(detail: UnitDetail): number {
  const attempted = new Set(detail.progress.items.map((i) => i.itemId));
  return detail.exercises
    .flatMap((e) => e.items)
    .filter((i) => !i.isExample && !attempted.has(i.id)).length;
}

async function writingDay(
  userId: string,
  getSetting: TodaySourcesDeps["getSetting"],
): Promise<number> {
  const value = await getSetting?.(userId, WRITING_DAY_KEY);
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6
    ? value
    : DEFAULT_WRITING_DAY;
}

export function createTodaySources(deps: TodaySourcesDeps): TodaySources {
  async function unitState(userId: string): Promise<Pick<TodayState, "unit" | "teaser">> {
    const list = await deps.units.list(userId);
    const current = pickCurrentUnit(list.blocks.flatMap((b) => b.units));
    if (!current) return { unit: null, teaser: null };
    const detail = await deps.units.detail(userId, current.number);
    const chapter = detail.story?.chapter;
    return {
      unit: {
        number: current.number,
        title: current.title,
        nextStep: nextUnitStep(detail),
        itemsLeft: itemsLeft(detail),
        priority: current.priority,
        completed: current.status === "completed",
      },
      teaser: chapter?.teaser
        ? { unit: current.number, chapterTitle: chapter.title, teaser: chapter.teaser }
        : null,
    };
  }

  async function recallPending(userId: string, now: Date): Promise<boolean> {
    const article = await deps.readingStore.getArticleForDate(userId, addDays(localDate(now), -1));
    const session = article ? await deps.readingStore.getSession(userId, article.id) : undefined;
    if (!session?.completedAt) return false;
    const questions = session.entries.filter((e) => e.type === "recall-questions").at(-1);
    if (questions?.type !== "recall-questions") return true;
    const answered = new Set(
      session.entries.flatMap((e) => (e.type === "recall-answer" ? [e.qid] : [])),
    );
    return questions.questions.some((_, qid) => !answered.has(qid));
  }

  async function srsState(userId: string): Promise<TodayState["srs"]> {
    const [stats, queue] = await Promise.all([
      deps.vocabulary.stats(userId),
      deps.vocabulary.queue(userId, 1),
    ]);
    const allowed = Math.max(0, queue.newPerDay - queue.newToday);
    return { due: stats.dueToday, fresh: Math.min(stats.newAvailable, allowed) };
  }

  return {
    async state(userId, now) {
      const [units, srs, today, recall, writing, day] = await Promise.all([
        unitState(userId),
        srsState(userId),
        deps.reading.today(userId),
        recallPending(userId, now),
        deps.writing.current(userId),
        writingDay(userId, deps.getSetting),
      ]);
      const article = today.reading;
      return {
        ...units,
        srs,
        reading: article
          ? {
              title: article.article.title,
              step: article.article.completed ? "done" : article.session.step,
            }
          : null,
        recallPending: recall,
        writing: {
          missionOpen: writing.mission !== null,
          title: writing.mission?.title ?? null,
          writingDay: day,
        },
      };
    },
  };
}
