import { describe, expect, it } from "vitest";
import { parseAnswer } from "./parse-answer.ts";

const fill = { blankCount: 1, hasUnderline: false, open: false };

describe("parseAnswer", () => {
  it("accepts both the contraction and its full form", () => {
    const answer = parseAnswer("’m looking (am looking)", fill);
    expect(answer.blanks).toEqual([["’m looking", "am looking"]]);
    expect(answer.kind).toBe("blanks");
    expect(answer.needsAi).toBe(false);
  });

  it("splits alternatives on ' / ' and expands each full form", () => {
    const answer = parseAnswer("aren’t speaking / ’re not speaking (are not speaking)", fill);
    expect(answer.blanks).toEqual([["aren’t speaking", "’re not speaking", "are not speaking"]]);
  });

  it("splits alternatives on ' or '", () => {
    const answer = parseAnswer("don’t remember or can’t remember", fill);
    expect(answer.blanks).toEqual([["don’t remember", "can’t remember"]]);
  });

  it("splits multiple blanks on ' . . . '", () => {
    const answer = parseAnswer("’re making (are making) . . . ’m trying (am trying)", {
      ...fill,
      blankCount: 2,
    });
    expect(answer.blanks).toEqual([
      ["’re making", "are making"],
      ["’m trying", "am trying"],
    ]);
    expect(answer.needsAi).toBe(false);
  });

  it("splits dialogue blanks on ' | '", () => {
    const answer = parseAnswer(
      "is your new job going | it’s getting | he isn’t enjoying / he’s not enjoying | he’s beginning",
      { ...fill, blankCount: 4 },
    );
    expect(answer.blanks).toEqual([
      ["is your new job going"],
      ["it’s getting"],
      ["he isn’t enjoying", "he’s not enjoying"],
      ["he’s beginning"],
    ]);
  });

  it("expands a slash inside the full form", () => {
    const answer = parseAnswer("She didn’t have / She didn’t eat (She did not have/eat)", fill);
    expect(answer.blanks).toEqual([
      ["She didn’t have", "She didn’t eat", "She did not have", "She did not eat"],
    ]);
  });

  it("keeps optional words in parentheses that are not a full form", () => {
    const answer = parseAnswer("took her (about) half an hour", fill);
    expect(answer.blanks).toEqual([["took her (about) half an hour"]]);
  });

  it("marks error-correction items as ok-or-fix", () => {
    expect(parseAnswer("OK", { ...fill, hasUnderline: true })).toMatchObject({
      kind: "ok-or-fix",
      blanks: [["OK"]],
      needsAi: false,
    });
  });

  it("marks whole-sentence answers as sentence", () => {
    const answer = parseAnswer("Which newspaper do you read?", fill);
    expect(answer.kind).toBe("sentence");
    expect(answer.needsAi).toBe(false);
  });

  it("flags a single answer for two blanks (4.2 item 2)", () => {
    const answer = parseAnswer("What are you doing? I’m thinking.", { ...fill, blankCount: 2 });
    expect(answer.needsAi).toBe(true);
    expect(answer.aiReason).toMatch(/1 part.*2 blanks/);
  });

  it("treats an ellipsis that starts an alternative as a wildcard (3.3 item 3)", () => {
    const answer = parseAnswer("’m always making the same mistake. / . . . that mistake.", fill);
    expect(answer.blanks).toEqual([["’m always making the same mistake.", ". . . that mistake."]]);
    expect(answer.needsAi).toBe(true);
    expect(answer.aiReason).toMatch(/wildcard/);
  });

  it("marks open answers as needing AI", () => {
    const answer = parseAnswer("I was in bed asleep. / I was sleeping.", { ...fill, open: true });
    expect(answer.kind).toBe("open");
    expect(answer.needsAi).toBe(true);
  });

  it("strips HTML from the raw answer", () => {
    expect(parseAnswer("<em>is</em>  losing", fill).raw).toBe("is losing");
  });
});
