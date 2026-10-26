import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { createApp } from "./app.ts";
import { createAuth } from "./auth/auth.ts";
import { resolveContentDir } from "./content/content-dir.ts";
import { createEditor } from "./reading/editor.ts";
import { createReading } from "./reading/reading.service.ts";
import { createDrizzleReadingStore } from "./reading/reading.store.ts";
import { startEditorScheduler } from "./reading/scheduler.ts";
import { createSettings } from "./settings/settings.service.ts";
import { createDrizzleSettingsStore } from "./settings/settings.store.ts";
import { loadConfig } from "./shared/config.ts";
import { createDb } from "./shared/db/client.ts";
import { runMigrations } from "./shared/db/migrate.ts";
import { formatSeedResult, seed } from "./shared/db/seed/index.ts";
import { createOllamaClient } from "./shared/llm/ollama.ts";
import { createOllamaWebSearchSource } from "./shared/news/ollama-websearch.ts";
import { createTheConversationSource } from "./shared/news/theconversation.ts";
import { createUnits } from "./units/units.service.ts";
import { createDrizzleUnitsStore } from "./units/units.store.ts";

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

const auth = createAuth({
  password: config.APP_PASSWORD,
  appSecret: config.APP_SECRET,
  cookieSecure: config.COOKIE_SECURE,
  clientKey: (c) => {
    try {
      return getConnInfo(c).remote.address ?? "unknown";
    } catch {
      return "unknown";
    }
  },
});
const settings = createSettings({
  store: createDrizzleSettingsStore(database.db),
  appSecret: config.APP_SECRET,
  envApiKey: config.OLLAMA_API_KEY,
  createClient: (getApiKey) => createOllamaClient({ baseUrl: config.OLLAMA_BASE_URL, getApiKey }),
});

const units = createUnits({ store: createDrizzleUnitsStore(database.db), ai: settings });

const readingStore = createDrizzleReadingStore(database.db);
const editor = createEditor({
  store: readingStore,
  ai: settings,
  sources: [
    createTheConversationSource(),
    createOllamaWebSearchSource({ baseUrl: config.OLLAMA_BASE_URL, getApiKey: settings.getApiKey }),
  ],
});
const reading = createReading({
  store: readingStore,
  editor,
  ai: settings,
  editorEnabled: config.EDITOR_ENABLED,
});
const scheduler = config.EDITOR_ENABLED
  ? startEditorScheduler({
      hour: config.EDITOR_HOUR,
      run: (date) => editor.run(date),
      hasArticle: async (date) => (await readingStore.getArticleForDate(date)) !== undefined,
    })
  : undefined;

const app = createApp({ pingDb: database.ping, contentDir, auth, settings, units, reading });

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});

const shutdown = () => {
  scheduler?.stop();
  server.close();
  void database.close();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
