import { describe, expect, it } from "vitest";
import { fallbackHint, leaksAnswer } from "./hint-guard.ts";

describe("leaksAnswer", () => {
  const key = [["’m looking", "am looking"]];

  it("detects a key alternative inside the hint, ignoring case and apostrophes", () => {
    expect(leaksAnswer("Prueba con «I'M LOOKING».", key)).toBe(true);
    expect(leaksAnswer("La forma correcta es am looking.", key)).toBe(true);
  });

  it("detects a contracted key written in full", () => {
    expect(leaksAnswer("Escribe: I am looking", [["’m looking"]])).toBe(true);
  });

  it("does not flag hints that only name the rule", () => {
    expect(leaksAnswer("Usa am/is/are + verbo con -ing.", key)).toBe(false);
  });

  it("matches whole words only", () => {
    expect(leaksAnswer("Piensa en el verbo look.", [["looks"]])).toBe(false);
  });

  it("ignores very short keys that would match ordinary words", () => {
    expect(
      leaksAnswer("Si la frase está bien, escribe OK; si no, corrígela: is it?", [["is"], ["OK"]]),
    ).toBe(false);
  });

  it("checks every blank of a multi-blank key", () => {
    expect(leaksAnswer("El segundo hueco es 're trying", [["are making"], ["’re trying"]])).toBe(
      true,
    );
  });
});

describe("fallbackHint", () => {
  it("gives a Spanish hint for each level", () => {
    for (const level of [1, 2, 3] as const) expect(fallbackHint(level)).toMatch(/\w+/);
    expect(fallbackHint(1)).not.toBe(fallbackHint(3));
  });
});
