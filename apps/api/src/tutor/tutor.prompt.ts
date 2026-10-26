// System prompt of the streaming tutor chat, composed on top of the shared prompt sections.
import type { TutorContext } from "@english-course/shared";
import { TUTOR_ROLE } from "../prompts/explain-tutor.ts";
import { delimit, INJECTION_GUARD, LEARNER_PROFILE, system } from "../prompts/shared.ts";
import type { ChatMessage } from "../shared/llm/types.ts";

export const MAX_ANSWER_WORDS = 120;

export const CHAT_RULES = `Chat rules:
- Reply in clear, warm, neutral Spanish addressing the learner as "tú"; English examples stay in English. Plain text, no headings, no tables.
- At most ${MAX_ANSWER_WORDS} words unless the learner explicitly asks for more detail.
- Always end with exactly one short line that sends the learner back to the task they were doing.
- Tools: use them only when they help with THIS doubt (look up the unit theory, the exercise item, the article, the learner's errors). Write tools (cards, parking list, saved doubts) only when the learner asks or clearly wants it. Never reveal an answer key marked LOCKED.
- If the learner drifts to an unrelated topic, offer to park it with add_parking_item and bring them back to the task.`;

export const FORCE_ANSWER = `You have used all your tool rounds. Answer the learner now with what you already know, without calling any tool.`;

/** Keeps only characters that can identify a screen; refs come from the client. */
const safeRef = (ref: string) => ref.replace(/[^\w.#:/-]/g, "").slice(0, 120);

export function describeContext(context: TutorContext): string {
  const ref = safeRef(context.ref);
  switch (context.kind) {
    case "unit": {
      const [unit, step] = ref.split("#");
      return `The learner opened the tutor from Unit ${unit || "?"}${step ? `, ${step} step` : ""}. Call get_unit_theory if you need the unit's rules.`;
    }
    case "exercise":
      return `The learner opened the tutor from exercise item ${ref || "(unknown)"}. Call get_item to see the item and their attempts.`;
    case "article":
      return `The learner opened the tutor while reading an article${ref ? ` (id ${ref})` : ""}. Call get_today_article_excerpt for its text.`;
    case "writing":
      return `The learner opened the tutor from their writing mission${ref && ref !== "current" ? ` (${ref})` : ""}. Call get_recent_errors to see what they usually get wrong.`;
    case "vocabulary":
      return "The learner opened the tutor from their flashcards. Call search_my_cards to look a card up.";
    default:
      return "Free chat: the learner opened the tutor from the menu, not from a task.";
  }
}

/** System message: tutor voice, learner, security, chat rules, and where the learner was. */
export function buildSystemMessage(context: TutorContext): ChatMessage {
  const sections = [
    TUTOR_ROLE,
    LEARNER_PROFILE,
    INJECTION_GUARD,
    CHAT_RULES,
    describeContext(context),
  ];
  if (context.snippet) {
    sections.push(`What the learner was looking at:\n${delimit("snippet", context.snippet)}`);
  }
  return system(...sections);
}
