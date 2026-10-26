const DEV_VARS = ["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"] as const;

/**
 * Database for the integration tests: DATABASE_URL_TEST when set, otherwise `<POSTGRES_DB>_test`
 * on the dev compose database, which publishes port 5432 on the host.
 */
export function testDatabaseUrl(env: NodeJS.ProcessEnv): string {
  if (env.DATABASE_URL_TEST) return env.DATABASE_URL_TEST;
  const missing = DEV_VARS.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Set DATABASE_URL_TEST, or ${DEV_VARS.slice(0, -1).join(", ")} and ${DEV_VARS.at(-1)} (missing: ${missing.join(", ")})`,
    );
  }
  const url = new URL("postgres://localhost:5432");
  url.username = encodeURIComponent(env.POSTGRES_USER ?? "");
  url.password = encodeURIComponent(env.POSTGRES_PASSWORD ?? "");
  url.pathname = `/${env.POSTGRES_DB}_test`;
  return url.toString();
}
