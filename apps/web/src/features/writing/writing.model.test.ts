import { describe, expect, it } from "vitest";
import { errorStatusLabel } from "./writing.model.ts";

describe("errorStatusLabel", () => {
  it("names every status", () => {
    expect(errorStatusLabel("open")).toBe("To fix");
    expect(errorStatusLabel("fixed")).toBe("Fixed");
    expect(errorStatusLabel("changed")).toBe("Changed, still wrong");
    expect(errorStatusLabel("remaining")).toBe("Not changed yet");
  });
});
