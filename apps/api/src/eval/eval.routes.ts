import { ApplyEvalRequest, StartEvalRequest } from "@english-course/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { AppEnv } from "../auth/auth.ts";
import { SettingsError } from "../settings/settings.service.ts";
import { isLlmError } from "../shared/llm/errors.ts";
import { type Eval, EvalRunError } from "./eval.service.ts";

const EVAL_ERROR_STATUS: Record<EvalRunError["code"], ContentfulStatusCode> = {
  not_found: 404,
  not_configured: 409,
  not_running: 409,
  not_completed: 409,
  function_not_evaluated: 400,
};

const SETTINGS_ERROR_STATUS: Record<SettingsError["code"], ContentfulStatusCode> = {
  unknown_function: 404,
  unknown_model: 400,
  unsupported_think: 400,
};

function handleError(error: Error, c: Context) {
  if (error instanceof EvalRunError) {
    return c.json({ error: error.code, message: error.message }, EVAL_ERROR_STATUS[error.code]);
  }
  if (error instanceof SettingsError) {
    return c.json({ error: error.code, message: error.message }, SETTINGS_ERROR_STATUS[error.code]);
  }
  if (isLlmError(error)) return c.json({ error: error.code, message: error.message }, 502);
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

export function evalRoutes(evals: Eval) {
  return new Hono<AppEnv>()
    .onError(handleError)
    .get("/fixtures", async (c) => c.json({ counts: await evals.fixtureCounts() }))
    .post("/runs", async (c) => {
      const body = await parseBody(c, StartEvalRequest);
      if (!body.ok) return body.response;
      return c.json({ runIds: await evals.start(c.get("user").id, body.data) }, 202);
    })
    .get("/runs", async (c) => c.json({ runs: await evals.list(c.get("user").id) }))
    .get("/runs/:id", async (c) => c.json(await evals.get(c.get("user").id, c.req.param("id"))))
    .post("/runs/:id/cancel", async (c) =>
      c.json(await evals.cancel(c.get("user").id, c.req.param("id"))),
    )
    .post("/runs/:id/apply", async (c) => {
      const body = await parseBody(c, ApplyEvalRequest);
      if (!body.ok) return body.response;
      return c.json(await evals.apply(c.get("user").id, c.req.param("id"), body.data.functionId));
    });
}
