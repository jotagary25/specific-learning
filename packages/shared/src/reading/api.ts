import { z } from "zod";
import {
  AnnotateArticleOutput,
  CefrLevel,
  GlossWordOutput,
  GradeComprehensionOutput,
  RecallQuestionsOutput,
} from "../ai/schemas.ts";

/** HTTP contracts of the Reading feature (`/api/reading`), shared by api and web. */

export const ArticleSourceKind = z.enum(["theconversation", "websearch", "manual"]);
export type ArticleSourceKind = z.infer<typeof ArticleSourceKind>;

/** Stored annotations are exactly the `annotate_article` output. */
export const ArticleAnnotations = AnnotateArticleOutput;
export type ArticleAnnotations = z.infer<typeof ArticleAnnotations>;

export const ReadingStep = z.enum([
  "predict",
  "read",
  "questions",
  "spots",
  "retell",
  "opinion",
  "done",
]);
export type ReadingStep = z.infer<typeof ReadingStep>;

export const ArticleSummary = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  outlet: z.string().nullable(),
  topic: z.string().nullable(),
  selectedFor: z.string().nullable(),
  wordCount: z.number().int().nonnegative(),
  completed: z.boolean(),
});
export type ArticleSummary = z.infer<typeof ArticleSummary>;

export const ArticleView = ArticleSummary.extend({
  source: ArticleSourceKind,
  /** Author lines as published (name, role, institution). */
  authors: z.array(z.string()),
  license: z.string().nullable(),
  publishedAt: z.string().nullable(),
  /** Verbatim text; paragraphs are separated by blank lines. */
  text: z.string(),
  estLevel: CefrLevel.nullable(),
  /** `null` when annotation failed: plain reading plus a retry button. */
  annotations: ArticleAnnotations.nullable(),
});
export type ArticleView = z.infer<typeof ArticleView>;

export const ComprehensionGrade = GradeComprehensionOutput;
export type ComprehensionGrade = z.infer<typeof ComprehensionGrade>;

export const QuestionAnswerView = z.object({
  qid: z.number().int().min(0),
  answer: z.string(),
  /** `null` when the AI was unavailable; the answer is kept. */
  grade: ComprehensionGrade.nullable(),
});
export type QuestionAnswerView = z.infer<typeof QuestionAnswerView>;

export const SpotAttemptView = z.object({
  text: z.string(),
  /** Index into `annotations.grammarSpots`, or null when it did not match. */
  spotIndex: z.number().int().nullable(),
  explanation: z.string().optional(),
  feedback: ComprehensionGrade.nullable().optional(),
});
export type SpotAttemptView = z.infer<typeof SpotAttemptView>;

export const ReadingSessionView = z.object({
  step: ReadingStep,
  prediction: z.string().nullable(),
  answers: z.array(QuestionAnswerView),
  spots: z.array(SpotAttemptView),
  spotsRevealed: z.boolean(),
  retell: z.object({ text: z.string(), grade: ComprehensionGrade.nullable() }).nullable(),
  opinion: z.string().nullable(),
  savedWords: z.array(z.string()),
  completedAt: z.string().nullable(),
});
export type ReadingSessionView = z.infer<typeof ReadingSessionView>;

export const FocusUnit = z.object({
  id: z.number().int(),
  title: z.string(),
  grammarFocus: z.string(),
});
export type FocusUnit = z.infer<typeof FocusUnit>;

export const ArticleDetail = z.object({
  article: ArticleView,
  session: ReadingSessionView,
  /** The learner's current unit: its grammar is what the hunt asks for. */
  unit: FocusUnit.nullable(),
  /** How many grammar examples the hunt asks for. */
  spotTarget: z.number().int().nonnegative(),
});
export type ArticleDetail = z.infer<typeof ArticleDetail>;

export const TodayResponse = z.object({
  date: z.string(),
  reading: ArticleDetail.nullable(),
  editorEnabled: z.boolean(),
});
export type TodayResponse = z.infer<typeof TodayResponse>;

export const ArticlesListResponse = z.object({ articles: z.array(ArticleSummary) });
export type ArticlesListResponse = z.infer<typeof ArticlesListResponse>;

const line = z.string().trim().min(1).max(2000);

export const PredictionRequest = z.object({ prediction: line });
export type PredictionRequest = z.infer<typeof PredictionRequest>;

export const StepRequest = z.object({ step: ReadingStep });
export type StepRequest = z.infer<typeof StepRequest>;

export const GlossRequest = z.object({
  word: z.string().trim().min(1).max(80),
  sentence: z.string().trim().min(1).max(1000),
});
export type GlossRequest = z.infer<typeof GlossRequest>;

export const GlossResponse = GlossWordOutput.extend({
  word: z.string(),
  source: z.enum(["glossary", "cache", "ai"]),
  saved: z.boolean(),
});
export type GlossResponse = z.infer<typeof GlossResponse>;

export const SaveWordRequest = GlossRequest;
export type SaveWordRequest = z.infer<typeof SaveWordRequest>;

export const SaveWordResponse = z.object({
  cardId: z.string(),
  word: z.string(),
  created: z.boolean(),
});
export type SaveWordResponse = z.infer<typeof SaveWordResponse>;

export const AnswerRequest = z.object({ answer: line });
export type AnswerRequest = z.infer<typeof AnswerRequest>;

export const QuestionGradeResponse = z.object({
  qid: z.number().int(),
  grade: ComprehensionGrade.nullable(),
  /** What a good answer covers; shown once the learner has answered. */
  answerGuideEs: z.string(),
  error: z.literal("ai-unavailable").optional(),
});
export type QuestionGradeResponse = z.infer<typeof QuestionGradeResponse>;

export const SpotRequest = z.object({
  text: z.string().min(1).max(600),
  /** Character offset of the selection in the article text, when the client knows it. */
  start: z.number().int().min(0).optional(),
  /** Optional: the learner's explanation of why the writer used this form. */
  explanation: z.string().trim().min(1).max(1000).optional(),
});
export type SpotRequest = z.infer<typeof SpotRequest>;

export const SpotResponse = z.object({
  attempt: SpotAttemptView,
  found: z.array(z.number().int()),
  target: z.number().int(),
  error: z.literal("ai-unavailable").optional(),
});
export type SpotResponse = z.infer<typeof SpotResponse>;

export const RetellRequest = z.object({ text: z.string().trim().min(1).max(3000) });
export type RetellRequest = z.infer<typeof RetellRequest>;

export const RetellResponse = z.object({
  grade: ComprehensionGrade.nullable(),
  error: z.literal("ai-unavailable").optional(),
});
export type RetellResponse = z.infer<typeof RetellResponse>;

export const OpinionRequest = z.object({ opinion: z.string().trim().min(1).max(500) });
export type OpinionRequest = z.infer<typeof OpinionRequest>;

export const RecallQuestionView = RecallQuestionsOutput.shape.questions.element.extend({
  qid: z.number().int(),
  answer: z.string().nullable(),
  grade: ComprehensionGrade.nullable(),
});
export type RecallQuestionView = z.infer<typeof RecallQuestionView>;

export const RecallResponse = z.object({
  status: z.enum(["none", "ready", "done", "ai-unavailable"]),
  article: z.object({ id: z.string(), title: z.string() }).nullable(),
  questions: z.array(RecallQuestionView),
});
export type RecallResponse = z.infer<typeof RecallResponse>;

export const RecallAnswerResponse = z.object({
  question: RecallQuestionView,
  done: z.boolean(),
  error: z.literal("ai-unavailable").optional(),
});
export type RecallAnswerResponse = z.infer<typeof RecallAnswerResponse>;

export const EditorRunResponse = z.object({
  date: z.string(),
  status: z.enum(["selected", "existing", "no-candidates"]),
  articleId: z.string().nullable(),
  title: z.string().nullable(),
  /** How the article was chosen: by the AI editor or by the deterministic fallback. */
  selection: z.enum(["ai", "fallback"]).nullable(),
  annotated: z.boolean(),
  candidates: z.number().int(),
  sources: z.array(
    z.object({ name: z.string(), candidates: z.number().int(), error: z.string().optional() }),
  ),
  warnings: z.array(z.string()),
});
export type EditorRunResponse = z.infer<typeof EditorRunResponse>;
