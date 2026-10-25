import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const EnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_PASSWORD: z.string().min(1),
  APP_SECRET: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "APP_SECRET must be 32 bytes encoded as 64 hex chars"),
  OLLAMA_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  OLLAMA_BASE_URL: z.preprocess(emptyToUndefined, z.url().default("https://ollama.com")),
  /** Session cookie `Secure` flag: `auto` = Secure unless the request host is local. */
  COOKIE_SECURE: z.preprocess(
    emptyToUndefined,
    z
      .enum(["auto", "true", "false"])
      .default("auto")
      .transform((value) => (value === "auto" ? value : value === "true")),
  ),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
