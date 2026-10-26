import {
  FORMAT_LIMITS,
  type Inspiration,
  type MissionFormat,
  type UnitLink,
} from "@english-course/shared";

/** Mission content before it is stored (from `generate_mission` or a built-in template). */
export type MissionContent = {
  title: string;
  format: MissionFormat;
  topic: string;
  promptEn: string;
  whyEs: string | null;
  targetUnitId: number | null;
  constraints: {
    minWords: number;
    maxWords: number;
    grammarTargets: string[];
    suggestedWords: string[];
  };
};

export type UnitCandidate = {
  id: number;
  title: string;
  subtitle: string;
  completed: boolean;
  priority: number;
};

/**
 * The unit a new mission practices: the unit with the highest raised priority (writing errors
 * raise it), else the lowest unit not completed yet, else the last unit.
 */
export function pickTargetUnit<U extends UnitCandidate>(units: readonly U[]): U | null {
  const byId = [...units].sort((a, b) => a.id - b.id);
  const boosted = byId
    .filter((unit) => unit.priority > 0)
    .sort((a, b) => b.priority - a.priority || a.id - b.id);
  return boosted[0] ?? byId.find((unit) => !unit.completed) ?? byId.at(-1) ?? null;
}

type UnitTemplate = { title: string; topic: string; ask: string; grammarTargets: string[] };

/** Built-in angles per book unit, used when the AI is unavailable. */
const UNIT_TEMPLATES: Record<number, UnitTemplate> = {
  1: {
    title: "What is changing right now",
    topic: "a trend that is happening right now",
    ask: "Describe what is changing right now in a field you follow and what people are doing about it.",
    grammarTargets: ["present continuous for changes happening now"],
  },
  2: {
    title: "How it works",
    topic: "how a technology or habit works",
    ask: "Explain how something works, or what people usually do with it, to someone who has never used it.",
    grammarTargets: ["simple present for facts and routines"],
  },
  3: {
    title: "The usual vs. this week",
    topic: "what usually happens vs. what is happening now",
    ask: "Contrast how something usually works with what is happening with it this week.",
    grammarTargets: ["simple present for the usual", "present continuous for now"],
  },
  4: {
    title: "What it means right now",
    topic: "a news story and what it means",
    ask: "Say what you think about a recent story and what the people involved are doing now.",
    grammarTargets: ["state verbs in simple present (think, mean, need)", "present continuous"],
  },
  5: {
    title: "The story behind the news",
    topic: "the events behind a recent story",
    ask: "Tell the story behind a recent event: what happened first, what happened next, how it ended.",
    grammarTargets: ["simple past for the events"],
  },
  6: {
    title: "What was going on",
    topic: "the background of a past event",
    ask: "Tell a past event and what was going on around it when it happened.",
    grammarTargets: ["past continuous for the background", "simple past for the events"],
  },
};

const GENERIC_TEMPLATE: UnitTemplate = {
  title: "Your take",
  topic: "a topic from your reading",
  ask: "Share your opinion on something you read about recently and give one reason or example.",
  grammarTargets: ["clear sentences with the right verb tense"],
};

const FORMAT_FRAME: Record<MissionFormat, string> = {
  tweet: "Write one X post (under 280 characters).",
  thread: "Write a thread of 3–5 short posts.",
  linkedin: "Write a LinkedIn post for people in tech.",
  article: "Write a short article with a clear opening, two or three points and a closing line.",
};

export function fallbackMission(input: {
  format: MissionFormat;
  targetUnit: UnitLink | null;
  inspiration: Inspiration[];
}): MissionContent {
  const template = (input.targetUnit && UNIT_TEMPLATES[input.targetUnit.id]) || GENERIC_TEMPLATE;
  const source = input.inspiration[0]?.title;
  const limits = FORMAT_LIMITS[input.format];
  const about = source
    ? `Base it on this week's article "${source}".`
    : "Pick a topic from technology, science, news or books.";
  return {
    title: template.title,
    format: input.format,
    topic: source ?? template.topic,
    promptEn: `${FORMAT_FRAME[input.format]} ${template.ask} ${about} Write about the topic, not about yourself.`,
    whyEs: input.targetUnit
      ? `Practica la unidad ${input.targetUnit.id} (${input.targetUnit.title}) con un tema real.`
      : null,
    targetUnitId: input.targetUnit?.id ?? null,
    constraints: {
      minWords: limits.minWords,
      maxWords: limits.maxWords,
      grammarTargets: template.grammarTargets,
      suggestedWords: [],
    },
  };
}
