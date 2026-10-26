import { type CefrLevel, GenerateMissionOutput, type MissionFormat } from "@english-course/shared";
import {
  definePrompt,
  delimit,
  INJECTION_GUARD,
  JSON_ONLY,
  LANGUAGE_RULES,
  LEARNER_PROFILE,
  system,
  type UnitRef,
  user,
} from "./shared.ts";

export type GenerateMissionInput = {
  /** Format chosen by the progression rules (tweet → thread → linkedin → article). */
  format: MissionFormat;
  level: CefrLevel;
  targetUnit: UnitRef & { grammarFocus: string };
  interests: string[];
  /** One-line opinions the learner wrote after this week's readings. */
  weekOpinions: string[];
  /** Titles of this week's articles, for context. */
  weekArticles: string[];
  recentMissionTitles: string[];
};

const WORD_LIMITS: Record<MissionFormat, string> = {
  tweet: "20–50 words (under 280 characters)",
  thread: "3–5 posts, 80–180 words in total",
  linkedin: "120–220 words",
  article: "300–500 words",
};

const ROLE = `You design the learner's weekly writing mission: a real post they could publish for their personal brand. Topics come from their interests and, above all, from the opinions they wrote after this week's readings. The post is about the topic (technology, science, news, books) — NOT about the learner's life or feelings.

- The mission must make the target unit's grammar necessary, not decorative (e.g. a past-tense story behind a news event for Simple past; what is changing right now in a field for Present continuous). List 1–3 grammarTargets in plain English (e.g. "simple past for the events", "past continuous for background").
- promptEn: 2–4 sentences in English telling them what to write, for whom, and the angle. Make it interesting: a question to answer, a take to defend, a surprising fact to explain.
- whyEs: one sentence in Spanish explaining how this mission connects to their reading and to the unit.
- suggestedWords: up to 8 words or collocations from the week's reading worth reusing.
- Avoid repeating recent missions.`;

export const generateMissionPrompt = definePrompt({
  id: "generate_mission",
  schema: GenerateMissionOutput,
  build: (input: GenerateMissionInput) => [
    system(ROLE, LEARNER_PROFILE, LANGUAGE_RULES, INJECTION_GUARD, JSON_ONLY),
    user(
      `Format: ${input.format} — length ${WORD_LIMITS[input.format]}. Set "format" to "${input.format}" and choose minWords/maxWords inside that range.`,
      `Level: ${input.level}. Target unit ${input.targetUnit.id}: ${input.targetUnit.title} (${input.targetUnit.grammarFocus}). Set targetUnitId to ${input.targetUnit.id}.`,
      `Interests: ${input.interests.join(", ")}.`,
      delimit("week_articles", input.weekArticles.join("\n") || "(none)"),
      delimit("week_opinions", input.weekOpinions.join("\n") || "(none)"),
      delimit("recent_missions", input.recentMissionTitles.join("\n") || "(none)"),
    ),
  ],
});
