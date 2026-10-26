import {
  AnswerRequest,
  GlossRequest,
  OpinionRequest,
  PredictionRequest,
  RetellRequest,
  SaveWordRequest,
  SpotRequest,
  StepRequest,
} from "@english-course/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { AppEnv } from "../auth/auth.ts";
import { type Reading, ReadingError } from "./reading.service.ts";

const ERROR_STATUS: Record<ReadingError["code"], ContentfulStatusCode> = {
  not_found: 404,
  invalid: 400,
  not_annotated: 409,
  "ai-unavailable": 503,
};

function handleError(error: Error, c: Context) {
  if (error instanceof ReadingError) {
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

function index(c: Context, name: string): number {
  const n = Number(c.req.param(name));
  if (!Number.isInteger(n) || n < 0 || n > 20) throw new ReadingError("not_found", "Not found");
  return n;
}

/** `/api/reading`: daily article, 6-step session, next-day recall, history and the editor. */
export function readingRoutes(reading: Reading) {
  return new Hono<AppEnv>()
    .onError(handleError)
    .get("/today", async (c) => c.json(await reading.today(c.get("user").id)))
    .post("/editor/run", async (c) => c.json(await reading.runEditor(c.get("user").id)))
    .get("/recall", async (c) => c.json(await reading.recall(c.get("user").id)))
    .post("/recall/:qid", async (c) => {
      const body = await parseBody(c, AnswerRequest);
      if (!body.ok) return body.response;
      return c.json(
        await reading.recallAnswer(c.get("user").id, index(c, "qid"), body.data.answer),
      );
    })
    .get("/articles", async (c) => c.json(await reading.list(c.get("user").id)))
    .get("/articles/:id", async (c) =>
      c.json(await reading.detail(c.get("user").id, c.req.param("id"))),
    )
    .post("/articles/:id/annotate", async (c) =>
      c.json(await reading.annotate(c.get("user").id, c.req.param("id"))),
    )
    .post("/articles/:id/prediction", async (c) => {
      const body = await parseBody(c, PredictionRequest);
      if (!body.ok) return body.response;
      return c.json(
        await reading.prediction(c.get("user").id, c.req.param("id"), body.data.prediction),
      );
    })
    .post("/articles/:id/step", async (c) => {
      const body = await parseBody(c, StepRequest);
      if (!body.ok) return body.response;
      return c.json(await reading.step(c.get("user").id, c.req.param("id"), body.data.step));
    })
    .post("/articles/:id/gloss", async (c) => {
      const body = await parseBody(c, GlossRequest);
      if (!body.ok) return body.response;
      return c.json(
        await reading.gloss(
          c.get("user").id,
          c.req.param("id"),
          body.data.word,
          body.data.sentence,
        ),
      );
    })
    .post("/articles/:id/save-word", async (c) => {
      const body = await parseBody(c, SaveWordRequest);
      if (!body.ok) return body.response;
      return c.json(
        await reading.saveWord(
          c.get("user").id,
          c.req.param("id"),
          body.data.word,
          body.data.sentence,
        ),
      );
    })
    .post("/articles/:id/questions/:qid", async (c) => {
      const body = await parseBody(c, AnswerRequest);
      if (!body.ok) return body.response;
      return c.json(
        await reading.answer(
          c.get("user").id,
          c.req.param("id"),
          index(c, "qid"),
          body.data.answer,
        ),
      );
    })
    .post("/articles/:id/spots", async (c) => {
      const body = await parseBody(c, SpotRequest);
      if (!body.ok) return body.response;
      return c.json(await reading.spot(c.get("user").id, c.req.param("id"), body.data));
    })
    .post("/articles/:id/spots/reveal", async (c) =>
      c.json(await reading.revealSpots(c.get("user").id, c.req.param("id"))),
    )
    .post("/articles/:id/retell", async (c) => {
      const body = await parseBody(c, RetellRequest);
      if (!body.ok) return body.response;
      return c.json(await reading.retell(c.get("user").id, c.req.param("id"), body.data.text));
    })
    .post("/articles/:id/opinion", async (c) => {
      const body = await parseBody(c, OpinionRequest);
      if (!body.ok) return body.response;
      return c.json(await reading.opinion(c.get("user").id, c.req.param("id"), body.data.opinion));
    })
    .post("/articles/:id/complete", async (c) =>
      c.json(await reading.complete(c.get("user").id, c.req.param("id"))),
    );
}
