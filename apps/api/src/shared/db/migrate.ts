import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Db } from "./client.ts";

/** Generated SQL migrations (apps/api/drizzle), produced by `pnpm db:generate`. */
export const MIGRATIONS_DIR = fileURLToPath(new URL("../../../drizzle", import.meta.url));

/** Applies pending migrations and returns how many are recorded as applied in total. */
export async function runMigrations(db: Db): Promise<number> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  const [row] = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
  );
  return row?.count ?? 0;
}
