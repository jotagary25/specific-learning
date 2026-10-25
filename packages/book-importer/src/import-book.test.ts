import { existsSync } from "node:fs";
import { Unit, UnitIndex } from "@english-course/shared";
import { describe, expect, it } from "vitest";
import { DEFAULT_BOOK_DIR, importBook } from "./import-book.ts";

// [exercise id, total items, graded (non-example) items] — from the book source map.
const EXPECTED: Record<number, [string, number, number][]> = {
  1: [
    ["1.1", 8, 7],
    ["1.2", 9, 7],
    ["1.3", 2, 2],
    ["1.4", 5, 4],
  ],
  2: [
    ["2.1", 7, 6],
    ["2.2", 8, 7],
    ["2.3", 9, 7],
    ["2.4", 6, 5],
    ["2.5", 5, 4],
  ],
  3: [
    ["3.1", 11, 9],
    ["3.2", 17, 15],
    ["3.3", 4, 3],
  ],
  4: [
    ["4.1", 5, 4],
    ["4.2", 6, 5],
    ["4.3", 10, 9],
    ["4.4", 5, 4],
  ],
  5: [
    ["5.1", 12, 11],
    ["5.2", 6, 5],
    ["5.3", 6, 5],
    ["5.4", 9, 7],
  ],
  6: [
    ["6.1", 6, 4],
    ["6.2", 5, 4],
    ["6.3", 3, 3],
    ["6.4", 10, 9],
  ],
};

const THEORY_SECTIONS: Record<number, number> = { 1: 4, 2: 5, 3: 2, 4: 5, 5: 4, 6: 5 };

describe.skipIf(!existsSync(DEFAULT_BOOK_DIR))("importBook (units 1–6)", () => {
  const result = importBook({ bookDir: DEFAULT_BOOK_DIR, units: [1, 2, 3, 4, 5, 6] });
  const unit = (n: number) => {
    const found = result.units.find((u) => u.number === n);
    if (!found) throw new Error(`unit ${n} missing`);
    return found;
  };
  const exercise = (id: string) => {
    const found = unit(Number(id.split(".")[0])).exercises.find((e) => e.id === id);
    if (!found) throw new Error(`exercise ${id} missing`);
    return found;
  };
  const item = (id: string, num: string) => {
    const found = exercise(id).items.find((i) => i.num === num);
    if (!found) throw new Error(`item ${id} ${num} missing`);
    return found;
  };

  it("produces units that pass the content schema", () => {
    expect(result.units).toHaveLength(6);
    for (const u of result.units) expect(() => Unit.parse(u)).not.toThrow();
    expect(() => UnitIndex.parse(result.index)).not.toThrow();
  });

  it("reads titles and block 1 from the book index", () => {
    expect(unit(1)).toMatchObject({ title: "Present Continuous", subtitle: "(I am doing)" });
    expect(unit(6).block).toEqual({ id: 1, title: "Present and Past", range: { from: 1, to: 6 } });
  });

  it("keeps the theory sections A–E", () => {
    for (const [n, count] of Object.entries(THEORY_SECTIONS)) {
      expect(unit(Number(n)).theory.map((s) => s.letter)).toHaveLength(count);
    }
    expect(unit(1).theory[0]?.html).toContain('<img src="/content/images/unit_001_sarah.png"');
    expect(unit(1).theory[0]?.html).not.toContain("style=");
  });

  it.each(Object.entries(EXPECTED))(
    "unit %s has the expected exercises and item counts",
    (n, rows) => {
      const exercises = unit(Number(n)).exercises;
      expect(exercises.map((e) => e.id)).toEqual(rows.map(([id]) => id));
      for (const [id, total, graded] of rows) {
        const items = exercise(id).items;
        expect(items, id).toHaveLength(total);
        expect(
          items.filter((i) => !i.isExample),
          id,
        ).toHaveLength(graded);
      }
    },
  );

  it("gives every graded item an answer, and examples none", () => {
    for (const u of result.units) {
      for (const e of u.exercises) {
        for (const i of e.items) {
          expect(Boolean(i.answer), `${e.id} ${i.num}`).toBe(!i.isExample);
        }
      }
    }
  });

  it("maps answers to blanks whenever the item is not flagged for AI", () => {
    for (const u of result.units) {
      for (const e of u.exercises) {
        for (const i of e.items) {
          if (!i.answer || i.answer.needsAi) continue;
          const blanks = i.lines.flat().filter((s) => s.type === "blank");
          expect(i.answer.blanks, `${e.id} ${i.num}`).toHaveLength(blanks.length);
        }
      }
    }
  });

  it("builds 1.3 items from the dialogue paragraphs", () => {
    expect(item("1.3", "1.").lines.length).toBeGreaterThan(5);
    expect(item("1.3", "1.").answer?.blanks).toHaveLength(3);
    expect(item("1.3", "2.").answer?.blanks).toHaveLength(4);
    expect(item("1.3", "1.").lines.flat()).toContainEqual({
      type: "example",
      text: "What's he doing",
    });
  });

  it("reads word banks with the used flag", () => {
    expect(exercise("1.1").wordBank).toContainEqual({ text: "work", used: true });
    expect(exercise("1.1").wordBank).toContainEqual({ text: "get", used: false });
  });

  it("keeps underlined targets for error correction", () => {
    expect(item("3.1", "4.").lines.flat()).toContainEqual({ type: "underline", text: "talk" });
    expect(item("3.1", "5.").answer).toMatchObject({ kind: "ok-or-fix", blanks: [["OK"]] });
  });

  it("captures the 5.1 reading passage", () => {
    expect(exercise("5.1").passage).toContain("I usually get up at 7:00");
    expect(exercise("5.1").passage).not.toContain("blank");
  });

  it("flags unreliable keys for AI", () => {
    expect(item("4.2", "2.").answer?.needsAi).toBe(true);
    expect(item("3.3", "3.").answer?.needsAi).toBe(true);
    expect(item("4.2", "3.").answer).toMatchObject({ kind: "sentence", needsAi: false });
  });

  it("evaluates open exercises with AI", () => {
    expect(exercise("6.1").evaluation).toBe("ai");
    expect(exercise("6.2").evaluation).toBe("ai");
    expect(exercise("6.3").evaluation).toBe("auto");
    expect(item("6.2", "3.").answer).toMatchObject({ kind: "open", needsAi: true });
  });

  it("treats a partly pre-filled item with blanks as graded (6.3 item 1)", () => {
    expect(item("6.3", "1.")).toMatchObject({ isExample: false });
    expect(item("6.3", "1.").answer?.blanks).toEqual([["didn’t see"], ["was looking"]]);
  });

  it("lists only referenced images", () => {
    expect(result.images.sort()).toEqual([
      "unit_001_sarah.png",
      "unit_001_steve.png",
      "unit_002_alex.png",
      "unit_003_losing_keys.png",
      "unit_003_tl_continuous.png",
      "unit_003_tl_simple.png",
      "unit_005_mozart.png",
      "unit_006_tennis.png",
      "unit_006_timeline.png",
    ]);
  });

  it("does not crash on units outside 1–6", () => {
    expect(() => importBook({ bookDir: DEFAULT_BOOK_DIR, units: [7, 50, 142] })).not.toThrow();
  });
});
