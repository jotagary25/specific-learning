import { describe, expect, it } from "vitest";
import { z } from "zod";
import evalSamples from "../../../../content/eval/writing-samples.json" with { type: "json" };
import {
  AnnotateArticleOutput,
  CheckAnswerOutput,
  ExplainTutorOutput,
  GenerateMissionOutput,
  GeneratePracticeOutput,
  GlossWordOutput,
  GradeComprehensionOutput,
  HintExerciseOutput,
  RecallQuestionsOutput,
  RecheckWritingOutput,
  ReviewWritingOutput,
  RewriteNaturalOutput,
  SelectArticleOutput,
  WritingEvalSamples,
} from "./schemas.ts";

const gloss = {
  term: "breakthrough",
  lemma: "breakthrough",
  partOfSpeech: "noun",
  glossEs: "avance importante",
  definitionEn: "an important new discovery",
  example: "The team made a breakthrough in battery design.",
};

/** One realistic model reply per AI function. */
const samples: Array<[string, z.ZodType, unknown]> = [
  [
    "check_answer",
    CheckAnswerOutput,
    {
      verdict: "almost",
      feedbackEs: "El tiempo verbal es correcto, pero revisa la ortografía del verbo.",
      hintEs: "Fíjate en cómo se escribe el verbo con -ing.",
    },
  ],
  [
    "hint_exercise",
    HintExerciseOutput,
    { level: 1, hintEs: "Mira la expresión 'right now': ¿la acción está pasando en este momento?" },
  ],
  [
    "explain_tutor",
    ExplainTutorOutput,
    {
      explanationEs: "El present continuous describe algo que está en marcha ahora mismo.",
      examplesEn: ["The servers are restarting right now."],
      analogyEs: "Es como un proceso que sigue corriendo: todavía no terminó.",
      pitfallEs: "En español decimos 'trabajo en Madrid' para ambas ideas; en inglés no.",
      backToTaskEs: "Vuelve al ítem 4 y busca la pista temporal.",
    },
  ],
  [
    "select_article",
    SelectArticleOutput,
    {
      chosenId: "tc-123",
      topic: "science",
      estLevel: "B2",
      reasons: ["Different topic from yesterday", "Narrative with past tenses"],
    },
  ],
  [
    "annotate_article",
    AnnotateArticleOutput,
    {
      predictPrompt: "What do you think the scientists discovered?",
      glossary: [gloss, { ...gloss, term: "outpace" }, { ...gloss, term: "grid" }],
      grammarSpots: [
        {
          quote: "Researchers are testing a new battery",
          form: "present continuous",
          whyEs: "Describe un trabajo que está en curso ahora.",
        },
      ],
      questions: [
        { question: "Why might this matter for cities?", answerGuideEs: "Menciona el costo." },
        { question: "What is the author worried about?", answerGuideEs: "La escala." },
        { question: "What could happen next?", answerGuideEs: "Pruebas a gran escala." },
      ],
      opinionPrompt: "Would you trust this technology in your city? Why?",
    },
  ],
  ["gloss_word", GlossWordOutput, { ...gloss, term: undefined }],
  [
    "grade_comprehension",
    GradeComprehensionOutput,
    {
      score: 1,
      feedbackEs: "Captaste la idea principal, pero falta un detalle clave.",
      missingPointsEs: ["El costo del proyecto"],
    },
  ],
  [
    "review_writing",
    ReviewWritingOutput,
    {
      errors: [
        {
          id: "e1",
          span: "this trend grow",
          type: "grammar",
          unitId: 1,
          hintEs: "La acción está en curso ahora: ¿qué forma del verbo usa la unidad 1?",
        },
      ],
      scores: { grammar: 62, clarity: 80, vocabulary: 70, naturalness: 55 },
      strengthEs: "Usaste bien 'right now' para situar la acción.",
    },
  ],
  [
    "recheck_writing",
    RecheckWritingOutput,
    {
      results: [{ errorId: "e1", status: "fixed", feedbackEs: "Bien: usaste be + -ing." }],
    },
  ],
  [
    "rewrite_natural",
    RewriteNaturalOutput,
    {
      versions: [
        {
          register: "casual",
          text: "AI agents are writing a lot of code these days.",
          noteEs: "'these days' suena más natural que 'in this moment'.",
        },
        {
          register: "professional",
          text: "More teams are relying on AI agents to write code.",
          noteEs: "'rely on' es una colocación muy frecuente.",
        },
      ],
    },
  ],
  [
    "generate_mission",
    GenerateMissionOutput,
    {
      title: "What is changing in code review",
      format: "tweet",
      topic: "AI coding agents",
      promptEn: "Write a tweet about what is changing in code review right now.",
      whyEs: "Conecta con el artículo del martes y practica el present continuous.",
      targetUnitId: 1,
      constraints: {
        minWords: 20,
        maxWords: 50,
        grammarTargets: ["present continuous for ongoing changes"],
        suggestedWords: ["rely on", "workflow"],
      },
    },
  ],
  [
    "generate_practice",
    GeneratePracticeOutput,
    {
      items: [
        {
          sourceId: "err-1",
          type: "fix_sentence",
          instructionEs: "Corrige tu propia frase.",
          prompt: "This trend grow very fast this year.",
          answer: "This trend is growing very fast this year.",
          acceptedAlternatives: ["This trend's growing very fast this year."],
        },
      ],
    },
  ],
  [
    "recall_questions",
    RecallQuestionsOutput,
    {
      questions: [
        {
          type: "recall",
          question: "What did the researchers build?",
          answerGuideEs: "Una batería.",
        },
        { type: "word", question: "Use 'outpace' in a sentence.", answerGuideEs: "Uso correcto." },
        { type: "inference", question: "Why does it matter?", answerGuideEs: "Costo y escala." },
      ],
    },
  ],
];

describe("AI output schemas", () => {
  it.each(samples)("%s: parses a realistic reply", (_id, schema, sample) => {
    expect(schema.safeParse(sample).success).toBe(true);
  });

  it.each(samples)("%s: converts to a JSON schema for Ollama `format`", (_id, schema) => {
    const jsonSchema = z.toJSONSchema(schema) as { type?: string };
    expect(jsonSchema.type).toBe("object");
  });

  it("caps writing review at 3 focused errors", () => {
    const [, , review] = samples.find(([id]) => id === "review_writing") ?? [];
    const base = review as { errors: unknown[] };
    const tooMany = { ...base, errors: Array(4).fill(base.errors[0]) };
    expect(ReviewWritingOutput.safeParse(tooMany).success).toBe(false);
  });

  it("rejects a hint level outside 1–3", () => {
    expect(HintExerciseOutput.safeParse({ level: 4, hintEs: "x" }).success).toBe(false);
  });

  it("requires exactly 3 inference questions per article", () => {
    const [, , annotation] = samples.find(([id]) => id === "annotate_article") ?? [];
    const base = annotation as { questions: unknown[] };
    const two = { ...base, questions: base.questions.slice(0, 2) };
    expect(AnnotateArticleOutput.safeParse(two).success).toBe(false);
  });
});

describe("writing eval samples", () => {
  it("validate against the eval schema", () => {
    const parsed = WritingEvalSamples.parse(evalSamples);
    expect(parsed.samples).toHaveLength(5);
  });

  it("annotate spans that exist in each text", () => {
    const parsed = WritingEvalSamples.parse(evalSamples);
    for (const sample of parsed.samples) {
      for (const error of sample.knownErrors) {
        expect(sample.text, `${sample.id}: "${error.span}"`).toContain(error.span);
      }
    }
  });
});
