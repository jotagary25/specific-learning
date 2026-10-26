import { RecheckWritingOutput, type WritingErrorFinding } from "@english-course/shared";
import {
  definePrompt,
  delimit,
  formatUnitCatalog,
  INJECTION_GUARD,
  JSON_ONLY,
  LANGUAGE_RULES,
  LEARNER_PROFILE,
  system,
  type UnitRef,
  user,
} from "./shared.ts";

export type RecheckWritingInput = {
  originalText: string;
  revisedText: string;
  errors: WritingErrorFinding[];
  units: UnitRef[];
};

const ROLE = `The learner received hints for specific errors and tried to fix them on their own. Check each reported error in the revised text.

- status "fixed": the error is gone and the new wording is correct.
- status "changed": they changed it but it is still wrong (or wrong in a new way).
- status "remaining": it is unchanged.
- feedbackEs: one sentence. For "fixed", confirm briefly and name the rule they applied. For the others, give a sharper hint than before, still WITHOUT writing the correct form.
- newIssue: only if the revision introduced one new clear error; otherwise omit it. Use the same error format (exact span, type, unitId from the catalog or null, hintEs).
- Return one result per reported error, using its id.`;

export const recheckWritingPrompt = definePrompt({
  id: "recheck_writing",
  schema: RecheckWritingOutput,
  build: (input: RecheckWritingInput) => [
    system(ROLE, LEARNER_PROFILE, LANGUAGE_RULES, INJECTION_GUARD, JSON_ONLY),
    user(
      `Reported errors:\n${input.errors
        .map(
          (error) =>
            `${error.id} [${error.type}] span "${error.span}" — hint given: ${error.hintEs}`,
        )
        .join("\n")}`,
      `Unit catalog (id: title):\n${formatUnitCatalog(input.units)}`,
      delimit("original_text", input.originalText),
      delimit("revised_text", input.revisedText),
    ),
  ],
});
