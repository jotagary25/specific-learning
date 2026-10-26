import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Unit } from "@english-course/shared";
import { PREFERENCE_DEFAULTS } from "@english-course/shared";
import { count, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveContentDir } from "../../content/content-dir.ts";
import { createDrizzleEvalStore } from "../../eval/eval.store.ts";
import { createProgress } from "../../progress/progress.service.ts";
import { createDrizzleProgressStore } from "../../progress/progress.store.ts";
import { createDrizzleReadingStore } from "../../reading/reading.store.ts";
import { createPreferences } from "../../settings/preferences.ts";
import { createSettings } from "../../settings/settings.service.ts";
import { createDrizzleSettingsStore } from "../../settings/settings.store.ts";
import { createDrizzleTodayStore } from "../../today/today.store.ts";
import { createDrizzleTutorStore } from "../../tutor/tutor.store.ts";
import { createDrizzleUnitsStore } from "../../units/units.store.ts";
import { bootstrapAdmin } from "../../users/bootstrap.ts";
import { createDrizzleUserStore } from "../../users/users.store.ts";
import { createVocabulary } from "../../vocabulary/vocabulary.service.ts";
import { createDrizzleVocabularyStore } from "../../vocabulary/vocabulary.store.ts";
import {
  createDrizzleWritingStore,
  initialFlow,
  parseErrorSpan,
} from "../../writing/writing.store.ts";
import { createFakeLlm } from "../llm/fake.ts";
import { createDb, type Db } from "./client.ts";
import { MIGRATIONS_DIR, runMigrations } from "./migrate.ts";
import {
  appUser,
  attempt,
  block,
  doubt,
  exercise,
  exerciseItem,
  srsCard,
  storyChapter,
  studySession,
  timelineItem,
  tutorMessage,
  unit,
  unitProgress,
  writingMission,
} from "./schema/index.ts";
import { loadAuthored } from "./seed/load-authored.ts";
import { loadUnits } from "./seed/load-content.ts";
import { seedAuthored } from "./seed/seed-authored.ts";
import { seedContent } from "./seed/seed-content.ts";

/**
 * Runs against a real, disposable Postgres database (its public and drizzle schemas are
 * dropped). Set DATABASE_URL_TEST, or run `pnpm --filter @english-course/api test:db`.
 */
const url = process.env.DATABASE_URL_TEST;

async function resetDatabase(db: Db) {
  const name = new URL(url ?? "").pathname.slice(1);
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to reset "${name}": the test database name must end with _test`);
  }
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`create schema public`);
}

async function appliedMigrations(db: Db): Promise<number> {
  const [row] = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
  );
  return row?.count ?? 0;
}

/** Applies only the first `count` migrations, from a copy of the folder with a cut journal. */
async function migrateFirst(db: Db, entries: number) {
  const dir = await mkdtemp(join(tmpdir(), "drizzle-partial-"));
  try {
    await cp(MIGRATIONS_DIR, dir, { recursive: true });
    const journalPath = join(dir, "meta", "_journal.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8"));
    journal.entries = journal.entries.slice(0, entries);
    await writeFile(journalPath, JSON.stringify(journal));
    await migrate(db, { migrationsFolder: dir });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!url)("migration 0001_schema_gaps over pre-existing workaround data", () => {
  const database = createDb(url ?? "");
  const { db } = database;
  const scheduled = {
    due: "2026-10-26T09:00:00.000Z",
    stability: 3.1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 1,
    learning_steps: 0,
    reps: 1,
    lapses: 0,
    state: 2,
    last_review: "2026-10-25T09:00:00.000Z",
  };

  beforeAll(async () => {
    await resetDatabase(db);
    await migrateFirst(db, 1);
    // Rows as T09–T15 wrote them, with the data kept in jsonb workarounds.
    await db.execute(sql`
      insert into srs_card (id, source, front, back, state, due) values
        ('00000000-0000-7000-8000-000000000001', 'word', 'a', 'a', '{}', now()),
        ('00000000-0000-7000-8000-000000000002', 'word', 'b', 'b', '{"suspended": true}', now()),
        ('00000000-0000-7000-8000-000000000003', 'word', 'c', 'c',
          ${JSON.stringify({ ...scheduled, suspended: true })}::jsonb, now()),
        ('00000000-0000-7000-8000-000000000004', 'word', 'd', 'd',
          ${JSON.stringify(scheduled)}::jsonb, now())`);
    await db.execute(sql`
      insert into study_session (id, mode, budget_min, plan, ended_at) values
        ('00000000-0000-7000-8000-000000000011', 'standard', 25, '{"blocks": []}', now()),
        ('00000000-0000-7000-8000-000000000012', 'minimum', 5, '{"blocks": []}', null)`);
    await db.execute(sql`
      insert into event (type, payload) values ('session_completed',
        '{"sessionId": "00000000-0000-7000-8000-000000000011", "blocksDone": 2, "reason": "timer"}')`);
    await db.execute(sql`
      insert into doubt (id, text, context) values
        ('00000000-0000-7000-8000-000000000021', '¿por qué?',
          '{"screen": "unit", "unitId": 1, "explanationEs": "Porque está en curso."}'),
        ('00000000-0000-7000-8000-000000000022', '¿y esto?', '{"screen": "tutor"}')`);
    await db.execute(sql`
      insert into tutor_conversation (id) values ('00000000-0000-7000-8000-000000000031')`);
    await db.execute(sql`
      insert into tutor_message (conversation_id, role, content, tool_calls) values
        ('00000000-0000-7000-8000-000000000031', 'user', 'hi', null),
        ('00000000-0000-7000-8000-000000000031', 'tool', '{}', '[{"name": "get_unit_theory"}]')`);
    await db.execute(sql`
      insert into writing_mission (level, format, title, prompt, created_at) values
        (1, 'tweet', 'Old mission', 'Write.', '2026-10-01T10:00:00Z')`);
    // Up to 0001 only: 0002 empties learner tables (covered by its own suite below).
    await migrateFirst(db, 2);
  });

  afterAll(async () => {
    await database.close();
  });

  it("records both migrations", async () => {
    expect(await appliedMigrations(db)).toBe(2);
  });

  it("moves the suspended flag to its column and empty states to null", async () => {
    const rows = await db
      .select({ front: srsCard.front, state: srsCard.state, suspended: srsCard.suspended })
      .from(srsCard)
      .orderBy(srsCard.front);
    expect(rows).toEqual([
      { front: "a", state: null, suspended: false },
      { front: "b", state: null, suspended: true },
      { front: "c", state: scheduled, suspended: true },
      { front: "d", state: scheduled, suspended: false },
    ]);
  });

  it("maps the legacy session mode and fills blocks/end reason from the completion event", async () => {
    const rows = await db
      .select({
        mode: studySession.mode,
        blocks: studySession.blocksDone,
        reason: studySession.endReason,
      })
      .from(studySession)
      .orderBy(studySession.id);
    expect(rows).toEqual([
      { mode: "full", blocks: 2, reason: "timer" },
      { mode: "minimum", blocks: null, reason: null },
    ]);
  });

  it("moves the doubt explanation out of the context", async () => {
    const rows = await db
      .select({ explanation: doubt.explanation, context: doubt.context })
      .from(doubt)
      .orderBy(doubt.id);
    expect(rows).toEqual([
      { explanation: "Porque está en curso.", context: { screen: "unit", unitId: 1 } },
      { explanation: null, context: { screen: "tutor" } },
    ]);
  });

  it("fills tool_name on tool messages and updated_at on missions", async () => {
    const messages = await db
      .select({ role: tutorMessage.role, toolName: tutorMessage.toolName })
      .from(tutorMessage)
      .orderBy(tutorMessage.role);
    expect(messages).toEqual([
      { role: "tool", toolName: "get_unit_theory" },
      { role: "user", toolName: null },
    ]);
    const [mission] = await db.select({ updatedAt: writingMission.updatedAt }).from(writingMission);
    expect(mission?.updatedAt.toISOString()).toBe("2026-10-01T10:00:00.000Z");
  });
});

describe.skipIf(!url)("migration 0002_users_and_isolation over a database at 0001", () => {
  const database = createDb(url ?? "");
  const { db } = database;

  beforeAll(async () => {
    await resetDatabase(db);
    await migrateFirst(db, 2);
    // Shared content and learner data as the single-user schema stored them.
    await db.execute(sql`insert into block (id, title, unit_from, unit_to) values (1, 'B', 1, 6)`);
    await db.execute(sql`
      insert into unit (id, block_id, title, subtitle, theory, status, priority, completed_at)
      values (1, 1, 'Present continuous', '(I am doing)', '[]', 'completed', 2, now())`);
    await db.execute(sql`
      insert into article (id, source, url, title, text, selected_for) values
        ('00000000-0000-7000-8000-000000000041', 'manual', 'https://example.com/a', 'A', 'text',
          '2026-10-20')`);
    await db.execute(sql`
      insert into reading_session (article_id) values ('00000000-0000-7000-8000-000000000041')`);
    await db.execute(sql`
      insert into srs_card (source, front, back, due) values ('word', 'a', 'a', now())`);
    await db.execute(sql`insert into event (type) values ('unit_completed')`);
    await db.execute(sql`insert into setting (key, value) values ('auth.sessionEpoch', '3')`);
    await db.execute(sql`
      insert into secret (key, ciphertext, iv, tag, last4) values ('ollama_api_key', 'c', 'i', 't', 'WXYZ')`);
    await runMigrations(db);
  });

  afterAll(async () => {
    await database.close();
  });

  it("applies on top of 0001 (and the later ones) and is a no-op when run again", async () => {
    expect(await appliedMigrations(db)).toBe(4);
    expect(await runMigrations(db)).toBe(4);
  });

  it("empties learner data, settings and secrets but keeps shared content", async () => {
    const left = async (table: string) =>
      (
        await db.execute<{ n: number }>(
          sql`select count(*)::int as n from ${sql.identifier(table)}`,
        )
      )[0]?.n;
    for (const table of ["reading_session", "srs_card", "event", "setting", "secret"]) {
      expect(await left(table), table).toBe(0);
    }
    expect(await left("unit")).toBe(1);
    expect(await left("article")).toBe(1);
  });

  it("moves unit progress and the daily pick out of the shared tables", async () => {
    const columns = await db.execute<{ table_name: string; column_name: string }>(sql`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and (
        (table_name = 'unit' and column_name in ('status', 'priority', 'completed_at')) or
        (table_name = 'article' and column_name = 'selected_for'))`);
    expect(columns).toEqual([]);
    const owned = await db.execute<{ table_name: string; is_nullable: string }>(sql`
      select table_name, is_nullable from information_schema.columns
      where table_schema = 'public' and column_name = 'user_id' order by table_name`);
    expect(owned.map((r) => r.table_name)).toEqual([
      "attempt",
      "can_do",
      "daily_article",
      "doubt",
      "eval_run",
      "event",
      "parking_item",
      "reading_session",
      "secret",
      "setting",
      "srs_card",
      "srs_review",
      "study_session",
      "tutor_conversation",
      "tutor_message",
      "unit_progress",
      "writing_error",
      "writing_mission",
      "writing_submission",
    ]);
    // Only settings and secrets may be instance-level (no owner).
    expect(owned.filter((r) => r.is_nullable === "YES").map((r) => r.table_name)).toEqual([
      "secret",
      "setting",
    ]);
  });
});

describe.skipIf(!url)("migration 0003_user_timezone_annotations over a database at 0002", () => {
  const database = createDb(url ?? "");
  const { db } = database;
  const ARTICLE = "00000000-0000-7000-8000-000000000051";

  beforeAll(async () => {
    await resetDatabase(db);
    await migrateFirst(db, 3);
    await db.execute(sql`
      insert into app_user (id, email, password_hash, role) values
        ('00000000-0000-7000-8000-000000000061', 'a@example.com', 'x', 'admin'),
        ('00000000-0000-7000-8000-000000000062', 'b@example.com', 'x', 'learner')`);
    await db.execute(sql`
      insert into article (id, source, url, title, text, annotations) values
        (${ARTICLE}, 'manual', 'https://example.com/a', 'A', 'text', '{"glossary": []}')`);
    await db.execute(sql`
      insert into daily_article (user_id, date, article_id) values
        ('00000000-0000-7000-8000-000000000061', '2026-10-20', ${ARTICLE}),
        ('00000000-0000-7000-8000-000000000062', '2026-10-21', ${ARTICLE})`);
    await runMigrations(db);
  });

  afterAll(async () => {
    await database.close();
  });

  it("applies on top of 0002 and is a no-op when run again", async () => {
    expect(await appliedMigrations(db)).toBe(4);
    expect(await runMigrations(db)).toBe(4);
  });

  it("moves the annotations from the shared article to each user's daily pick", async () => {
    const columns = await db.execute<{ column_name: string }>(sql`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'article' and column_name = 'annotations'`);
    expect(columns).toEqual([]);
    const rows = await db.execute<{ annotations: unknown }>(
      sql`select annotations from daily_article order by date`,
    );
    expect(rows.map((r) => r.annotations)).toEqual([{ glossary: [] }, { glossary: [] }]);
  });
});

describe.skipIf(!url)("migrations + content seed (real Postgres)", () => {
  const database = createDb(url ?? "");
  const { db } = database;
  let units: Unit[];
  let learnerId: string;

  const counts = async () => ({
    blocks: (await db.select({ n: count() }).from(block))[0]?.n,
    units: (await db.select({ n: count() }).from(unit))[0]?.n,
    exercises: (await db.select({ n: count() }).from(exercise))[0]?.n,
    items: (await db.select({ n: count() }).from(exerciseItem))[0]?.n,
  });

  beforeAll(async () => {
    await resetDatabase(db);
    units = await loadUnits(resolveContentDir());
  });

  afterAll(async () => {
    await database.close();
  });

  it("applies the migrations from scratch and again as a no-op", async () => {
    const applied = await runMigrations(db);
    expect(applied).toBe(4);
    expect(await runMigrations(db)).toBe(applied);
    learnerId = (await createDrizzleUserStore(db).insert(newUser("seed@example.com"))).id;
  });

  it("generates uuidv7 ids for learner data", async () => {
    const [row] = await db.execute<{ v: number }>(sql`select uuid_extract_version(uuidv7()) as v`);
    expect(row?.v).toBe(7);
  });

  it("seeds units 1-6 with every exercise and item", async () => {
    const result = await seedContent(db, units);

    expect(result).toMatchObject({ blocks: 1, units: 6, exercises: 24, items: 174 });
    expect(result.changed).toBe(1 + 6 + 24 + 174);
    expect(await counts()).toEqual({ blocks: 1, units: 6, exercises: 24, items: 174 });
  });

  it("is idempotent and leaves learner progress untouched on re-run", async () => {
    await db.insert(unitProgress).values({
      userId: learnerId,
      unitId: 1,
      status: "completed",
      priority: 3,
      completedAt: new Date(),
    });
    await db.insert(attempt).values({
      userId: learnerId,
      itemId: "1.1-2",
      answer: ["'m looking"],
      result: { status: "correct", blanks: [{ verdict: "correct" }], score: 1 },
      correct: true,
      score: 1,
      method: "deterministic",
      attemptNo: 1,
    });

    const again = await seedContent(db, units);

    expect(again.changed).toBe(0);
    expect(await counts()).toEqual({ blocks: 1, units: 6, exercises: 24, items: 174 });
    const [p1] = await db.select().from(unitProgress).where(eq(unitProgress.unitId, 1));
    expect(p1).toMatchObject({ status: "completed", priority: 3 });
    expect((await db.select({ n: count() }).from(attempt))[0]?.n).toBe(1);
  });

  it("seeds authored story chapters, timeline items and unit extras idempotently", async () => {
    const authored = await loadAuthored(resolveContentDir());

    const first = await seedAuthored(db, authored);
    expect(first).toMatchObject({ chapters: 6, timelineItems: 30, unitExtras: 6 });
    expect(first.changed).toBe(6 + 30 + 6);
    expect((await db.select({ n: count() }).from(storyChapter))[0]?.n).toBe(6);
    const titles = await db.selectDistinct({ t: storyChapter.storyTitle }).from(storyChapter);
    expect(titles).toEqual([{ t: "Apollo 13: The Successful Failure" }]);
    expect((await db.select({ n: count() }).from(timelineItem))[0]?.n).toBe(30);

    const again = await seedAuthored(db, authored);
    expect(again.changed).toBe(0);
    const [u1] = await db.select().from(unit).where(eq(unit.id, 1));
    expect(u1?.extras).toMatchObject({ canDoEs: expect.any(Array) });
    // Learner progress set earlier survives the authored seed too.
    const [p1] = await db.select().from(unitProgress).where(eq(unitProgress.unitId, 1));
    expect(p1).toMatchObject({ status: "completed", priority: 3 });
  });

  it("updates changed content fields in place", async () => {
    const edited = units.map((u) =>
      u.number === 2 ? { ...u, title: "Simple Present (edited)" } : u,
    );

    const result = await seedContent(db, edited);

    expect(result.changed).toBe(1);
    const [u2] = await db.select({ title: unit.title }).from(unit).where(eq(unit.id, 2));
    expect(u2?.title).toBe("Simple Present (edited)");
    await seedContent(db, units);
  });

  it("persists attempt feedback and the hint level on the latest attempt", async () => {
    const store = createDrizzleUnitsStore(db);
    expect(await store.recordHintLevel(learnerId, "1.1-3", 2)).toBe(false);
    const result = {
      status: "incorrect" as const,
      blanks: [{ verdict: "incorrect" as const }],
      score: 0,
    };
    await store.insertAttempt(learnerId, {
      itemId: "1.1-3",
      inputs: ["x"],
      result,
      method: "ai",
      attemptNo: 1,
      feedback: { feedbackEs: "Revisa el verbo." },
    });
    expect(await store.recordHintLevel(learnerId, "1.1-3", 3)).toBe(true);
    expect(await store.recordHintLevel(learnerId, "1.1-3", 1)).toBe(true);
    const own = (await store.listAttempts(learnerId, 1)).filter((a) => a.itemId === "1.1-3");
    expect(own).toMatchObject([{ feedback: { feedbackEs: "Revisa el verbo." }, hintLevel: 3 }]);
    const content = await store.getUnitContent(learnerId, 1);
    expect(content?.chapter?.storyTitle).toBe("Apollo 13: The Successful Failure");
  });

  it("stores new cards with a null state and the typed review answer", async () => {
    const store = createDrizzleVocabularyStore(db);
    const card = await store.insertCard(learnerId, {
      source: "word",
      front: "thrive",
      back: "prosperar",
      ref: { word: "thrive" },
      state: {},
      due: new Date(),
    });
    const [raw] = await db
      .select({ state: srsCard.state })
      .from(srsCard)
      .where(eq(srsCard.id, card.id));
    expect(raw?.state).toBeNull();
    expect((await store.updateCard(learnerId, card.id, { suspended: true }))?.suspended).toBe(true);
    const [review] = await db.execute<{ answer: string | null }>(sql`
      select answer from srs_review where card_id = ${card.id}`);
    expect(review).toBeUndefined();
    await store.recordReview(
      learnerId,
      card.id,
      3,
      { state: { reps: 1 }, due: new Date() },
      new Date(),
      "thrive",
    );
    const [saved] = await db.execute<{ answer: string | null }>(sql`
      select answer from srs_review where card_id = ${card.id}`);
    expect(saved?.answer).toBe("thrive");
  });

  it("writes tool_name, session end data and the mission's updated_at", async () => {
    const tutor = createDrizzleTutorStore(db);
    const conversation = await tutor.createConversation(learnerId, { kind: "free", ref: "" });
    const tool = await tutor.insertMessage(learnerId, {
      conversationId: conversation.id,
      role: "tool",
      content: "{}",
      toolCalls: [{ name: "get_item" }],
    });
    expect(tool.toolName).toBe("get_item");

    const today = createDrizzleTodayStore(db);
    const session = await today.createSession(learnerId, {
      mode: "slump",
      budgetMin: 10,
      plan: { budgetMin: 10, blocks: [] } as never,
      startedAt: new Date(),
    });
    const ended = await today.endSession(learnerId, session.id, {
      endedAt: new Date(),
      bonusMin: 0,
      blocksDone: 1,
      endReason: "user",
    });
    expect(ended).toMatchObject({ mode: "slump", blocksDone: 1, endReason: "user" });

    const [mission] = await db
      .insert(writingMission)
      .values({
        userId: learnerId,
        level: 1,
        format: "tweet",
        title: "T",
        prompt: "P",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      })
      .returning();
    await createDrizzleWritingStore(db).setMissionStatus(learnerId, mission?.id ?? "", "draft");
    const [after] = await db
      .select()
      .from(writingMission)
      .where(eq(writingMission.id, mission?.id ?? ""));
    expect(after?.updatedAt.getTime()).toBeGreaterThan(Date.parse("2026-01-02"));
    expect((await today.lastWritingActivity(learnerId))?.getTime()).toBe(
      after?.updatedAt.getTime(),
    );
  });
});

const newUser = (email: string) => ({ email, passwordHash: "scrypt$x", role: "learner" as const });

describe.skipIf(!url)("users and admin bootstrap (real Postgres)", () => {
  const database = createDb(url ?? "");
  const { db } = database;
  const users = createDrizzleUserStore(db);
  const FAST = { N: 16, r: 1, p: 1 };

  beforeAll(async () => {
    await resetDatabase(db);
    await runMigrations(db);
  });

  afterAll(async () => {
    await database.close();
  });

  it("creates the admin once, keeps it on restart and moves it on an email change", async () => {
    const env = { email: "Admin@Example.com", password: "correct horse battery" };
    const created = await bootstrapAdmin(users, env, FAST);
    expect(created).toMatchObject({ action: "created", user: { email: "admin@example.com" } });
    expect((await bootstrapAdmin(users, env, FAST)).action).toBe("unchanged");

    const changed = await bootstrapAdmin(users, { ...env, password: "another passphrase" }, FAST);
    expect(changed).toMatchObject({ action: "updated", user: { id: created.user.id } });
    expect(changed.user.sessionEpoch).toBe(created.user.sessionEpoch + 1);

    const moved = await bootstrapAdmin(users, { ...env, email: "new@example.com" }, FAST);
    expect(moved.user).toMatchObject({ id: created.user.id, email: "new@example.com" });
    expect(await users.listAdmins()).toHaveLength(1);
  });

  it("enforces unique, lowercase emails and known roles", async () => {
    await users.insert(newUser("dup@example.com"));
    await expect(users.insert(newUser("dup@example.com"))).rejects.toThrow();
    await expect(users.insert(newUser("Upper@Example.com"))).rejects.toThrow();
    await expect(
      users.insert({ ...newUser("role@example.com"), role: "root" as never }),
    ).rejects.toThrow();
  });
});

describe.skipIf(!url)("data isolation between users (real Postgres)", () => {
  const database = createDb(url ?? "");
  const { db } = database;
  let a: string;
  let b: string;
  const DATE = "2026-10-26";
  const APP_SECRET = "ab".repeat(32);

  const unitsStore = createDrizzleUnitsStore(db);
  const vocabStore = createDrizzleVocabularyStore(db);
  const writingStore = createDrizzleWritingStore(db);
  const todayStore = createDrizzleTodayStore(db);
  const tutorStore = createDrizzleTutorStore(db);
  const readingStore = createDrizzleReadingStore(db);
  const progressStore = createDrizzleProgressStore(db);
  const settingsStore = createDrizzleSettingsStore(db);
  const evalStore = createDrizzleEvalStore(db);

  const article = {
    source: "manual" as const,
    url: "https://example.com/shared-article",
    title: "Shared article",
    authors: [],
    outlet: "Example",
    license: null,
    publishedAt: null,
    text: "One two three.",
    topic: "tech",
    estLevel: null,
    selectedFor: DATE,
    annotations: null,
  };

  beforeAll(async () => {
    await resetDatabase(db);
    await runMigrations(db);
    await seedContent(db, await loadUnits(resolveContentDir()));
    const users = createDrizzleUserStore(db);
    a = (await users.insert(newUser("a@example.com"))).id;
    b = (await users.insert(newUser("b@example.com"))).id;
  });

  afterAll(async () => {
    await database.close();
  });

  it("units: attempts, progress, completion and doubts stay with their user", async () => {
    await unitsStore.insertAttempt(a, {
      itemId: "1.1-2",
      inputs: ["x"],
      result: { status: "incorrect", blanks: [{ verdict: "incorrect" }], score: 0 },
      method: "deterministic",
      attemptNo: 1,
      feedback: null,
    });
    await unitsStore.markInProgress(a, 2);
    expect(await unitsStore.completeUnit(a, 1, { ratio: 1 }, ["Puedo X"])).toBe(true);
    await unitsStore.insertDoubt(a, "why?", { screen: "unit" }, null);

    expect(await unitsStore.listAttempts(b)).toEqual([]);
    expect(await unitsStore.recordHintLevel(b, "1.1-2", 2)).toBe(false);
    expect((await unitsStore.listUnits(b)).map((u) => u.status)).toEqual(Array(6).fill("new"));
    expect((await unitsStore.getUnitContent(b, 1))?.unit.completedAt).toBeNull();
    // B completes the same unit independently.
    expect(await unitsStore.completeUnit(b, 1, {}, [])).toBe(true);
    expect(await unitsStore.completeUnit(a, 1, {}, [])).toBe(false);
    const statusesA = (await unitsStore.listUnits(a)).map((u) => u.status);
    expect(statusesA.slice(0, 2)).toEqual(["completed", "in_progress"]);
  });

  it("vocabulary: cards, reviews and events are invisible and untouchable for others", async () => {
    const vocabulary = createVocabulary({ store: vocabStore });
    const { cardId } = await vocabulary.createOwnErrorCard(a, {
      original: "I am agree",
      corrected: "I agree",
    });
    await vocabStore.recordReview(
      a,
      cardId,
      3,
      { state: { reps: 1 }, due: new Date() },
      new Date(),
    );
    await vocabulary.completeSession(a, { reviewed: 1, again: 0 } as never);

    expect((await vocabulary.list(b)).cards).toEqual([]);
    expect((await vocabulary.queue(b)).cards).toEqual([]);
    expect(await vocabStore.getCard(b, cardId)).toBeUndefined();
    expect(await vocabStore.updateCard(b, cardId, { suspended: true })).toBeUndefined();
    expect(await vocabStore.deleteCard(b, cardId)).toBe(false);
    expect(
      await vocabStore.recordReview(
        b,
        cardId,
        1,
        { state: { reps: 2 }, due: new Date() },
        new Date(),
      ),
    ).toBeUndefined();
    expect(await vocabStore.countFirstReviewsSince(b, new Date(0))).toBe(0);
    expect(await vocabStore.reviewTimesSince(b, new Date(0))).toEqual([]);
    await expect(vocabulary.remove(b, cardId)).rejects.toMatchObject({ code: "not_found" });
    expect((await vocabulary.list(a)).cards).toHaveLength(1);
  });

  it("writing: missions, submissions, errors and unit priority stay with their user", async () => {
    const { mission, submission } = await writingStore.createMission(
      a,
      { level: 1, format: "tweet", title: "T", promptEn: "P", targetUnitId: 1, status: "pending" },
      {
        textOriginal: "",
        meta: {
          topic: "t",
          whyEs: null,
          grammarTargets: [],
          suggestedWords: [],
          limits: { minWords: 1, maxWords: 50, maxChars: null },
          inspiration: [],
          source: "fallback",
        },
        flow: initialFlow(),
      },
    );
    await writingStore.insertErrors(a, submission.id, [
      {
        span: parseErrorSpan({ text: "am agree" }),
        type: "grammar",
        unitId: 1,
        hint: "h",
        fixed: false,
      },
    ]);
    await writingStore.raiseUnitPriority(a, 1, 2);
    await writingStore.updateSubmission(b, submission.id, { textOriginal: "hijacked" });
    await writingStore.setMissionStatus(b, mission.id, "done");

    expect(await writingStore.activeMission(b)).toBeUndefined();
    expect(await writingStore.getMission(b, mission.id)).toBeUndefined();
    expect(await writingStore.listMissions(b)).toEqual([]);
    expect(await writingStore.listErrors(b, [submission.id])).toEqual([]);
    expect(await writingStore.recentErrors(b, 10)).toEqual([]);
    expect((await writingStore.listUnits(b)).find((u) => u.id === 1)?.priority).toBe(0);
    const own = await writingStore.getMission(a, mission.id);
    expect(own?.mission.status).toBe("pending");
    expect(own?.submission.textOriginal).toBe("");
    expect((await writingStore.listUnits(a)).find((u) => u.id === 1)?.priority).toBe(2);
  });

  it("today: study sessions, parking items and writing activity stay with their user", async () => {
    const session = await todayStore.createSession(a, {
      mode: "full",
      budgetMin: 25,
      plan: { budgetMin: 25, blocks: [] } as never,
      startedAt: new Date(),
    });
    const parked = await todayStore.createParking(a, "look up idioms");

    expect(await todayStore.listSessionsSince(b, new Date(0))).toEqual([]);
    expect(await todayStore.listOpenSessions(b)).toEqual([]);
    expect(await todayStore.getSession(b, session.id)).toBeUndefined();
    const end = { endedAt: new Date(), bonusMin: 0, blocksDone: 0, endReason: "user" as const };
    expect(await todayStore.endSession(b, session.id, end)).toBeUndefined();
    expect(await todayStore.listParking(b)).toEqual([]);
    expect(await todayStore.updateParking(b, parked.id, { done: true })).toBeUndefined();
    expect(await todayStore.deleteParking(b, parked.id)).toBe(false);
    expect(await todayStore.lastWritingActivity(b)).toBeUndefined();
    expect(await todayStore.listOpenSessions(a)).toHaveLength(1);
    expect(await todayStore.listParking(a)).toMatchObject([
      { text: "look up idioms", done: false },
    ]);
  });

  it("progress: events, can-do entries and every read model stay with their user", async () => {
    const progress = createProgress({ store: progressStore });
    await progress.addCanDo(a, "I can order coffee");
    await progressStore.insertEvent(a, "mirror_viewed", { month: "2026-09" });

    // B's only events are its own (the unit it completed above).
    expect(await progressStore.listEvents(b, { types: ["mirror_viewed"] })).toEqual([]);
    expect((await progressStore.listEvents(b)).map((e) => e.type)).toEqual(["unit_completed"]);
    expect(await progressStore.firstEventAt(b, ["unit_completed"])).toBeUndefined();
    expect((await progress.listCanDo(b)).entries).toEqual([]);
    expect(await progressStore.listWordCards(b)).toEqual([]);
    expect(await progressStore.listSubmissions(b)).toEqual([]);
    expect(await progressStore.listErrors(b)).toEqual([]);
    expect(await progressStore.listReadings(b)).toEqual([]);
    expect((await progressStore.listCanDo(a)).map((c) => c.text)).toContain("I can order coffee");
    expect((await progressStore.listEvents(a)).length).toBeGreaterThan(0);
  });

  it("tutor: conversations, messages and doubts stay with their user", async () => {
    const conversation = await tutorStore.createConversation(a, { kind: "free", ref: "" });
    await tutorStore.insertMessage(a, {
      conversationId: conversation.id,
      role: "user",
      content: "hello",
      toolCalls: null,
    });
    await tutorStore.insertDoubt(a, "a doubt", { screen: "tutor" });

    expect(await tutorStore.getConversation(b, conversation.id)).toBeUndefined();
    expect(await tutorStore.listConversations(b, 10)).toEqual([]);
    expect(await tutorStore.listMessages(b, conversation.id)).toEqual([]);
    expect(await tutorStore.listConversations(a, 10)).toMatchObject([
      { id: conversation.id, firstUserMessage: "hello" },
    ]);
  });

  it("reading: the daily article is per user while the article pool is shared", async () => {
    const annotations = { glossary: [], questions: [], grammarSpots: [] } as never;
    const first = await readingStore.insertArticle(a, { ...article, annotations });
    expect(first.created).toBe(true);
    await readingStore.saveSession(a, {
      id: null,
      articleId: first.article.id,
      prediction: "p",
      opinion: null,
      entries: [],
      spots: [],
      completedAt: null,
    });
    await readingStore.insertWordCard(a, {
      articleId: first.article.id,
      word: "thrive",
      front: "f",
      back: "b",
      ref: {},
    });

    expect(await readingStore.getArticleForDate(b, DATE)).toBeUndefined();
    expect(await readingStore.getArticle(b, first.article.id)).toBeUndefined();
    expect(await readingStore.listDailyArticles(b)).toEqual([]);
    expect(await readingStore.usedUrls(b, [article.url])).toEqual(new Set());
    expect(await readingStore.getSession(b, first.article.id)).toBeUndefined();
    expect(await readingStore.knownWords(b)).toEqual([]);
    expect(await readingStore.savedWords(b, first.article.id)).toEqual([]);
    // A finished unit 1 earlier; B finished it too, so both point at unit 2 now.
    expect((await readingStore.currentUnit(a))?.id).toBe(2);

    // B gets the same article: the pool row is reused, A's annotations are not.
    const second = await readingStore.insertArticle(b, { ...article, annotations: null });
    expect(second).toMatchObject({ created: true, article: { id: first.article.id } });
    expect(second.article.annotations).toBeNull();
    expect((await readingStore.getArticle(a, first.article.id))?.annotations).toEqual(annotations);

    // Each user annotates their own copy; nobody sees the other's.
    const forB = { glossary: [{ term: "b" }], questions: [], grammarSpots: [] } as never;
    await readingStore.setAnnotations(b, first.article.id, forB);
    expect((await readingStore.getArticle(b, first.article.id))?.annotations).toEqual(forB);
    expect((await readingStore.getArticleForDate(a, DATE))?.annotations).toEqual(annotations);
    const forA = { glossary: [{ term: "a" }], questions: [], grammarSpots: [] } as never;
    await readingStore.setAnnotations(a, first.article.id, forA);
    expect((await readingStore.getArticleForDate(b, DATE))?.annotations).toEqual(forB);
    expect((await readingStore.listDailyArticles(a))[0]?.annotations).toEqual(forA);
    expect(await readingStore.getSession(b, first.article.id)).toBeUndefined();
    const again = await readingStore.insertArticle(a, {
      ...article,
      url: "https://example.com/other",
    });
    expect(again).toMatchObject({ created: false, article: { id: first.article.id } });
    expect(await readingStore.usedUrls(a, [article.url])).toEqual(new Set([article.url]));
  });

  it("settings: keys, AI function choices and preferences are per user", async () => {
    const settings = createSettings({
      store: settingsStore,
      appSecret: APP_SECRET,
      createClient: () => createFakeLlm({}),
    });
    const preferences = createPreferences(settingsStore);
    await settings.setKey(a, "ollama-key-of-a-1234");
    await settingsStore.putSetting(a, "ai_function:check_answer", { model: "m", think: null });
    await preferences.update(a, { "srs.newPerDay": 12 } as never);

    expect(await settings.keyStatus(b)).toEqual({ configured: false, source: null, last4: null });
    expect(await settings.getApiKey(b)).toBeUndefined();
    expect(await settingsStore.getSetting(b, "ai_function:check_answer")).toBeUndefined();
    expect(await preferences.get(b)).toEqual({
      ...PREFERENCE_DEFAULTS,
      "clock.timeZoneChosen": false,
    });
    await preferences.update(a, { "clock.timeZone": "America/La_Paz" });
    expect(await preferences.timeZoneOf(a)).toBe("America/La_Paz");
    expect(await preferences.timeZoneOf(b)).toBe("UTC");
    expect(await settings.getApiKey(a)).toBe("ollama-key-of-a-1234");
    expect((await preferences.get(a))["srs.newPerDay" as never]).toBe(12);
  });

  it("eval: runs are listed and read only by their user", async () => {
    const run = await evalStore.create(a, "m", {
      version: 1,
      think: null,
      functions: ["review_writing"],
      status: "completed",
      progress: { done: 0, total: 0 },
      startedAt: null,
      finishedAt: null,
      error: null,
      samples: [],
      aggregate: null,
    });
    expect(await evalStore.list(b, 10)).toEqual([]);
    expect(await evalStore.get(b, run.id)).toBeUndefined();
    expect((await evalStore.listAllUsers(10)).map((r) => r.userId)).toContain(a);
  });

  it("deleting a user deletes their data and nobody else's", async () => {
    await db.delete(appUser).where(eq(appUser.id, a));
    const owned = async (userId: string) =>
      (
        await db.execute<{ n: number }>(sql`
          select (select count(*) from attempt where user_id = ${userId})
            + (select count(*) from srs_card where user_id = ${userId})
            + (select count(*) from event where user_id = ${userId})
            + (select count(*) from daily_article where user_id = ${userId})
            + (select count(*) from secret where user_id = ${userId})
            + (select count(*) from unit_progress where user_id = ${userId}) as n`)
      )[0]?.n;
    expect(Number(await owned(a))).toBe(0);
    expect(Number(await owned(b))).toBeGreaterThan(0);
    expect((await db.select({ n: count() }).from(unit))[0]?.n).toBe(6);
  });
});
