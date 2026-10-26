import { canonicalize, expandOptionalWords, type HintLevel } from "@english-course/shared";

// Keys shorter than this ("is", "OK", "a") appear in ordinary hint text and are not checked.
const MIN_KEY_LENGTH = 3;

const words = (text: string) =>
  ` ${canonicalize(text)
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

/**
 * True when the hint contains any accepted answer of the item as whole words (case,
 * apostrophes and contractions normalized). Hints must never reveal the answer (spec §3.2).
 */
export function leaksAnswer(hint: string, keyBlanks: readonly (readonly string[])[]): boolean {
  const text = words(hint);
  return keyBlanks.some((alternatives) =>
    alternatives
      .flatMap((alternative) => expandOptionalWords(alternative))
      .map(words)
      .some((key) => key.trim().length >= MIN_KEY_LENGTH && text.includes(key)),
  );
}

const FALLBACK_HINTS: Record<HintLevel, string> = {
  1: "Fíjate en las pistas de la frase: palabras de tiempo (now, every day, yesterday…) y quién es el sujeto.",
  2: "Repasa la regla principal de la unidad en la teoría: ¿qué forma verbal pide este contexto y cómo se construye?",
  3: "Constrúyelo paso a paso: sujeto + la forma del verbo que pide la unidad + el resto de la frase. Revisa la terminación del verbo.",
};

/** Generic graduated hint used when the AI is unavailable or its hint leaked the answer. */
export function fallbackHint(level: HintLevel): string {
  return FALLBACK_HINTS[level];
}
