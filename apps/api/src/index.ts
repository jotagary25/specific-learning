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
import { createOpenRouterClient } from "./shared/llm/openrouter.ts";
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
const contentDir = resolveContentDir(config.CONTENT_DIR);
const database = createDb(config.DATABASE_URL);
const users = createDrizzleUserStore(database.db);

try {
  console.log(`db: migrations up to date (${await runMigrations(database.db)} applied)`);
  console.log(formatSeedResult(await seed(database.db, contentDir)));
  const bootstrap = await bootstrapAdmin(users, {
    email: config.APP_USER_EMAIL,
    password: config.APP_USER_PASSWORD,
  });
  console.log(`users: admin ${bootstrap.user.email} ${bootstrap.action}`);
} catch (error) {
  console.error("db: startup failed", error);
  await database.close();
  process.exit(1);
}

const settingsStore = createDrizzleSettingsStore(database.db);
const auth = createAuth({
  users,
  appSecret: config.APP_SECRET,
  trustProxy: config.TRUST_PROXY,
  // Logout bumps the user's session epoch in `app_user`, revoking only that user's sessions.
  // Login rate limiting keys on the account plus the socket peer, or X-Forwarded-For when
  // TRUST_PROXY is on and the peer is a loopback/private proxy (see auth/trusted-proxy.ts).
});
const settings = createSettings({
  store: settingsStore,
  appSecret: config.APP_SECRET,
  createClient: (getApiKey) => createOllamaClient({ baseUrl: config.OLLAMA_BASE_URL, getApiKey }),
  openrouter: {
    createClient: (getApiKey) =>
      createOpenRouterClient({
        baseUrl: config.OPENROUTER_BASE_URL,
        appUrl: config.APP_PUBLIC_URL,
        getApiKey,
      }),
  },
});

const preferences = createPreferences(settingsStore, {
  // New users get the instance editor hour until they pick their own in Settings.
  defaults: { "reading.editorHour": config.EDITOR_HOUR },
});
// Every local day/hour is computed in the user's own zone (the process runs in UTC).
const timeZoneOf = preferences.timeZoneOf;

const vocabularyStore = createDrizzleVocabularyStore(database.db);
const vocabulary = createVocabulary({
  store: vocabularyStore,
  settings: settingsStore,
  timeZoneOf,
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
  // The Conversation only (S5); the NewsSource port stays open for future sources.
  sources: [createTheConversationSource()],
});
const reading = createReading({
  store: readingStore,
  editor,
  ai: settings,
  timeZoneOf,
  editorEnabled: config.EDITOR_ENABLED,
});
// Each user gets their article once their local hour reaches their editor hour.
const scheduler = config.EDITOR_ENABLED
  ? startEditorScheduler({
      listUserIds: () => users.listIds(),
      timeZoneOf,
      editorHour: preferences.editorHour,
      hasArticle: async (userId, date) =>
        (await readingStore.getArticleForDate(userId, date)) !== undefined,
      gather: editor.gather,
      run: editor.run,
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
  timeZoneOf,
  sources: createTodaySources({
    units,
    reading,
    readingStore,
    vocabulary,
    writing,
    getSetting: (userId, key) => settingsStore.getSetting(userId, key),
  }),
});

const progress = createProgress({ store: createDrizzleProgressStore(database.db), timeZoneOf });

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
