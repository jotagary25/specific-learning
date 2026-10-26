import { describe, expect, it } from "vitest";
import { allowedActions, type FlowSnapshot, missionStatusFor } from "./writing.flow.ts";

const snap = (patch: Partial<FlowSnapshot>): FlowSnapshot => ({
  status: "draft",
  round: 0,
  openErrors: 0,
  hasText: true,
  ...patch,
});

describe("writing flow state machine", () => {
  it("draft: save and submit (submit needs text), no recheck or rewrite", () => {
    expect(allowedActions(snap({}))).toMatchObject({
      saveDraft: true,
      submit: true,
      recheck: false,
      rewrite: false,
      complete: false,
      skip: true,
    });
    expect(allowedActions(snap({ hasText: false })).submit).toBe(false);
  });

  it("reviewed with open errors: recheck, not rewrite", () => {
    const can = allowedActions(snap({ status: "reviewed", openErrors: 2 }));
    expect(can).toMatchObject({ saveDraft: true, submit: false, recheck: true, rewrite: false });
  });

  it("reviewed without errors goes straight to rewrite", () => {
    const can = allowedActions(snap({ status: "reviewed", openErrors: 0 }));
    expect(can).toMatchObject({ recheck: false, rewrite: true, complete: true });
  });

  it("allows at most two recheck rounds, then rewrite even with errors left", () => {
    expect(allowedActions(snap({ status: "rechecked", round: 1, openErrors: 1 })).recheck).toBe(
      true,
    );
    const last = allowedActions(snap({ status: "rechecked", round: 2, openErrors: 1 }));
    expect(last).toMatchObject({ recheck: false, rewrite: true, saveDraft: true });
  });

  it("rewritten: complete only; completed: mark published only", () => {
    expect(allowedActions(snap({ status: "rewritten", round: 1 }))).toMatchObject({
      saveDraft: false,
      recheck: false,
      rewrite: false,
      complete: true,
      markPublished: true,
    });
    expect(allowedActions(snap({ status: "completed" }))).toEqual({
      saveDraft: false,
      submit: false,
      recheck: false,
      rewrite: false,
      complete: false,
      skip: false,
      markPublished: true,
    });
    expect(Object.values(allowedActions(snap({ status: "skipped" }))).some(Boolean)).toBe(false);
  });

  it("maps flow states to the stored mission status", () => {
    expect(missionStatusFor("draft", false)).toBe("pending");
    expect(missionStatusFor("draft", true)).toBe("draft");
    expect(missionStatusFor("rechecked", true)).toBe("submitted");
    expect(missionStatusFor("completed", true)).toBe("done");
    expect(missionStatusFor("skipped", true)).toBe("done");
  });
});
