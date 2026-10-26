import {
  CreateConversationRequest,
  PostMessageRequest,
  type TutorStreamEvent,
} from "@english-course/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { AppEnv } from "../auth/auth.ts";
import { type Tutor, TutorError } from "./tutor.service.ts";

const ERROR_STATUS: Record<TutorError["code"], ContentfulStatusCode> = {
  not_found: 404,
  "ai-unavailable": 503,
};

function handleError(error: Error, c: Context) {
  if (error instanceof TutorError) {
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

/** `/api/tutor`: conversations and the streamed (SSE) tutor turn. */
export function tutorRoutes(tutor: Tutor) {
  return new Hono<AppEnv>()
    .onError(handleError)
    .get("/conversations", async (c) => c.json(await tutor.list(c.get("user").id)))
    .post("/conversations", async (c) => {
      const body = await parseBody(c, CreateConversationRequest);
      if (!body.ok) return body.response;
      return c.json(await tutor.create(c.get("user").id, body.data.context), 201);
    })
    .get("/conversations/:id", async (c) =>
      c.json(await tutor.get(c.get("user").id, c.req.param("id"))),
    )
    .post("/conversations/:id/messages", async (c) => {
      const body = await parseBody(c, PostMessageRequest);
      if (!body.ok) return body.response;
      // 404 / 503 are answered as JSON before the stream opens.
      const turn = await tutor.startTurn(c.get("user").id, c.req.param("id"), body.data.content);
      return streamSSE(c, async (stream) => {
        const controller = new AbortController();
        stream.onAbort(() => controller.abort());
        c.req.raw.signal.addEventListener("abort", () => controller.abort(), { once: true });
        const send = (event: TutorStreamEvent) =>
          stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
        try {
          for await (const event of turn(controller.signal)) await send(event);
        } catch (error) {
          console.error("tutor: stream failed", error);
          if (!stream.aborted) {
            await send({
              type: "error",
              error: "internal",
              message: "The tutor stopped because of an unexpected error.",
            });
          }
        }
      });
    });
}
