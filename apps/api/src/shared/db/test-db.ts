// `pnpm --filter @english-course/api test:db`: runs the DB integration tests against the
// local Postgres. Uses DATABASE_URL_TEST, or derives `<db>_test` from DATABASE_URL and
// creates that database when it is missing.
import postgres from "postgres";
import { startVitest } from "vitest/node";

function testUrl(): string {
  if (process.env.DATABASE_URL_TEST) return process.env.DATABASE_URL_TEST;
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("Set DATABASE_URL_TEST or DATABASE_URL");
  const url = new URL(base);
  url.pathname = `${url.pathname.slice(1)}_test`;
  return url.toString();
}

const url = new URL(testUrl());
const name = url.pathname.slice(1);
if (!/^[a-z0-9_]+_test$/.test(name)) {
  throw new Error(`Test database name must match [a-z0-9_]+_test, got "${name}"`);
}

const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = postgres(adminUrl.toString(), { connect_timeout: 5, onnotice: () => {} });
try {
  const [row] = await admin`select 1 from pg_database where datname = ${name}`;
  if (!row) {
    await admin.unsafe(`create database "${name}"`);
    console.log(`created database ${name}`);
  }
} finally {
  await admin.end();
}

process.env.DATABASE_URL_TEST = url.toString();
const vitest = await startVitest("test", ["src/shared/db/db.integration.test.ts"], {
  run: true,
  watch: false,
});
const failed =
  vitest.state.getCountOfFailedTests() > 0 || vitest.state.getUnhandledErrors().length > 0;
await vitest.close();
process.exit(failed ? 1 : 0);
