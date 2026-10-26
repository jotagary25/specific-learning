import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createAuth } from "./auth/auth.ts";
import { resolveContentDir } from "./content/content-dir.ts";
import { createEval } from "./eval/eval.service.ts";
import { createDrizzleEvalStore } from "./eval/eval.store.ts";
import { loadEvalFixtures } from "./eval/fixtures.ts";
import { createProgress } from "./progress/progress.service.ts";
import { createDrizzleProgressStore } from "./progress/progress.store.ts";
import { createEditor } from "./reading/editor.ts";
import { createReading } from "./reading/reading.service.ts";
import { createDrizzleReadingStore } from "./reading/reading.store.ts";
import { startEditorScheduler } from "./reading/scheduler.ts";
import { createPreferences } from "./settings/preferences.ts";
import { createSettings } from "./settings/settings.service.ts";
import { createDrizzleSettingsStore } from "./settings/settings.store.ts";
import { loadConfig } from "./shared/config.ts";
import { createDb } from "./shared/db/client.ts";
import { runMigrations } from "./shared/db/migrate.ts";
import { formatSeedResult, seed } from "./shared/db/seed/index.ts";
import { createOllamaClient } from "./shared/llm/ollama.ts";
import { createOllamaWebSearchSource } from "./shared/news/ollama-websearch.ts";
import { createTheConversationSource } from "./shared/news/theconversation.ts";
import { createToday } from "./today/today.service.ts";
import { createTodaySources } from "./today/today.sources.ts";
import { createDrizzleTodayStore } from "./today/today.store.ts";
import { createTutor } from "./tutor/tutor.service.ts";
import { createDrizzleTutorStore } from "./tutor/tutor.store.ts";
import { createUnits } from "./units/units.service.ts";
import { createDrizzleUnitsStore } from "./units/units.store.ts";
import { bootstrapAdmin } from "./users/bootstrap.ts";
import { createDrizzleUserStore } from "./users/users.store.ts";
import { createVocabulary } from "./vocabulary/vocabulary.service.ts";
import { createDrizzleVocabularyStore } from "./vocabulary/vocabulary.store.ts";
import { createWriting } from "./writing/writing.service.ts";
import { createDrizzleWritingStore } from "./writing/writing.store.ts";

const config = loadConfig();
const contentDir = resolveContentDir();
const database = createDb(config.DATABASE_URL);
const users = createDrizzleUserStore(database.db);

let admin: Awaited<ReturnType<typeof bootstrapAdmin>>["user"];
try {
  console.log(`db: migrations up to date (${await runMigrations(database.db)} applied)`);
  console.log(formatSeedResult(await seed(database.db, contentDir)));
  const bootstrap = await bootstrapAdmin(users, {
    email: config.APP_USER_EMAIL,
    password: config.APP_USER_PASSWORD,
  });
  admin = bootstrap.user;
  console.log(`users: admin ${admin.email} ${bootstrap.action}`);
} catch (error) {
  console.error("db: startup failed", error);
  await database.close();
  process.exit(1);
}

const settingsStore = createDrizzleSettingsStore(database.db);
const auth = createAuth({
  users,
  appSecret: config.APP_SECRET,
  cookieSecure: config.COOKIE_SECURE,
  trustProxy: config.TRUST_PROXY,
  // Logout bumps the user's session epoch in `app_user`, revoking only that user's sessions.
  // Login rate limiting keys on the account plus the socket peer, or X-Forwarded-For when
  // TRUST_PROXY is on and the peer is a loopback/private proxy (see auth/trusted-proxy.ts).
});
const settings = createSettings({
  store: settingsStore,
  appSecret: config.APP_SECRET,
  envApiKey: config.OLLAMA_API_KEY,
  createClient: (getApiKey) => createOllamaClient({ baseUrl: config.OLLAMA_BASE_URL, getApiKey }),
});

const preferences = createPreferences(settingsStore);

const vocabularyStore = createDrizzleVocabularyStore(database.db);
const vocabulary = createVocabulary({
  store: vocabularyStore,
  settings: settingsStore,
});

const units = createUnits({
  store: createDrizzleUnitsStore(database.db),
  ai: settings,
  missedItems: vocabulary,
});

const readingStore = createDrizzleReadingStore(database.db);
const editor = createEditor({
  store: readingStore,
  ai: settings,
  sources: [
    createTheConversationSource(),
    // Shared news source: searches with the admin's key (env key as fallback).
    createOllamaWebSearchSource({
      baseUrl: config.OLLAMA_BASE_URL,
      getApiKey: () => settings.getApiKey(admin.id),
    }),
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
      // Every user gets their article at the same instance hour (per-user hours come later).
      run: async (date) => {
        for (const userId of await users.listIds()) {
          try {
            await editor.run(userId, date);
          } catch (error) {
            console.error(`editor: run for user ${userId} on ${date} failed`, error);
          }
        }
      },
      hasArticle: async (date) => {
        for (const userId of await users.listIds()) {
          if (!(await readingStore.getArticleForDate(userId, date))) return false;
        }
        return true;
      },
    })
  : undefined;

const writing = createWriting({
  store: createDrizzleWritingStore(database.db),
  settings: settingsStore,
  ai: settings,
  ownErrors: vocabulary,
});

const today = createToday({
  store: createDrizzleTodayStore(database.db),
  sources: createTodaySources({
    units,
    reading,
    readingStore,
    vocabulary,
    writing,
    getSetting: (userId, key) => settingsStore.getSetting(userId, key),
  }),
});

const progress = createProgress({ store: createDrizzleProgressStore(database.db) });

const tutor = createTutor({
  store: createDrizzleTutorStore(database.db),
  ai: settings,
  units,
  reading,
  vocabulary,
  progress,
  today,
  wordCards: vocabularyStore,
});

const evals = createEval({
  store: createDrizzleEvalStore(database.db),
  ai: settings,
  fixtures: () => loadEvalFixtures(contentDir),
});
evals
  .recover()
  .then((count) => count > 0 && console.log(`eval: ${count} interrupted run(s) marked failed`))
  .catch((error: unknown) => console.error("eval: recovery failed", error));

const app = createApp({
  pingDb: database.ping,
  contentDir,
  webDistDir: config.WEB_DIST_DIR,
  auth,
  settings,
  preferences,
  units,
  reading,
  vocabulary,
  writing,
  today,
  progress,
  tutor,
  evals,
});

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
  if (config.WEB_DIST_DIR) console.log(`web: serving ${config.WEB_DIST_DIR}`);
});

const shutdown = () => {
  scheduler?.stop();
  server.close();
  void database.close();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
