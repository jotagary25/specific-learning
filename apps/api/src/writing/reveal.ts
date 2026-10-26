import { z } from "zod";
import {
  definePrompt,
  delimit,
  INJECTION_GUARD,
  JSON_ONLY,
  LANGUAGE_RULES,
  LEARNER_PROFILE,
  system,
  user,
} from "../prompts/shared.ts";

/**
 * Final step of the self-fix loop: after the last recheck round, explain each error the learner
 * could not fix and show the corrected fragment. Runs with the `recheck_writing` model settings.
 */
const text = z.string().trim().min(1);

export const RevealWritingOutput = z.object({
  items: z.array(z.object({ errorId: text, correctedFragment: text, explanationEs: text })),
});
export type RevealWritingOutput = z.infer<typeof RevealWritingOutput>;

export type RevealWritingInput = {
  text: string;
  errors: Array<{ id: string; span: string; type: string; hintEs: string }>;
};

const ROLE = `The learner tried twice to fix these errors on their own and could not. Now, and only now, show the answer so they can close the loop.

- For each error id, give correctedFragment: the corrected version of the erroneous fragment only (the span with the minimum change, not the whole text). If the span is no longer in the text, correct the closest matching fragment.
- explanationEs: one or two sentences in Spanish explaining the rule behind the fix, so they can apply it next time.
- Return one item per error, using its id.`;

export const revealWritingPrompt = definePrompt({
  id: "recheck_writing",
  schema: RevealWritingOutput,
  build: (input: RevealWritingInput) => [
    system(ROLE, LEARNER_PROFILE, LANGUAGE_RULES, INJECTION_GUARD, JSON_ONLY),
    user(
      `Errors still not fixed:\n${input.errors
        .map((error) => `${error.id} [${error.type}] span "${error.span}" — hint: ${error.hintEs}`)
        .join("\n")}`,
      delimit("learner_text", input.text),
    ),
  ],
});
