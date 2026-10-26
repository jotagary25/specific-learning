import { describe, expect, it } from "vitest";
import { fallbackMission, pickTargetUnit } from "./missions.ts";

const unit = (id: number, patch: { completed?: boolean; priority?: number } = {}) => ({
  id,
  title: `Unit ${id}`,
  subtitle: "",
  completed: patch.completed ?? false,
  priority: patch.priority ?? 0,
});

describe("pickTargetUnit", () => {
  it("prefers the unit with the highest raised priority", () => {
    const units = [unit(1, { completed: true, priority: 1 }), unit(2), unit(5, { priority: 3 })];
    expect(pickTargetUnit(units)?.id).toBe(5);
  });

  it("otherwise picks the lowest unit not completed, then the last unit", () => {
    expect(pickTargetUnit([unit(1, { completed: true }), unit(2), unit(3)])?.id).toBe(2);
    expect(pickTargetUnit([unit(1, { completed: true }), unit(2, { completed: true })])?.id).toBe(
      2,
    );
    expect(pickTargetUnit([])).toBeNull();
  });
});

describe("fallbackMission", () => {
  it("builds a mission for the format and unit from the built-in templates", () => {
    const mission = fallbackMission({
      format: "tweet",
      targetUnit: { id: 5, title: "Simple Past" },
      inspiration: [{ title: "Robots that sort recycling", opinion: "Robots help." }],
    });
    expect(mission).toMatchObject({
      format: "tweet",
      targetUnitId: 5,
      constraints: { minWords: 15, maxWords: 50 },
    });
    expect(mission.title).toBeTruthy();
    expect(mission.promptEn).toContain("Robots that sort recycling");
    expect(mission.constraints.grammarTargets.join(" ")).toMatch(/past/i);
  });

  it("works without a unit or reading inspiration", () => {
    const mission = fallbackMission({ format: "article", targetUnit: null, inspiration: [] });
    expect(mission.format).toBe("article");
    expect(mission.targetUnitId).toBeNull();
    expect(mission.constraints).toMatchObject({ minWords: 300, maxWords: 600 });
    expect(mission.promptEn.length).toBeGreaterThan(20);
  });
});
