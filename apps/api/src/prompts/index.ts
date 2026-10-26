import type { AiFunctionId } from "@english-course/shared";
import type { z } from "zod";
import { annotateArticlePrompt } from "./annotate-article.ts";
import { checkAnswerPrompt } from "./check-answer.ts";
import { explainTutorPrompt } from "./explain-tutor.ts";
import { generateMissionPrompt } from "./generate-mission.ts";
import { generatePracticePrompt } from "./generate-practice.ts";
import { glossWordPrompt } from "./gloss-word.ts";
import { gradeComprehensionPrompt } from "./grade-comprehension.ts";
import { hintExercisePrompt } from "./hint-exercise.ts";
import { recallQuestionsPrompt } from "./recall-questions.ts";
import { recheckWritingPrompt } from "./recheck-writing.ts";
import { reviewWritingPrompt } from "./review-writing.ts";
import { rewriteNaturalPrompt } from "./rewrite-natural.ts";
import { selectArticlePrompt } from "./select-article.ts";
import type { PromptDefinition } from "./shared.ts";

/** Every AI function's prompt, keyed by its settings id (one module per function). */
export const prompts = {
  check_answer: checkAnswerPrompt,
  hint_exercise: hintExercisePrompt,
  explain_tutor: explainTutorPrompt,
  select_article: selectArticlePrompt,
  annotate_article: annotateArticlePrompt,
  gloss_word: glossWordPrompt,
  grade_comprehension: gradeComprehensionPrompt,
  review_writing: reviewWritingPrompt,
  recheck_writing: recheckWritingPrompt,
  rewrite_natural: rewriteNaturalPrompt,
  generate_mission: generateMissionPrompt,
  generate_practice: generatePracticePrompt,
  recall_questions: recallQuestionsPrompt,
} satisfies { [Id in AiFunctionId]: PromptDefinition<never, z.ZodType> };

export type { AnnotateArticleInput } from "./annotate-article.ts";
export type { CheckAnswerInput } from "./check-answer.ts";
export type { ExplainTutorInput, TutorScreen } from "./explain-tutor.ts";
export { TUTOR_ROLE } from "./explain-tutor.ts";
export type { GenerateMissionInput } from "./generate-mission.ts";
export type { GeneratePracticeInput, PracticeSource } from "./generate-practice.ts";
export type { GlossWordInput } from "./gloss-word.ts";
export type { GradeComprehensionInput } from "./grade-comprehension.ts";
export type { HintExerciseInput } from "./hint-exercise.ts";
export { hintLevelFor, NO_REVEAL_RULE } from "./hint-exercise.ts";
export type { RecallQuestionsInput } from "./recall-questions.ts";
export type { RecheckWritingInput } from "./recheck-writing.ts";
export type { ReviewWritingInput } from "./review-writing.ts";
export type { RewriteNaturalInput } from "./rewrite-natural.ts";
export type { ArticleCandidate, SelectArticleInput } from "./select-article.ts";
export type { PromptDefinition, UnitRef } from "./shared.ts";
export { delimit } from "./shared.ts";
