import { z } from "zod";

/**
 * Output contracts of the AI functions (docs/spec.md §4). The api derives the Ollama
 * `format` JSON schema from these and validates every reply; the web types responses with them.
 * Fields ending in `Es` are learner-facing Spanish; everything else that is English content
 * stays in English.
 */

const text = z.string().trim().min(1);

export const CheckAnswerOutput = z.object({
  verdict: z.enum(["correct", "almost", "incorrect"]),
  feedbackEs: text,
  /** A nudge for the next try when not correct; never the answer itself. */
  hintEs: text.optional(),
});
export type CheckAnswerOutput = z.infer<typeof CheckAnswerOutput>;

export const HintLevel = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type HintLevel = z.infer<typeof HintLevel>;

export const HintExerciseOutput = z.object({
  level: HintLevel,
  hintEs: text,
});
export type HintExerciseOutput = z.infer<typeof HintExerciseOutput>;

export const ExplainTutorOutput = z.object({
  explanationEs: text,
  examplesEn: z.array(text).min(1).max(3),
  analogyEs: text.optional(),
  pitfallEs: text.optional(),
  /** One sentence that sends the learner back to the exact task they left. */
  backToTaskEs: text,
});
export type ExplainTutorOutput = z.infer<typeof ExplainTutorOutput>;

export const ArticleTopic = z.enum(["tech", "science", "geopolitics", "other"]);
export type ArticleTopic = z.infer<typeof ArticleTopic>;

export const CefrLevel = z.enum(["A2", "B1", "B2", "C1"]);
export type CefrLevel = z.infer<typeof CefrLevel>;

export const SelectArticleOutput = z.object({
  chosenId: text,
  topic: ArticleTopic,
  estLevel: CefrLevel,
  reasons: z.array(text).min(1).max(4),
});
export type SelectArticleOutput = z.infer<typeof SelectArticleOutput>;

export const GlossEntry = z.object({
  /** Exact form as it appears in the article. */
  term: text,
  lemma: text,
  partOfSpeech: text,
  glossEs: text,
  definitionEn: text,
  example: text,
});
export type GlossEntry = z.infer<typeof GlossEntry>;

export const GrammarSpot = z.object({
  /** Exact quote copied from the article, so the UI can highlight it. */
  quote: text,
  form: text,
  whyEs: text,
});
export type GrammarSpot = z.infer<typeof GrammarSpot>;

export const InferenceQuestion = z.object({
  question: text,
  /** What a good answer should cover; shown only after the learner answers. */
  answerGuideEs: text,
});
export type InferenceQuestion = z.infer<typeof InferenceQuestion>;

export const AnnotateArticleOutput = z.object({
  predictPrompt: text,
  glossary: z.array(GlossEntry).min(3).max(15),
  grammarSpots: z.array(GrammarSpot).max(5),
  /** Shown when the article has no instance of the current unit's grammar. */
  grammarNoteEs: text.optional(),
  questions: z.array(InferenceQuestion).length(3),
  opinionPrompt: text,
});
export type AnnotateArticleOutput = z.infer<typeof AnnotateArticleOutput>;

export const GlossWordOutput = z.object({
  lemma: text,
  partOfSpeech: text,
  glossEs: text,
  definitionEn: text,
  example: text,
});
export type GlossWordOutput = z.infer<typeof GlossWordOutput>;

export const GradeComprehensionOutput = z.object({
  score: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  feedbackEs: text,
  hintEs: text.optional(),
  /** Retell mode: key points of the article the learner left out (Spanish). */
  missingPointsEs: z.array(text).max(3).optional(),
});
export type GradeComprehensionOutput = z.infer<typeof GradeComprehensionOutput>;

export const WritingErrorType = z.enum([
  "grammar",
  "word_choice",
  "spelling",
  "punctuation",
  "word_order",
  "register",
]);
export type WritingErrorType = z.infer<typeof WritingErrorType>;

export const WritingErrorFinding = z.object({
  id: text,
  /** Exact substring of the learner text. */
  span: text,
  type: WritingErrorType,
  unitId: z.number().int().min(1).max(142).nullable(),
  hintEs: text,
});
export type WritingErrorFinding = z.infer<typeof WritingErrorFinding>;

const score100 = z.number().int().min(0).max(100);

export const ReviewWritingOutput = z.object({
  errors: z.array(WritingErrorFinding).max(3),
  scores: z.object({
    grammar: score100,
    clarity: score100,
    vocabulary: score100,
    naturalness: score100,
  }),
  /** One concrete thing the learner did well. */
  strengthEs: text,
});
export type ReviewWritingOutput = z.infer<typeof ReviewWritingOutput>;

export const RecheckWritingOutput = z.object({
  results: z.array(
    z.object({
      errorId: text,
      status: z.enum(["fixed", "remaining", "changed"]),
      feedbackEs: text,
    }),
  ),
  /** At most one new real error introduced by the fix. */
  newIssue: WritingErrorFinding.omit({ id: true }).optional(),
});
export type RecheckWritingOutput = z.infer<typeof RecheckWritingOutput>;

export const Register = z.enum(["casual", "professional", "neutral"]);
export type Register = z.infer<typeof Register>;

export const RewriteNaturalOutput = z.object({
  versions: z
    .array(z.object({ register: Register, text, noteEs: text }))
    .min(2)
    .max(3),
});
export type RewriteNaturalOutput = z.infer<typeof RewriteNaturalOutput>;

export const MissionFormat = z.enum(["tweet", "thread", "linkedin", "article"]);
export type MissionFormat = z.infer<typeof MissionFormat>;

export const GenerateMissionOutput = z.object({
  title: text,
  format: MissionFormat,
  topic: text,
  promptEn: text,
  whyEs: text,
  targetUnitId: z.number().int().min(1).max(142),
  constraints: z.object({
    minWords: z.number().int().min(10),
    maxWords: z.number().int().min(20),
    grammarTargets: z.array(text).min(1).max(3),
    suggestedWords: z.array(text).max(8),
  }),
});
export type GenerateMissionOutput = z.infer<typeof GenerateMissionOutput>;

export const PracticeItem = z.object({
  /** Writing error or failed item this practice comes from. */
  sourceId: text,
  type: z.enum(["fix_sentence", "fill_blank"]),
  instructionEs: text,
  /** fill_blank uses "___" for the gap; fix_sentence shows the learner's own sentence. */
  prompt: text,
  answer: text,
  acceptedAlternatives: z.array(text).max(4),
});
export type PracticeItem = z.infer<typeof PracticeItem>;

export const GeneratePracticeOutput = z.object({
  items: z.array(PracticeItem).min(1).max(10),
});
export type GeneratePracticeOutput = z.infer<typeof GeneratePracticeOutput>;

export const RecallQuestionsOutput = z.object({
  questions: z
    .array(
      z.object({
        type: z.enum(["recall", "word", "inference"]),
        question: text,
        answerGuideEs: text,
      }),
    )
    .length(3),
});
export type RecallQuestionsOutput = z.infer<typeof RecallQuestionsOutput>;

/** Learner texts with known errors, used by the model eval (T16). */
export const WritingEvalSample = z.object({
  id: text,
  topic: text,
  format: MissionFormat,
  targetUnitId: z.number().int().min(1).max(142),
  text,
  knownErrors: z
    .array(
      z.object({
        span: text,
        type: WritingErrorType,
        unitId: z.number().int().min(1).max(142).nullable(),
        correction: text,
      }),
    )
    .min(1),
});
export type WritingEvalSample = z.infer<typeof WritingEvalSample>;

export const WritingEvalSamples = z.object({
  version: z.literal(1),
  samples: z.array(WritingEvalSample).min(1),
});
export type WritingEvalSamples = z.infer<typeof WritingEvalSamples>;
