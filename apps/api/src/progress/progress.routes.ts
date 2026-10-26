import { CreateCanDoRequest, MonthKey, ReflectionRequest } from "@english-course/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { localDate, startOfDay } from "./dates.ts";
import { type Progress, ProgressError } from "./progress.service.ts";

const ERROR_STATUS: Record<ProgressError["code"], ContentfulStatusCode> = {
  invalid_range: 400,
  future_month: 400,
};

const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => localDate(startOfDay(day)) === day, "not a calendar day");
const TimelineQuery = z.object({ from: Day.optional(), to: Day.optional() });

function handleError(error: Error, c: Context) {
  if (error instanceof ProgressError) {
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

const invalidMonth = (c: Context) =>
  c.json({ error: "invalid_month", message: "month must be YYYY-MM" }, 400);

/** `/api/progress`: read-only evidence of competence, the monthly mirror and the can-do log. */
export function progressRoutes(progress: Progress) {
  return new Hono()
    .onError(handleError)
    .get("/summary", async (c) => c.json(await progress.summary()))
    .get("/timeline", async (c) => {
      const query = TimelineQuery.safeParse(c.req.query());
      if (!query.success) {
        return c.json({ error: "invalid_query", message: "from and to must be YYYY-MM-DD" }, 400);
      }
      return c.json(await progress.timeline(query.data));
    })
    .get("/errors", async (c) => c.json(await progress.errors()))
    .get("/mirror/due", async (c) => c.json(await progress.mirrorDue()))
    .get("/mirror", async (c) => {
      const month = MonthKey.safeParse(c.req.query("month"));
      if (!month.success) return invalidMonth(c);
      return c.json(await progress.mirror(month.data));
    })
    .post("/mirror/:month/seen", async (c) => {
      const month = MonthKey.safeParse(c.req.param("month"));
      if (!month.success) return invalidMonth(c);
      return c.json(await progress.markMirrorSeen(month.data));
    })
    .post("/mirror/:month/reflection", async (c) => {
      const month = MonthKey.safeParse(c.req.param("month"));
      if (!month.success) return invalidMonth(c);
      const body = await parseBody(c, ReflectionRequest);
      if (!body.ok) return body.response;
      return c.json(await progress.saveReflection(month.data, body.data.text), 201);
    })
    .get("/can-do", async (c) => c.json(await progress.listCanDo()))
    .post("/can-do", async (c) => {
      const body = await parseBody(c, CreateCanDoRequest);
      if (!body.ok) return body.response;
      return c.json(await progress.addCanDo(body.data.text), 201);
    });
}
