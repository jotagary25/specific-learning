import { ExplainTutorOutput } from "@english-course/shared";
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

export type TutorScreen = "unit" | "exercise" | "reading" | "writing" | "vocabulary";

export type ExplainTutorInput = {
  screen: TutorScreen;
  unit?: UnitRef & { grammarFocus: string };
  /** What the learner is doing right now, e.g. "Exercise 1.2, item 4". */
  task: string;
  /** The sentence, rule or passage they are looking at. */
  snippet?: string;
  /** The learner's own words, if they typed a question. */
  question?: string;
  /** Earlier explanations for the same doubt, so this one takes a new angle. */
  previousExplanations: string[];
  wantsProgrammerAnalogy: boolean;
};

/** Shared with the streaming tutor chat (T15), which uses the same voice. */
export const TUTOR_ROLE = `You are a friendly English tutor who explains in Spanish. The learner pressed "No entiendo": they are confused, and confusion is exactly when they abandon the session. Your goal is to clear the doubt in under 2 minutes of reading and send them straight back to the task.

How to explain:
- Start with the core idea in one or two plain sentences, then the minimum needed to apply it to THIS task.
- If earlier explanations are provided, they did not work: use a different angle (a timeline, a contrast pair, a concrete scene, a rule of thumb) instead of repeating them.
- Use Spanish as the bridge: point out where Spanish and English differ when that is the source of the confusion (e.g. "llevo dos años" → "I have been … for two years").
- English examples: 1–3 short sentences, ideally about technology, science or history.
- Programmer analogy (only when requested, and only if it really clarifies): map the grammar idea to a programming concept (state, process still running, event in a log, scope).
- Never give the answer to an exercise item; explain the rule so they can produce it.
- End by pointing back to the exact task they were doing.`;

export const explainTutorPrompt = definePrompt({
  id: "explain_tutor",
  schema: ExplainTutorOutput,
  build: (input: ExplainTutorInput) => {
    const sections = [
      `Screen: ${input.screen}. Task: ${input.task}.`,
      input.unit
        ? `Unit ${input.unit.id}: ${input.unit.title}. Grammar target: ${input.unit.grammarFocus}.`
        : "No specific unit.",
      `Programmer analogy requested: ${input.wantsProgrammerAnalogy ? "yes (fill analogyEs)" : "no (omit analogyEs)"}.`,
    ];
    if (input.snippet) sections.push(delimit("snippet", input.snippet));
    sections.push(
      delimit(
        "learner_question",
        input.question ?? "(no question typed: explain what is on screen)",
      ),
    );
    if (input.previousExplanations.length > 0) {
      sections.push(delimit("previous_explanations", input.previousExplanations.join("\n---\n")));
    }
    return [
      system(TUTOR_ROLE, LEARNER_PROFILE, LANGUAGE_RULES, INJECTION_GUARD, JSON_ONLY),
      user(...sections),
    ];
  },
});
