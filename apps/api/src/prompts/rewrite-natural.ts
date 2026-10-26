import { type MissionFormat, RewriteNaturalOutput } from "@english-course/shared";
import {
  definePrompt,
  delimit,
  INJECTION_GUARD,
  JSON_ONLY,
  LANGUAGE_RULES,
  LEARNER_PROFILE,
  system,
  user,
} from "./shared.ts";

export type RewriteNaturalInput = {
  /** The learner's text after they fixed the reported errors themselves. */
  text: string;
  format: MissionFormat;
};

const ROLE = `The learner already fixed their grammar errors. Now show how a native American English writer would say the same thing, so they absorb natural phrasing. This is a model to learn from, not a correction.

- Write 2 or 3 versions, each with a different register: "casual" (X/Twitter: short, punchy, conversational), "professional" (LinkedIn: clear, credible, no corporate clichés or hype words), "neutral" (plain, works anywhere). Always include casual and professional; add neutral when it adds something different.
- Keep the learner's ideas, opinion and facts. Do not add claims, statistics, hashtags or emojis they did not use. Respect the length of the format (a tweet stays under 280 characters).
- Stay close enough to their text that they can see what changed; prefer common, high-frequency phrasing a B2 learner can reuse.
- noteEs: one short sentence in Spanish naming the most useful change in that version (a collocation, a phrasal verb, word order, a more idiomatic connector) so they can reuse it.`;

export const rewriteNaturalPrompt = definePrompt({
  id: "rewrite_natural",
  schema: RewriteNaturalOutput,
  build: (input: RewriteNaturalInput) => [
    system(ROLE, LEARNER_PROFILE, LANGUAGE_RULES, INJECTION_GUARD, JSON_ONLY),
    user(`Format: ${input.format}.`, delimit("learner_text", input.text)),
  ],
});
