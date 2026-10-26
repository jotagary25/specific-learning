import type {
  TutorContextInput,
  TutorMessageView,
  TutorStreamEvent,
  TutorToolUse,
} from "@english-course/shared";

/** A tool chip; `key` is unique within its bubble. */
export type ToolChip = TutorToolUse & { key: string };

/** One bubble of the chat: a learner message or a tutor answer with the tools it used. */
export type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: ToolChip[];
  streaming: boolean;
  thinking: boolean;
  error: string | null;
};

export const QUICK_PROMPTS = [
  "Explain it differently",
  "Give me an example with tech",
  "Why not the simple present?",
] as const;

/**
 * The tutor context for the screen the learner is on. A focused exercise item (an element inside
 * `[data-item-id]`) wins over the unit itself.
 */
export function contextFromRoute(
  pathname: string,
  search: string,
  active: Element | null,
): TutorContextInput {
  const unit = pathname.match(/^\/units\/(\d+)/);
  if (unit) {
    const itemId = active?.closest("[data-item-id]")?.getAttribute("data-item-id");
    if (itemId) return { kind: "exercise", ref: itemId };
    const step = new URLSearchParams(search).get("step");
    return { kind: "unit", ref: step ? `${unit[1]}#${step}` : (unit[1] ?? "") };
  }
  const article = pathname.match(/^\/reading\/([^/]+)$/);
  if (article && article[1] !== "history") return { kind: "article", ref: article[1] ?? "" };
  if (pathname === "/reading") return { kind: "article", ref: "" };
  if (pathname.startsWith("/writing")) return { kind: "writing", ref: "current" };
  if (pathname.startsWith("/vocabulary")) return { kind: "vocabulary", ref: "cards" };
  return { kind: "free", ref: pathname };
}

/** Short English label of where the learner asked from. */
export function contextLabel(context: TutorContextInput): string {
  const ref = context.ref ?? "";
  switch (context.kind) {
    case "unit": {
      const [unit, step] = ref.split("#");
      return step ? `Unit ${unit} · ${step}` : `Unit ${unit}`;
    }
    case "exercise":
      return `Exercise item ${ref}`;
    case "article":
      return ref ? "This article" : "Today's article";
    case "writing":
      return "Writing mission";
    case "vocabulary":
      return "Flashcards";
    default:
      return "Free chat";
  }
}

export const sameContext = (a: TutorContextInput, b: TutorContextInput) =>
  a.kind === b.kind && (a.ref ?? "") === (b.ref ?? "") && a.snippet === b.snippet;

const chip = (tool: TutorToolUse, position: number): ToolChip => ({
  ...tool,
  key: `${position}-${tool.name}`,
});

const entry = (id: string, role: ChatEntry["role"], text: string, tools: ToolChip[] = []) => ({
  id,
  role,
  text,
  tools,
  streaming: false,
  thinking: false,
  error: null,
});

/** Stored messages → bubbles: tool results become chips on the next tutor answer. */
export function entriesFromMessages(messages: TutorMessageView[]): ChatEntry[] {
  const entries: ChatEntry[] = [];
  let pendingTools: ToolChip[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      pendingTools = [];
      entries.push(entry(message.id, "user", message.content));
    } else if (message.role === "tool") {
      if (message.tool) pendingTools.push(chip(message.tool, pendingTools.length));
    } else if (message.content.trim()) {
      entries.push(entry(message.id, "assistant", message.content, pendingTools));
      pendingTools = [];
    }
  }
  return entries;
}

/** Applies one stream event to the tutor bubble being written. */
export function applyEvent(current: ChatEntry, event: TutorStreamEvent): ChatEntry {
  switch (event.type) {
    case "thinking":
      return { ...current, thinking: true };
    case "text":
      return { ...current, thinking: false, text: current.text + event.text };
    case "tool":
      return {
        ...current,
        thinking: false,
        tools: [...current.tools, chip(event.tool, current.tools.length)],
      };
    case "done":
      return { ...current, thinking: false, streaming: false };
    case "error":
      return { ...current, thinking: false, streaming: false, error: event.message };
  }
}

export const newEntry = (role: ChatEntry["role"], text: string): ChatEntry => ({
  ...entry(`local-${Math.random().toString(36).slice(2)}`, role, text),
  streaming: role === "assistant",
});
