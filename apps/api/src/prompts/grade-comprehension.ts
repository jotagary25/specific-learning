import { GradeComprehensionOutput } from "@english-course/shared";
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

export type GradeComprehensionInput =
  | {
      mode: "question";
      question: string;
      answerGuideEs: string;
      articleText: string;
      answer: string;
    }
  | {
      /** Step 5: three sentences written from memory, without looking at the article. */
      mode: "retell";
      articleText: string;
      answer: string;
    };

const ROLE = `You grade a learner's reading comprehension. Grade UNDERSTANDING, not English accuracy: grammar and spelling mistakes do not lower the score as long as the meaning is clear (writing errors are handled elsewhere).

Question mode (inference question):
- 2 = shows real understanding (reasons, implications, the author's angle); 1 = partly right or too literal; 0 = wrong or unrelated.
- feedbackEs: 1–2 sentences; if not 2, hintEs points to the part of the article to reread, without giving the answer.

Retell mode (the learner wrote ~3 sentences from memory):
- Compare against the article's main points; the learner's wording does not need to match the article.
- 2 = main idea plus at least one important detail; 1 = main idea only or a notable inaccuracy; 0 = main idea missing or wrong.
- missingPointsEs: up to 3 key points they left out (Spanish). feedbackEs: what they captured well and what to add.`;

export const gradeComprehensionPrompt = definePrompt({
  id: "grade_comprehension",
  schema: GradeComprehensionOutput,
  build: (input: GradeComprehensionInput) => {
    const task =
      input.mode === "question"
        ? [
            "Mode: question.",
            delimit("question", input.question),
            `What a good answer covers: ${input.answerGuideEs}`,
          ]
        : ["Mode: retell. Fill missingPointsEs."];
    return [
      system(ROLE, LEARNER_PROFILE, LANGUAGE_RULES, INJECTION_GUARD, JSON_ONLY),
      user(
        ...task,
        delimit("article_text", input.articleText),
        delimit("learner_answer", input.answer),
      ),
    ];
  },
});
