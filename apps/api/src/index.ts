import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { resolveContentDir } from "./content/content-dir.ts";
import { loadConfig } from "./shared/config.ts";
import { createDb } from "./shared/db/client.ts";
import { runMigrations } from "./shared/db/migrate.ts";
import { formatSeedResult, seed } from "./shared/db/seed/index.ts";

const config = loadConfig();
const contentDir = resolveContentDir();
const database = createDb(config.DATABASE_URL);

try {
  console.log(`db: migrations up to date (${await runMigrations(database.db)} applied)`);
  console.log(formatSeedResult(await seed(database.db, contentDir)));
} catch (error) {
  console.error("db: startup failed", error);
  await database.close();
  process.exit(1);
}

const app = createApp({ pingDb: database.ping, contentDir });

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});

const shutdown = () => {
  server.close();
  void database.close();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
