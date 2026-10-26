import {
  AttemptRequest,
  ExplainRequest,
  HintRequest,
  TimelineCheckRequest,
} from "@english-course/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { AppEnv } from "../auth/auth.ts";
import { type Units, UnitsError } from "./units.service.ts";

const ERROR_STATUS: Record<UnitsError["code"], ContentfulStatusCode> = {
  not_found: 404,
  invalid_item: 400,
  answers_locked: 403,
  "ai-unavailable": 503,
};

function handleError(error: Error, c: Context) {
  if (error instanceof UnitsError) {
    return c.json({ error: error.code, message: error.message }, ERROR_STATUS[error.code]);
  }
  throw error;
}

async function parseBody<S extends z.ZodType>(c: Context, schema: S, empty: unknown = null) {
  const parsed = schema.safeParse((await c.req.json().catch(() => null)) ?? empty);
  return parsed.success
    ? ({ ok: true, data: parsed.data } as const)
    : ({
        ok: false,
        response: c.json({ error: "invalid_body", message: z.prettifyError(parsed.error) }, 400),
      } as const);
}

function unitNumber(c: Context): number {
  const n = Number(c.req.param("n"));
  if (!Number.isInteger(n) || n < 1) throw new UnitsError("not_found", "Unit not found");
  return n;
}

/** `/api/units`: list, unit content, attempts, hints, "I don't get it", timeline, review answers. */
export function unitsRoutes(units: Units) {
  return new Hono<AppEnv>()
    .onError(handleError)
    .get("/", async (c) => c.json(await units.list(c.get("user").id)))
    .get("/:n", async (c) => c.json(await units.detail(c.get("user").id, unitNumber(c))))
    .post("/:n/items/:itemId/attempts", async (c) => {
      const body = await parseBody(c, AttemptRequest);
      if (!body.ok) return body.response;
      return c.json(
        await units.attempt(
          c.get("user").id,
          unitNumber(c),
          c.req.param("itemId"),
          body.data.inputs,
        ),
      );
    })
    .post("/:n/items/:itemId/hint", async (c) => {
      const body = await parseBody(c, HintRequest, {});
      if (!body.ok) return body.response;
      return c.json(
        await units.hint(c.get("user").id, unitNumber(c), c.req.param("itemId"), body.data.shown),
      );
    })
    .post("/:n/explain", async (c) => {
      const body = await parseBody(c, ExplainRequest);
      if (!body.ok) return body.response;
      return c.json(await units.explain(c.get("user").id, unitNumber(c), body.data.context));
    })
    .post("/:n/timeline/:itemId", async (c) => {
      const body = await parseBody(c, TimelineCheckRequest);
      if (!body.ok) return body.response;
      return c.json(
        await units.checkTimeline(
          c.get("user").id,
          unitNumber(c),
          c.req.param("itemId"),
          body.data.placement,
        ),
      );
    })
    .get("/:n/answers/:exerciseId", async (c) =>
      c.json(await units.answers(c.get("user").id, unitNumber(c), c.req.param("exerciseId"))),
    );
}
