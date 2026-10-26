import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Unit } from "@english-course/shared";
import { count, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveContentDir } from "../../content/content-dir.ts";
import { createDrizzleTodayStore } from "../../today/today.store.ts";
import { createDrizzleTutorStore } from "../../tutor/tutor.store.ts";
import { createDrizzleUnitsStore } from "../../units/units.store.ts";
import { createDrizzleVocabularyStore } from "../../vocabulary/vocabulary.store.ts";
import { createDrizzleWritingStore } from "../../writing/writing.store.ts";
import { createDb, type Db } from "./client.ts";
import { MIGRATIONS_DIR, runMigrations } from "./migrate.ts";
import {
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
    await runMigrations(db);
  });

  afterAll(async () => {
    await database.close();
  });

  it("records both migrations and is a no-op when run again", async () => {
    expect(await runMigrations(db)).toBe(2);
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
    const store = createDrizzleVocabularyStore(db);
    expect((await store.newCards(10)).map((c) => c.front)).toEqual(["a"]);
    expect((await store.dueCards(new Date("2026-12-01"), 10)).map((c) => c.front)).toEqual(["d"]);
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
    const [mission] = await db.select().from(writingMission);
    expect(mission?.updatedAt.toISOString()).toBe("2026-10-01T10:00:00.000Z");
  });
});

describe.skipIf(!url)("migrations + content seed (real Postgres)", () => {
  const database = createDb(url ?? "");
  const { db } = database;
  let units: Unit[];

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
    expect(applied).toBeGreaterThan(0);
    expect(await runMigrations(db)).toBe(applied);
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
    await db
      .update(unit)
      .set({ status: "completed", priority: 3, completedAt: new Date() })
      .where(eq(unit.id, 1));
    await db.insert(attempt).values({
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
    const [u1] = await db.select().from(unit).where(eq(unit.id, 1));
    expect(u1).toMatchObject({ status: "completed", priority: 3 });
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
    expect(u1).toMatchObject({ status: "completed", priority: 3 });
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
    expect(await store.recordHintLevel("1.1-3", 2)).toBe(false);
    const result = {
      status: "incorrect" as const,
      blanks: [{ verdict: "incorrect" as const }],
      score: 0,
    };
    await store.insertAttempt({
      itemId: "1.1-3",
      inputs: ["x"],
      result,
      method: "ai",
      attemptNo: 1,
      feedback: { feedbackEs: "Revisa el verbo." },
    });
    expect(await store.recordHintLevel("1.1-3", 3)).toBe(true);
    expect(await store.recordHintLevel("1.1-3", 1)).toBe(true);
    const own = (await store.listAttempts(1)).filter((a) => a.itemId === "1.1-3");
    expect(own).toMatchObject([{ feedback: { feedbackEs: "Revisa el verbo." }, hintLevel: 3 }]);
    const content = await store.getUnitContent(1);
    expect(content?.chapter?.storyTitle).toBe("Apollo 13: The Successful Failure");
  });

  it("stores new cards with a null state and the typed review answer", async () => {
    const store = createDrizzleVocabularyStore(db);
    const card = await store.insertCard({
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
    expect((await store.updateCard(card.id, { suspended: true }))?.suspended).toBe(true);
    const [review] = await db.execute<{ answer: string | null }>(sql`
      select answer from srs_review where card_id = ${card.id}`);
    expect(review).toBeUndefined();
    await store.recordReview(
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
    const conversation = await tutor.createConversation({ kind: "free", ref: "" });
    const tool = await tutor.insertMessage({
      conversationId: conversation.id,
      role: "tool",
      content: "{}",
      toolCalls: [{ name: "get_item" }],
    });
    expect(tool.toolName).toBe("get_item");

    const today = createDrizzleTodayStore(db);
    const session = await today.createSession({
      mode: "slump",
      budgetMin: 10,
      plan: { budgetMin: 10, blocks: [] } as never,
      startedAt: new Date(),
    });
    const ended = await today.endSession(session.id, {
      endedAt: new Date(),
      bonusMin: 0,
      blocksDone: 1,
      endReason: "user",
    });
    expect(ended).toMatchObject({ mode: "slump", blocksDone: 1, endReason: "user" });

    const [mission] = await db
      .insert(writingMission)
      .values({
        level: 1,
        format: "tweet",
        title: "T",
        prompt: "P",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      })
      .returning();
    await createDrizzleWritingStore(db).setMissionStatus(mission?.id ?? "", "draft");
    const [after] = await db
      .select()
      .from(writingMission)
      .where(eq(writingMission.id, mission?.id ?? ""));
    expect(after?.updatedAt.getTime()).toBeGreaterThan(Date.parse("2026-01-02"));
    expect((await today.lastWritingActivity())?.getTime()).toBe(after?.updatedAt.getTime());
  });
});
