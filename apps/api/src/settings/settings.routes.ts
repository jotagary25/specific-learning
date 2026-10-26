import { PutAiKeyRequest, UpdateAiFunctionRequest } from "@english-course/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { AppEnv } from "../auth/auth.ts";
import { isLlmError, type LlmErrorCode } from "../shared/llm/errors.ts";
import { type Settings, SettingsError } from "./settings.service.ts";

const LLM_ERROR_STATUS: Record<LlmErrorCode, ContentfulStatusCode> = {
  not_configured: 409,
  invalid_key: 409,
  rate_limited: 429,
  not_found: 404,
  bad_request: 502,
  upstream: 502,
  network: 502,
  timeout: 504,
  aborted: 502,
  invalid_output: 502,
};

const SETTINGS_ERROR_STATUS: Record<SettingsError["code"], ContentfulStatusCode> = {
  unknown_function: 404,
  unknown_model: 400,
  unsupported_think: 400,
};

function handleError(error: Error, c: Context) {
  if (isLlmError(error)) {
    if (error.retryAfterSeconds) c.header("Retry-After", String(error.retryAfterSeconds));
    return c.json({ error: error.code, message: error.message }, LLM_ERROR_STATUS[error.code]);
  }
  if (error instanceof SettingsError) {
    return c.json({ error: error.code, message: error.message }, SETTINGS_ERROR_STATUS[error.code]);
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

export function settingsRoutes(settings: Settings) {
  return new Hono<AppEnv>()
    .onError(handleError)
    .get("/ai-key", async (c) => c.json(await settings.keyStatus(c.get("user").id)))
    .put("/ai-key", async (c) => {
      const body = await parseBody(c, PutAiKeyRequest);
      if (!body.ok) return body.response;
      return c.json(await settings.setKey(c.get("user").id, body.data.apiKey));
    })
    .delete("/ai-key", async (c) => c.json(await settings.deleteKey(c.get("user").id)))
    .post("/ai-key/test", async (c) => c.json(await settings.testKey(c.get("user").id)))
    .get("/models", async (c) => c.json({ models: await settings.listModels(c.get("user").id) }))
    .get("/models/:name/capabilities", async (c) =>
      c.json(await settings.capabilities(c.get("user").id, c.req.param("name"))),
    )
    .get("/ai-functions", async (c) =>
      c.json({ functions: await settings.listAiFunctions(c.get("user").id) }),
    )
    .put("/ai-functions/:id", async (c) => {
      const body = await parseBody(c, UpdateAiFunctionRequest);
      if (!body.ok) return body.response;
      return c.json(
        await settings.updateAiFunction(c.get("user").id, c.req.param("id"), body.data),
      );
    });
}
