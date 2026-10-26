import type {
  PublishedVersion,
  WritingErrorStatus,
  WritingErrorType,
  WritingFlowStatus,
} from "@english-course/shared";

/** Pure view helpers of the Writing feature. */

const STATUS_LABELS: Record<WritingErrorStatus, string> = {
  open: "To fix",
  fixed: "Fixed",
  changed: "Changed, still wrong",
  remaining: "Not changed yet",
};

export const errorStatusLabel = (status: WritingErrorStatus) => STATUS_LABELS[status];

const TYPE_LABELS: Record<WritingErrorType, string> = {
  grammar: "Grammar",
  word_choice: "Word choice",
  spelling: "Spelling",
  punctuation: "Punctuation",
  word_order: "Word order",
  register: "Register",
};

export const errorTypeLabel = (type: WritingErrorType) => TYPE_LABELS[type];

const FLOW_LABELS: Record<WritingFlowStatus, string> = {
  draft: "Draft",
  reviewed: "Reviewed",
  rechecked: "Self-fixing",
  rewritten: "Rewrites ready",
  completed: "Completed",
  skipped: "Skipped",
};

export const flowLabel = (status: WritingFlowStatus) => FLOW_LABELS[status];

const VERSION_LABELS: Record<PublishedVersion, string> = {
  own: "My version",
  casual: "Casual (X)",
  professional: "Professional (LinkedIn)",
  neutral: "Neutral",
};

export const versionLabel = (version: PublishedVersion) => VERSION_LABELS[version];
