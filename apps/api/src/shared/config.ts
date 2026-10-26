import { z } from "zod";
import { DEFAULT_OLLAMA_BASE_URL } from "./llm/ollama.ts";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const EnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PORT: z.coerce.number().int().positive().default(3000),
  /** The admin account, created or updated on every start (see users/bootstrap.ts). */
  APP_USER_EMAIL: z.email(),
  APP_USER_PASSWORD: z.string().min(12, "APP_USER_PASSWORD must be at least 12 characters"),
  APP_SECRET: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "APP_SECRET must be 32 bytes encoded as 64 hex chars"),
  OLLAMA_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  OLLAMA_BASE_URL: z.preprocess(emptyToUndefined, z.url().default(DEFAULT_OLLAMA_BASE_URL)),
  /**
   * Session cookie `Secure` flag: `auto` = Secure for https (or `X-Forwarded-Proto: https`
   * with TRUST_PROXY); plain http drops it only on local dev hosts.
   */
  COOKIE_SECURE: z.preprocess(
    emptyToUndefined,
    z
      .enum(["auto", "true", "false"])
      .default("auto")
      .transform((value) => (value === "auto" ? value : value === "true")),
  ),
  /**
   * Trust `X-Forwarded-*` headers from a reverse proxy (TLS termination): the cookie `Secure`
   * flag follows `X-Forwarded-Proto` and login rate limiting keys on `X-Forwarded-For`. Only
   * loopback/private socket peers are believed (see auth/trusted-proxy.ts).
   */
  TRUST_PROXY: z.preprocess(
    emptyToUndefined,
    z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  ),
  /** Built web app served by the api in production (the Docker image sets it). */
  WEB_DIST_DIR: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Daily reading editor job; `false` disables the in-process scheduler (manual runs still work). */
  EDITOR_ENABLED: z.preprocess(
    emptyToUndefined,
    z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
  ),
  /** Local hour (process `TZ`) of the daily editor run. */
  EDITOR_HOUR: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(23).default(5)),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
