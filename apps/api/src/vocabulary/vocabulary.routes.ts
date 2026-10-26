import { CardPatch, CardSource, ReviewRequest, SessionRequest } from "@english-course/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { DEFAULT_QUEUE_LIMIT, type Vocabulary, VocabularyError } from "./vocabulary.service.ts";

const ERROR_STATUS: Record<VocabularyError["code"], ContentfulStatusCode> = {
  not_found: 404,
  invalid: 400,
};

function handleError(error: Error, c: Context) {
  if (error instanceof VocabularyError) {
    return c.json({ error: error.code, message: error.message }, ERROR_STATUS[error.code]);
  }
  throw error;
}

async function parseBody<S extends z.ZodType>(c: Context, schema: S) {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  return parsed.success
    ? ({ ok: true, data: parsed.data } as const)
    : ({
        ok: false,
        response: c.json({ error: "invalid_body", message: z.prettifyError(parsed.error) }, 400),
      } as const);
}

const CardId = z.uuid();

/** Card ids are uuids; anything else is simply not found (and never reaches the database). */
function cardId(c: Context): string {
  const id = CardId.safeParse(c.req.param("id"));
  if (!id.success) throw new VocabularyError("not_found", "Card not found");
  return id.data;
}

const QueueQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(DEFAULT_QUEUE_LIMIT),
});
const ListQuery = z.object({
  source: CardSource.optional(),
  q: z.string().trim().max(200).optional(),
});

function parseQuery<S extends z.ZodType>(c: Context, schema: S): z.infer<S> {
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success) throw new VocabularyError("invalid", z.prettifyError(parsed.error));
  return parsed.data;
}

/** `/api/vocabulary`: review queue, reviews, card browser, stats and session events. */
export function vocabularyRoutes(vocabulary: Vocabulary) {
  return new Hono()
    .onError(handleError)
    .get("/queue", async (c) => c.json(await vocabulary.queue(parseQuery(c, QueueQuery).limit)))
    .get("/stats", async (c) => c.json(await vocabulary.stats()))
    .post("/sessions", async (c) => {
      const body = await parseBody(c, SessionRequest);
      if (!body.ok) return body.response;
      return c.json(await vocabulary.completeSession(body.data));
    })
    .get("/cards", async (c) => {
      const { source, q } = parseQuery(c, ListQuery);
      return c.json(await vocabulary.list({ ...(source ? { source } : {}), ...(q ? { q } : {}) }));
    })
    .post("/cards/:id/review", async (c) => {
      const id = cardId(c);
      const body = await parseBody(c, ReviewRequest);
      if (!body.ok) return body.response;
      return c.json(await vocabulary.review(id, body.data));
    })
    .patch("/cards/:id", async (c) => {
      const id = cardId(c);
      const body = await parseBody(c, CardPatch);
      if (!body.ok) return body.response;
      return c.json(await vocabulary.update(id, body.data));
    })
    .delete("/cards/:id", async (c) => c.json(await vocabulary.remove(cardId(c))));
}
