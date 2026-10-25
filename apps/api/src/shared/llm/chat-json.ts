import { z } from "zod";
import { LlmError } from "./errors.ts";
import type {
  ChatCompletion,
  ChatJsonRequest,
  ChatJsonResult,
  ChatMessage,
  ChatRequest,
} from "./types.ts";

/** A non-streaming completion with an optional structured-output JSON schema. */
export type CompleteFn = (
  req: ChatRequest & { format?: Record<string, unknown> },
) => Promise<ChatCompletion>;

/** JSON schema for Ollama `format`, derived from the zod schema. */
export function formatFor(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  return jsonSchema;
}

type Parsed<T> = { ok: true; data: T } | { ok: false; error: string };

function parseReply<S extends z.ZodType>(raw: string, schema: S): Parsed<z.output<S>> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return { ok: false, error: `invalid JSON (${(error as Error).message})` };
  }
  const result = schema.safeParse(json);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, error: z.prettifyError(result.error) };
}

const retryPrompt = (error: string) =>
  `Your previous reply did not match the required JSON schema:\n${error}\n` +
  "Reply again with only the corrected JSON object, nothing else.";

/**
 * Shared `chatJson` behavior for every adapter: structured output with the zod-derived
 * schema, validation, one retry with the error appended, then a typed `invalid_output`.
 */
export async function runChatJson<S extends z.ZodType>(
  complete: CompleteFn,
  req: ChatJsonRequest,
  schema: S,
): Promise<ChatJsonResult<z.output<S>>> {
  const format = formatFor(schema);
  const first = await complete({ ...req, format });
  const firstParsed = parseReply(first.content, schema);
  if (firstParsed.ok) return { data: firstParsed.data, attempts: 1, usage: first.usage };

  const messages: ChatMessage[] = [
    ...req.messages,
    { role: "assistant", content: first.content },
    { role: "user", content: retryPrompt(firstParsed.error) },
  ];
  const second = await complete({ ...req, messages, format });
  const secondParsed = parseReply(second.content, schema);
  if (secondParsed.ok) return { data: secondParsed.data, attempts: 2, usage: second.usage };

  throw new LlmError("invalid_output", "The model reply did not match the schema after one retry", {
    issues: secondParsed.error,
  });
}
