// `pnpm --filter @english-course/api db:seed`: upserts the content folder into DATABASE_URL.
import { resolveContentDir } from "../../../content/content-dir.ts";
import { createDb } from "../client.ts";
import { formatSeedResult, seed } from "./index.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const database = createDb(databaseUrl);
try {
  console.log(formatSeedResult(await seed(database.db, resolveContentDir())));
} finally {
  await database.close();
}
