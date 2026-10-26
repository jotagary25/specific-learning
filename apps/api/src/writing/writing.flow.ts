import { MAX_RECHECKS, type WritingActions, type WritingFlowStatus } from "@english-course/shared";
import type { WritingMissionStatus } from "../shared/db/schema/writing.ts";

/**
 * Review flow state machine (spec §3.6):
 * draft → reviewed → rechecked (≤ MAX_RECHECKS) → rewritten → completed; any open state → skipped.
 *
 * - `submit` (draft, needs text) runs `review_writing` → reviewed.
 * - `recheck` while errors are still open and rounds remain → rechecked.
 * - `rewrite` once nothing is open or the rounds are used up → rewritten.
 * - `complete` from rewritten, or (graceful degradation when rewrites are unavailable) whenever
 *   rewrite would be allowed.
 */
export type FlowSnapshot = {
  status: WritingFlowStatus;
  round: number;
  /** Errors not fixed yet. */
  openErrors: number;
  hasText: boolean;
};

const OPEN: readonly WritingFlowStatus[] = ["draft", "reviewed", "rechecked", "rewritten"];

export function allowedActions(flow: FlowSnapshot): WritingActions {
  const reviewing = flow.status === "reviewed" || flow.status === "rechecked";
  const roundsLeft = flow.round < MAX_RECHECKS;
  const rewrite = reviewing && (flow.openErrors === 0 || !roundsLeft);
  return {
    saveDraft: flow.status === "draft" || reviewing,
    submit: flow.status === "draft" && flow.hasText,
    recheck: reviewing && roundsLeft && flow.openErrors > 0,
    rewrite,
    complete: rewrite || flow.status === "rewritten",
    skip: OPEN.includes(flow.status),
    markPublished: flow.status === "rewritten" || flow.status === "completed",
  };
}

export function missionStatusFor(
  status: WritingFlowStatus,
  hasText: boolean,
): WritingMissionStatus {
  switch (status) {
    case "draft":
      return hasText ? "draft" : "pending";
    case "completed":
    case "skipped":
      return "done";
    default:
      return "submitted";
  }
}
