import {
  CreateParkingRequest,
  EndSessionRequest,
  StartSessionRequest,
  TodayMode,
  UpdateParkingRequest,
} from "@english-course/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { type Today, TodayError } from "./today.service.ts";

const ERROR_STATUS: Record<TodayError["code"], ContentfulStatusCode> = {
  not_found: 404,
  already_ended: 409,
  invalid_bonus: 400,
};

function handleError(error: Error, c: Context) {
  if (error instanceof TodayError) {
    return c.json({ error: error.code, message: error.message }, ERROR_STATUS[error.code]);
  }
  throw error;
}

async function parseBody<S extends z.ZodType>(c: Context, schema: S) {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  return parsed.success
    ? ({ ok: true, data: parsed.data as z.output<S> } as const)
    : ({
        ok: false,
        response: c.json({ error: "invalid_body", message: z.prettifyError(parsed.error) }, 400),
      } as const);
}

/** `/api/today`: the plan for now, study sessions and the parking list. */
export function todayRoutes(today: Today) {
  return new Hono()
    .onError(handleError)
    .get("/", async (c) => {
      const raw = c.req.query("mode");
      const mode = raw === undefined ? undefined : TodayMode.safeParse(raw);
      if (mode && !mode.success) {
        return c.json(
          { error: "invalid_query", message: "mode must be full, slump or minimum" },
          400,
        );
      }
      return c.json(await today.overview(mode?.data));
    })
    .post("/sessions", async (c) => {
      const body = await parseBody(c, StartSessionRequest);
      if (!body.ok) return body.response;
      return c.json(await today.startSession(body.data.mode), 201);
    })
    .post("/sessions/:id/end", async (c) => {
      const body = await parseBody(c, EndSessionRequest);
      if (!body.ok) return body.response;
      return c.json(await today.endSession(c.req.param("id"), body.data));
    })
    .get("/parking", async (c) => c.json(await today.listParking()))
    .post("/parking", async (c) => {
      const body = await parseBody(c, CreateParkingRequest);
      if (!body.ok) return body.response;
      return c.json(await today.addParking(body.data.text), 201);
    })
    .patch("/parking/:id", async (c) => {
      const body = await parseBody(c, UpdateParkingRequest);
      if (!body.ok) return body.response;
      return c.json(await today.updateParking(c.req.param("id"), body.data));
    })
    .delete("/parking/:id", async (c) => c.json(await today.removeParking(c.req.param("id"))));
}
