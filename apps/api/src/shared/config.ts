import { z } from "zod";

/** An empty value counts as missing, so `FOO=` in `.env` fails like an absent `FOO`. */
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const env = <T extends z.ZodType>(schema: T) => z.preprocess(emptyToUndefined, schema);
const flag = () => env(z.enum(["true", "false"]).transform((value) => value === "true"));

/**
 * Every variable is required and has no default: a missing, empty or invalid one fails startup
 * with an error naming each offending variable. AI provider keys are not configured here; each
 * user stores their own in Settings.
 */
const EnvSchema = z.object({
  DATABASE_URL: env(z.url({ protocol: /^postgres(ql)?$/ })),
  PORT: env(z.coerce.number().int().positive()),
  /** The admin account, created or updated on every start (see users/bootstrap.ts). */
  APP_USER_EMAIL: env(z.email()),
  APP_USER_PASSWORD: env(z.string().min(8, "APP_USER_PASSWORD must be at least 8 characters")),
  APP_SECRET: env(
    z.string().regex(/^[0-9a-fA-F]{64}$/, "APP_SECRET must be 32 bytes encoded as 64 hex chars"),
  ),
  /**
   * Trust `X-Forwarded-*` headers from a reverse proxy (TLS termination): the session cookie
   * `Secure` flag follows `X-Forwarded-Proto` and login rate limiting keys on `X-Forwarded-For`.
   * Only loopback/private socket peers are believed (see auth/trusted-proxy.ts). Without it,
   * https requests get a Secure cookie and plain http drops it only on local dev hosts.
   */
  TRUST_PROXY: flag(),
  /** Daily reading editor job; `false` disables the in-process scheduler (manual runs still work). */
  EDITOR_ENABLED: flag(),
  /** Editor hour for users who have not set theirs (read in each user's zone). */
  EDITOR_HOUR: env(z.coerce.number().int().min(0).max(23)),
  /** Content root (units, authored content, images, eval samples); relative to the cwd. */
  CONTENT_DIR: env(z.string()),
  /**
   * Optional mode switch, not a default: when set, the api also serves the built web app from
   * this folder (the Docker image sets it); unset in development, where Vite serves the web.
   */
  WEB_DIST_DIR: env(z.string().optional()),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(environment);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
