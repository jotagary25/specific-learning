import {
  CompleteRequest,
  DraftRequest,
  PracticeRequest,
  PublishedRequest,
  RecheckRequest,
  SubmitRequest,
} from "@english-course/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { AppEnv } from "../auth/auth.ts";
import { type Writing, WritingError } from "./writing.service.ts";

const ERROR_STATUS: Record<WritingError["code"], ContentfulStatusCode> = {
  not_found: 404,
  invalid: 400,
  conflict: 409,
};

function handleError(error: Error, c: Context) {
  if (error instanceof WritingError) {
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

const MissionId = z.uuid();

/** Mission ids are uuids; anything else is simply not found (and never reaches the database). */
function missionId(c: Context): string {
  const id = MissionId.safeParse(c.req.param("id"));
  if (!id.success) throw new WritingError("not_found", "Mission not found");
  return id.data;
}

/**
 * `/api/writing`: missions (generate, current, history), the review flow of the active mission
 * (draft → submit → recheck → rewrite → complete) and practice from recent errors.
 */
export function writingRoutes(writing: Writing) {
  return new Hono<AppEnv>()
    .onError(handleError)
    .get("/missions/current", async (c) => c.json(await writing.current(c.get("user").id)))
    .get("/missions", async (c) => c.json(await writing.history(c.get("user").id)))
    .post("/missions/generate", async (c) => c.json(await writing.generate(c.get("user").id)))
    .put("/missions/:id/draft", async (c) => {
      const id = missionId(c);
      const body = await parseBody(c, DraftRequest);
      if (!body.ok) return body.response;
      return c.json(await writing.saveDraft(c.get("user").id, id, body.data.text));
    })
    .post("/missions/:id/submit", async (c) => {
      const id = missionId(c);
      const body = await parseBody(c, SubmitRequest);
      if (!body.ok) return body.response;
      return c.json(await writing.submit(c.get("user").id, id, body.data.text));
    })
    .post("/missions/:id/recheck", async (c) => {
      const id = missionId(c);
      const body = await parseBody(c, RecheckRequest);
      if (!body.ok) return body.response;
      return c.json(await writing.recheck(c.get("user").id, id, body.data.text));
    })
    .post("/missions/:id/rewrite", async (c) =>
      c.json(await writing.rewrite(c.get("user").id, missionId(c))),
    )
    .post("/missions/:id/complete", async (c) => {
      const id = missionId(c);
      const body = await parseBody(c, CompleteRequest);
      if (!body.ok) return body.response;
      return c.json(await writing.complete(c.get("user").id, id, body.data.publishedVersion));
    })
    .post("/missions/:id/published", async (c) => {
      const id = missionId(c);
      const body = await parseBody(c, PublishedRequest);
      if (!body.ok) return body.response;
      return c.json(await writing.markPublished(c.get("user").id, id, body.data.version));
    })
    .post("/missions/:id/skip", async (c) =>
      c.json(await writing.skip(c.get("user").id, missionId(c))),
    )
    .post("/practice", async (c) => {
      const body = await parseBody(c, PracticeRequest);
      if (!body.ok) return body.response;
      return c.json(await writing.practice(c.get("user").id, body.data.count));
    });
}
