import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { connect_timeout: 5 });
  const db = drizzle({ client, schema });

  return {
    db,
    async ping(): Promise<boolean> {
      await db.execute(sql`select 1`);
      return true;
    },
    close: () => client.end(),
  };
}

export type Db = ReturnType<typeof createDb>["db"];
