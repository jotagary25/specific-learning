// `pnpm --filter @english-course/api db:seed`: upserts CONTENT_DIR into DATABASE_URL. In
// development run it inside the api container, where compose sets both:
//   docker compose exec api corepack pnpm --filter @english-course/api db:seed
import { resolveContentDir } from "../../../content/content-dir.ts";
import { createDb } from "../client.ts";
import { formatSeedResult, seed } from "./index.ts";

const { DATABASE_URL: databaseUrl, CONTENT_DIR: contentDir } = process.env;
if (!databaseUrl || !contentDir) {
  const missing = [!databaseUrl && "DATABASE_URL", !contentDir && "CONTENT_DIR"].filter(Boolean);
  console.error(`Not set: ${missing.join(", ")}`);
  process.exit(1);
}

const database = createDb(databaseUrl);
try {
  console.log(formatSeedResult(await seed(database.db, resolveContentDir(contentDir))));
} finally {
  await database.close();
}
