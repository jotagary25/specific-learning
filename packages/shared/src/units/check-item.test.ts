import { describe, expect, it } from "vitest";
import { checkItem } from "./check-item.ts";
import { realItem } from "./test-support.ts";

type Status = "correct" | "partial" | "incorrect" | "needs-ai";

const cases: Array<[string, string[], Status]> = [
  // 1.1 #2: ’m looking (am looking)
  ["1.1#2", ["'m looking"], "correct"],
  ["1.1#2", ["am looking"], "correct"],
  ["1.1#2", ["’m looking"], "correct"],
  ["1.1#2", ["AM LOOKING"], "correct"],
  ["1.1#2", ["look"], "incorrect"],
  // 1.1 #7: two blanks
  ["1.1#7", ["are making", "'m trying"], "correct"],
  ["1.1#7", ["are making", "try"], "partial"],
  ["1.1#7", ["make", "try"], "incorrect"],
  // 1.2 negatives
  ["1.2#7", ["aren't speaking"], "correct"],
  ["1.2#7", ["are not speaking"], "correct"],
  ["1.2#7", ["'re not speaking"], "correct"],
  ["1.2#7", ["don't speak"], "incorrect"],
  ["1.2#9", ["’s not working"], "correct"],
  // 1.3 dialogue blanks
  ["1.3#1", ["What's he studying", "Is he enjoying", "he's learning"], "correct"],
  ["1.3#1", ["What is he studying?", "Is he enjoying", "he is learning"], "correct"],
  [
    "1.3#2",
    ["is your new job going", "it is getting", "he's not enjoying", "he's beginning"],
    "correct",
  ],
  ["1.3#2", ["is your new job going", "it gets", "he doesn't enjoy", "he's beginning"], "partial"],
  // 2.4 #2: sentence split into two blanks
  ["2.4#2", ["Does", "play tennis"], "correct"],
  ["2.4#3", ["which newspaper do you read"], "correct"],
  ["2.4#3", ["Which newspaper you read?"], "incorrect"],
  // 3.1 OK-or-fix
  ["3.1#5", ["OK"], "correct"],
  ["3.1#5", ["ok"], "correct"],
  ["3.1#5", ["correct"], "correct"],
  ["3.1#5", ["is going"], "incorrect"],
  ["3.1#3", ["is trying"], "correct"],
  ["3.1#3", ["OK"], "incorrect"],
  ["3.1#6", ["It is getting"], "correct"],
  // 3.3 #3: wildcard alternative (flagged needsAi, deterministic match still wins)
  ["3.3#3", ["’m always making the same mistake"], "correct"],
  ["3.3#3", ["am always making that mistake"], "correct"],
  ["3.3#3", ["make mistakes"], "needs-ai"],
  // 4.2 #2: one key part for two blanks
  ["4.2#2", ["What are you doing?", "I'm thinking."], "correct"],
  ["4.2#2", ["What do you do?", "I think."], "needs-ai"],
  // 5.1 #4: optional word in parentheses
  ["5.1#4", ["took her half an hour"], "correct"],
  // 6.1 open
  ["6.1#3", ["I was working."], "needs-ai"],
  ["6.2#2", ["was taking a shower"], "needs-ai"],
  // 6.3 #2: five blanks with an "or" alternative
  ["6.3#2", ["met", "were going", "was going", "talked", "waited"], "correct"],
];

describe("checkItem on real units 1–6", () => {
  it.each(cases)("%s %j → %s", (id, inputs, status) => {
    expect(checkItem(realItem(id), inputs).status).toBe(status);
  });

  it("typo 'lookng' is almost and still counts as correct", () => {
    const result = checkItem(realItem("1.1#2"), ["am lookng"]);
    expect(result.status).toBe("correct");
    expect(result.blanks[0]?.verdict).toBe("almost");
    expect(result.score).toBe(1);
  });

  it("'is' for 'are' is incorrect, not almost", () => {
    const result = checkItem(realItem("1.1#4"), ["is staying"]);
    expect(result.blanks[0]?.verdict).toBe("incorrect");
  });

  it("scores partial items by the share of accepted blanks", () => {
    const result = checkItem(realItem("5.2#6"), ["spent", "buyed", "cost"]);
    expect(result.status).toBe("partial");
    expect(result.score).toBeCloseTo(2 / 3);
  });

  it("missing inputs count as incorrect blanks", () => {
    const result = checkItem(realItem("1.1#7"), ["are making"]);
    expect(result.status).toBe("partial");
    expect(result.blanks).toHaveLength(2);
  });

  it("needs-ai results carry no blanks and a zero score", () => {
    expect(checkItem(realItem("6.1#4"), ["I was asleep."])).toEqual({
      status: "needs-ai",
      blanks: [],
      score: 0,
    });
  });
});
