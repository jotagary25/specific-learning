import type { ThinkingControls, ThinkValue } from "@english-course/shared";

export type EffortOption = { value: string; label: string };

/** `<select>` value for a think setting. */
export function encodeThink(think: ThinkValue): string {
  if (think === null) return "default";
  if (typeof think === "boolean") return think ? "on" : "off";
  return `level:${think}`;
}

export function decodeThink(value: string): ThinkValue {
  if (value === "default") return null;
  if (value === "on") return true;
  if (value === "off") return false;
  return value.replace(/^level:/, "");
}

const labelFor = (think: ThinkValue) =>
  think === null ? "Model default" : typeof think === "boolean" ? (think ? "On" : "Off") : think;

/**
 * Effort choices for a model: "Model default" plus the model's thinking values (on/off or
 * levels). Without thinking metadata only on/off; while unknown just the current value.
 * The current value is always listed so the select never shows a wrong choice.
 */
export function effortOptions(
  thinking: ThinkingControls | null | undefined,
  current: ThinkValue,
): EffortOption[] {
  const defaultLabel =
    thinking === null || thinking === undefined
      ? "Model default"
      : `Model default (${labelFor(thinking.default)})`;
  const values: ThinkValue[] =
    thinking === undefined ? [] : thinking === null ? [true, false] : thinking.values;

  const options: EffortOption[] = [{ value: "default", label: defaultLabel }];
  for (const think of values) options.push({ value: encodeThink(think), label: labelFor(think) });
  if (!options.some((option) => option.value === encodeThink(current))) {
    options.push({ value: encodeThink(current), label: labelFor(current) });
  }
  return options;
}

/** "check_answer" → "Check answer". */
export const functionLabel = (id: string) => {
  const words = id.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};
