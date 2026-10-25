import type { Unit } from "@english-course/shared";
import { count, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveContentDir } from "../../content/content-dir.ts";
import { createDb } from "./client.ts";
import { runMigrations } from "./migrate.ts";
import { attempt, block, exercise, exerciseItem, unit } from "./schema/index.ts";
import { loadUnits } from "./seed/load-content.ts";
import { seedContent } from "./seed/seed-content.ts";

/**
 * Runs against a real, disposable Postgres database (its public and drizzle schemas are
 * dropped). Set DATABASE_URL_TEST, or run `pnpm --filter @english-course/api test:db`.
 */
const url = process.env.DATABASE_URL_TEST;

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
    const name = new URL(url ?? "").pathname.slice(1);
    if (!name.endsWith("_test")) {
      throw new Error(`Refusing to reset "${name}": the test database name must end with _test`);
    }
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`create schema public`);
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
});
