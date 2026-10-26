import type {
  CardPatch,
  CardSource,
  CardsListResponse,
  CardView,
  QueueResponse,
  ReviewRequest,
  ReviewResponse,
  SessionRequest,
  SessionResponse,
  StatsResponse,
} from "@english-course/shared";
import { type TimeZoneOf, utcTimeZone } from "../settings/preferences.ts";
import { addDays, endOfLocalDay, localDate, startOfDay, startOfLocalDay } from "../shared/clock.ts";
import { cardView, type OwnErrorInput, ownErrorCard, presentCard, unitItemCard } from "./cards.ts";
import { isMature, isNew, phaseOf, review as scheduleReview } from "./srs.ts";
import type { VocabularyStore } from "./vocabulary.store.ts";

export type VocabularyDeps = {
  store: VocabularyStore;
  /** Per-user key/value settings (`srs.newPerDay`). */
  settings?: { getSetting(userId: string, key: string): Promise<unknown> };
  now?: () => Date;
  /** The user's IANA zone (UTC by default): "today" and the per-day counts are local to it. */
  timeZoneOf?: TimeZoneOf;
};

export class VocabularyError extends Error {
  override readonly name = "VocabularyError";
  readonly code: "not_found" | "invalid";

  constructor(code: VocabularyError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export const NEW_PER_DAY_KEY = "srs.newPerDay";
export const DEFAULT_NEW_PER_DAY = 5;
export const DEFAULT_QUEUE_LIMIT = 10;
export const MAX_QUEUE_LIMIT = 50;
const STATS_DAYS = 30;

export function createVocabulary(deps: VocabularyDeps) {
  const { store } = deps;
  const now = deps.now ?? (() => new Date());
  const timeZoneOf = deps.timeZoneOf ?? utcTimeZone;

  async function newPerDay(userId: string): Promise<number> {
    const value = await deps.settings?.getSetting(userId, NEW_PER_DAY_KEY);
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100
      ? value
      : DEFAULT_NEW_PER_DAY;
  }

  async function cardOrThrow(userId: string, id: string) {
    const card = await store.getCard(userId, id);
    if (!card) throw new VocabularyError("not_found", "Card not found");
    return card;
  }

  return {
    /** Due cards first (earliest due), then new cards up to the daily new-card allowance. */
    async queue(userId: string, limit = DEFAULT_QUEUE_LIMIT): Promise<QueueResponse> {
      const size = Math.min(Math.max(1, Math.trunc(limit)), MAX_QUEUE_LIMIT);
      const at = now();
      const zone = await timeZoneOf(userId);
      const [due, dueTotal, perDay, newToday] = await Promise.all([
        store.dueCards(userId, at, size),
        store.countDue(userId, at),
        newPerDay(userId),
        store.countFirstReviewsSince(userId, startOfLocalDay(at, zone)),
      ]);
      const fresh = await store.newCards(userId, Math.min(size - due.length, perDay - newToday));
      return {
        cards: [...due, ...fresh].map(presentCard),
        dueRemaining: Math.max(0, dueTotal - due.length),
        newPerDay: perDay,
        newToday,
      };
    },

    async review(userId: string, id: string, request: ReviewRequest): Promise<ReviewResponse> {
      const card = await cardOrThrow(userId, id);
      const at = now();
      const next = scheduleReview(card.state, request.rating, at);
      const saved = await store.recordReview(userId, id, request.rating, next, at, request.answer);
      if (!saved) throw new VocabularyError("not_found", "Card not found");
      return {
        cardId: id,
        rating: request.rating,
        phase: phaseOf(saved.state),
        due: saved.due.toISOString(),
      };
    },

    async list(
      userId: string,
      filter: { source?: CardSource; q?: string } = {},
    ): Promise<CardsListResponse> {
      return { cards: (await store.listCards(userId, filter)).map(cardView) };
    },

    async update(userId: string, id: string, patch: CardPatch): Promise<CardView> {
      await cardOrThrow(userId, id);
      const saved = await store.updateCard(userId, id, patch);
      if (!saved) throw new VocabularyError("not_found", "Card not found");
      return cardView(saved);
    },

    async remove(userId: string, id: string): Promise<{ deleted: true }> {
      if (!(await store.deleteCard(userId, id)))
        throw new VocabularyError("not_found", "Card not found");
      return { deleted: true };
    },

    async stats(userId: string): Promise<StatsResponse> {
      const at = now();
      const zone = await timeZoneOf(userId);
      const today = startOfLocalDay(at, zone);
      const endOfToday = endOfLocalDay(at, zone);
      const since = startOfDay(addDays(localDate(at, zone), -(STATS_DAYS - 1)), zone);
      const [cards, newToday, reviewTimes] = await Promise.all([
        store.listCards(userId, {}),
        store.countFirstReviewsSince(userId, today),
        store.reviewTimesSince(userId, since),
      ]);
      const active = cards.filter((c) => !c.suspended);
      const byDay = new Map<string, number>();
      for (const t of reviewTimes) {
        const day = localDate(t, zone);
        byDay.set(day, (byDay.get(day) ?? 0) + 1);
      }
      return {
        dueToday: active.filter((c) => !isNew(c.state) && c.due < endOfToday).length,
        newToday,
        newAvailable: active.filter((c) => isNew(c.state)).length,
        learned: cards.filter((c) => !isNew(c.state)).length,
        mature: cards.filter((c) => isMature(c.state)).length,
        total: cards.length,
        suspended: cards.length - active.length,
        reviewsLast30Days: reviewTimes.length,
        reviewsByDay: [...byDay.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => ({ date, count })),
      };
    },

    /** The client finished a session: one `srs_session_completed` event with its counts. */
    async completeSession(userId: string, counts: SessionRequest): Promise<SessionResponse> {
      await store.insertEvent(userId, "srs_session_completed", { ...counts });
      return { recorded: true };
    },

    /**
     * Card for an exercise item the learner still got wrong after hints (units feature).
     * Idempotent per item; `null` when the item cannot be a card (example, open, no key).
     */
    async createCardFromMissedItem(
      userId: string,
      itemId: string,
    ): Promise<{ cardId: string; created: boolean } | null> {
      const existing = await store.findCardByRef(userId, "unit_item", "itemId", itemId);
      if (existing) return { cardId: existing.id, created: false };
      const item = await store.getMissedItem(itemId);
      if (!item) throw new VocabularyError("not_found", "Exercise item not found");
      const card = unitItemCard(item, now());
      if (!card) return null;
      return { cardId: (await store.insertCard(userId, card)).id, created: true };
    },

    /** Card for one of the learner's own writing errors (writing feature, T12). */
    async createOwnErrorCard(userId: string, input: OwnErrorInput): Promise<{ cardId: string }> {
      if (!input.original.trim() || !input.corrected.trim()) {
        throw new VocabularyError("invalid", "Original and corrected sentences are required");
      }
      return { cardId: (await store.insertCard(userId, ownErrorCard(input, now()))).id };
    },
  };
}

export type Vocabulary = ReturnType<typeof createVocabulary>;
