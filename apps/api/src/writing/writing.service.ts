import {
  clampLevel,
  FORMAT_LIMITS,
  type FormatLimits,
  formatForLevel,
  type HistoryEntry,
  type LevelView,
  levelProgress,
  MAX_RECHECKS,
  type MissionView,
  overallScore,
  type PracticeResponse,
  type PublishedVersion,
  type SubmissionView,
  type TheorySection,
  type UnitLink,
  type WritingActions,
  type WritingCurrentResponse,
  type WritingErrorFinding,
  type WritingErrorView,
  type WritingHistoryResponse,
  type WritingMissionResponse,
} from "@english-course/shared";
import { prompts } from "../prompts/index.ts";
import { unitFocus } from "../reading/reading.store.ts";
import type { OwnErrorInput } from "../vocabulary/cards.ts";
import { runWritingAi, type WritingAi } from "./ai.ts";
import { fallbackMission, type MissionContent, pickTargetUnit } from "./missions.ts";
import { revealWritingPrompt } from "./reveal.ts";
import { allowedActions, missionStatusFor } from "./writing.flow.ts";
import type {
  ErrorRecord,
  ErrorSpan,
  FlowState,
  MissionAggregate,
  NewError,
  UnitInfo,
  WritingStore,
} from "./writing.store.ts";
import { initialFlow } from "./writing.store.ts";
import { correspondingSentence, sentenceAround } from "./writing.text.ts";

export type WritingDeps = {
  store: WritingStore;
  /** Key/value settings: `writing.level` (1–4). */
  settings?: {
    getSetting(key: string): Promise<unknown>;
    putSetting(key: string, value: unknown): Promise<void>;
  };
  ai?: WritingAi;
  /** Vocabulary's own-error card factory. */
  ownErrors?: { createOwnErrorCard(input: OwnErrorInput): Promise<{ cardId: string }> };
  now?: () => Date;
};

export class WritingError extends Error {
  override readonly name = "WritingError";
  readonly code: "not_found" | "invalid" | "conflict";

  constructor(code: WritingError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export const LEVEL_KEY = "writing.level";
/** The learner profile's level, used by every writing prompt. */
const CEFR = "B1" as const;
const INTERESTS = ["technology", "science", "news", "books"];
const READING_DAYS = 7;
const MAX_ERRORS = 3;
const RECENT_ERRORS = 30;

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const theorySummary = (theory: TheorySection[], maxChars = 2500) =>
  theory
    .map((section) => `${section.letter}. ${stripHtml(section.html)}`)
    .join("\n")
    .slice(0, maxChars);

const sameText = (a: string, b: string) =>
  a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

const currentText = (agg: MissionAggregate) =>
  agg.submission.textFixed ?? agg.submission.textOriginal;

export function createWriting(deps: WritingDeps) {
  const { store } = deps;
  const now = deps.now ?? (() => new Date());

  // -------------------------------------------------------------------------------------------
  // Level
  // -------------------------------------------------------------------------------------------

  async function readLevel(): Promise<number> {
    const value = await deps.settings?.getSetting(LEVEL_KEY);
    return typeof value === "number" ? clampLevel(value) : 1;
  }

  async function levelView(missions?: MissionAggregate[]): Promise<LevelView> {
    const level = await readLevel();
    const format = formatForLevel(level);
    const all = missions ?? (await store.listMissions());
    const scores = all
      .filter(
        (agg) =>
          agg.mission.format === format &&
          agg.submission.flow.status === "completed" &&
          agg.submission.scores,
      )
      .map((agg) =>
        overallScore(agg.submission.scores as NonNullable<typeof agg.submission.scores>),
      );
    const { completed, needed, average } = levelProgress(level, scores);
    return { level, format, completed, needed, average };
  }

  // -------------------------------------------------------------------------------------------
  // Views
  // -------------------------------------------------------------------------------------------

  const unitLink = (units: UnitInfo[], id: number | null): UnitLink | null => {
    const found = id === null ? undefined : units.find((u) => u.id === id);
    return found ? { id: found.id, title: found.title } : null;
  };

  function missionView(agg: MissionAggregate, units: UnitInfo[]): MissionView {
    const { mission, submission } = agg;
    return {
      id: mission.id,
      level: mission.level,
      format: mission.format,
      title: mission.title,
      topic: submission.meta.topic,
      promptEn: mission.promptEn,
      whyEs: submission.meta.whyEs,
      targetUnit: unitLink(units, mission.targetUnitId),
      grammarTargets: submission.meta.grammarTargets,
      suggestedWords: submission.meta.suggestedWords,
      limits: submission.meta.limits,
      inspiration: submission.meta.inspiration,
      source: submission.meta.source,
      createdAt: mission.createdAt.toISOString(),
    };
  }

  function errorView(error: ErrorRecord, units: UnitInfo[]): WritingErrorView {
    return {
      id: error.id,
      span: error.span.text,
      type: error.type,
      unit: unitLink(units, error.unitId),
      hintEs: error.hint,
      status: error.span.status,
      feedbackEs: error.span.feedbackEs,
      origin: error.span.origin,
      // Corrections only leave the api once the last recheck round revealed them.
      reveal: !error.fixed && error.span.reveal ? error.span.reveal : null,
    };
  }

  function actionsFor(agg: MissionAggregate, errors: ErrorRecord[]): WritingActions {
    return allowedActions({
      status: agg.submission.flow.status,
      round: agg.submission.flow.round,
      openErrors: errors.filter((e) => !e.fixed).length,
      hasText: currentText(agg).trim().length > 0,
    });
  }

  function submissionView(
    agg: MissionAggregate,
    errors: ErrorRecord[],
    units: UnitInfo[],
  ): SubmissionView {
    const { submission } = agg;
    const { flow } = submission;
    return {
      id: submission.id,
      status: flow.status,
      round: flow.round,
      maxRounds: MAX_RECHECKS,
      text: currentText(agg),
      submittedText: flow.status === "draft" ? null : submission.textOriginal,
      scores: submission.scores,
      overall: submission.scores ? overallScore(submission.scores) : null,
      strengthEs: flow.strengthEs,
      errors: errors.map((error) => errorView(error, units)),
      rewrites: submission.rewrites,
      publishedAt: flow.publishedAt,
      publishedVersion: flow.publishedVersion,
      completedAt: flow.completedAt,
      can: actionsFor(agg, errors),
    };
  }

  async function respond(
    missionId: string,
    extra: Pick<WritingMissionResponse, "error" | "levelUp"> = {},
  ): Promise<WritingMissionResponse> {
    const agg = await store.getMission(missionId);
    if (!agg) throw new WritingError("not_found", "Mission not found");
    const [units, errors, level] = await Promise.all([
      store.listUnits(),
      store.listErrors([agg.submission.id]),
      levelView(),
    ]);
    return {
      level,
      mission: missionView(agg, units),
      submission: submissionView(agg, errors, units),
      ...extra,
    };
  }

  // -------------------------------------------------------------------------------------------
  // Guards and helpers
  // -------------------------------------------------------------------------------------------

  async function load(missionId: string) {
    const agg = await store.getMission(missionId);
    if (!agg) throw new WritingError("not_found", "Mission not found");
    const errors = await store.listErrors([agg.submission.id]);
    return { agg, errors, can: actionsFor(agg, errors) };
  }

  function ensure(allowed: boolean, message: string): void {
    if (!allowed) throw new WritingError("conflict", message);
  }

  async function setFlow(agg: MissionAggregate, patch: Partial<FlowState>, hasText = true) {
    const flow = { ...agg.submission.flow, ...patch };
    await store.updateSubmission(agg.submission.id, { flow });
    await store.setMissionStatus(agg.mission.id, missionStatusFor(flow.status, hasText));
    agg.submission.flow = flow;
  }

  const validUnitId = (units: UnitInfo[], id: number | null) =>
    id !== null && units.some((u) => u.id === id) ? id : null;

  async function raisePriorities(errors: Array<{ unitId: number | null }>) {
    const counts = new Map<number, number>();
    for (const { unitId } of errors) {
      if (unitId !== null) counts.set(unitId, (counts.get(unitId) ?? 0) + 1);
    }
    for (const [unitId, by] of counts) await store.raiseUnitPriority(unitId, by);
  }

  const targetRef = (agg: MissionAggregate, units: UnitInfo[]) => {
    const found =
      units.find((u) => u.id === agg.mission.targetUnitId) ?? pickTargetUnit(units) ?? units[0];
    return found ? { id: found.id, title: found.title } : { id: 1, title: "Present Continuous" };
  };

  const catalog = (units: UnitInfo[]) => units.map((u) => ({ id: u.id, title: u.title }));

  async function createCard(agg: MissionAggregate, error: ErrorRecord): Promise<string | null> {
    const { sentence, correctedSentence } = error.span;
    if (
      !deps.ownErrors ||
      !sentence ||
      !correctedSentence ||
      sameText(sentence, correctedSentence)
    ) {
      return null;
    }
    try {
      const { cardId } = await deps.ownErrors.createOwnErrorCard({
        original: sentence,
        corrected: correctedSentence,
        hintEs: error.hint,
        rule: error.span.feedbackEs ?? undefined,
        ...(error.unitId !== null ? { unitId: error.unitId } : {}),
        writtenAt: agg.submission.createdAt.toISOString(),
        writingId: agg.submission.id,
      });
      return cardId;
    } catch (cause) {
      console.warn("writing: own-error card not created", cause);
      return null;
    }
  }

  // -------------------------------------------------------------------------------------------
  // Missions
  // -------------------------------------------------------------------------------------------

  async function generate(): Promise<WritingMissionResponse> {
    if (await store.activeMission()) {
      throw new WritingError("conflict", "Finish or skip the current mission first");
    }
    const at = now();
    const [units, level, reading, history] = await Promise.all([
      store.listUnits(),
      readLevel(),
      store.recentReading(new Date(at.getTime() - READING_DAYS * 86_400_000), 10),
      store.listMissions(),
    ]);
    const format = formatForLevel(level);
    const target = pickTargetUnit(units);
    const inspiration = reading.filter((r) => r.opinion).slice(0, 5);
    const generated = target
      ? await runWritingAi(deps.ai, prompts.generate_mission, {
          format,
          level: CEFR,
          targetUnit: unitFocus(target),
          interests: INTERESTS,
          weekOpinions: inspiration.map((r) => `${r.title}: ${r.opinion}`),
          weekArticles: reading.map((r) => r.title),
          recentMissionTitles: history.slice(0, 5).map((agg) => agg.mission.title),
        })
      : undefined;

    const defaults = FORMAT_LIMITS[format];
    let content: MissionContent;
    let limits: FormatLimits;
    if (generated) {
      const min = Math.max(1, Math.min(generated.constraints.minWords, defaults.maxWords));
      const max = Math.max(min, Math.min(generated.constraints.maxWords, defaults.maxWords * 2));
      content = {
        ...generated,
        format,
        targetUnitId: validUnitId(units, generated.targetUnitId) ?? target?.id ?? null,
      };
      limits = { minWords: min, maxWords: max, maxChars: defaults.maxChars };
    } else {
      content = fallbackMission({
        format,
        targetUnit: target ? { id: target.id, title: target.title } : null,
        inspiration,
      });
      limits = defaults;
    }

    const agg = await store.createMission(
      {
        level,
        format,
        title: content.title,
        promptEn: content.promptEn,
        targetUnitId: content.targetUnitId,
        status: "pending",
      },
      {
        textOriginal: "",
        flow: initialFlow(),
        meta: {
          topic: content.topic,
          whyEs: content.whyEs,
          grammarTargets: content.constraints.grammarTargets,
          suggestedWords: content.constraints.suggestedWords,
          limits,
          inspiration,
          source: generated ? "ai" : "fallback",
        },
      },
    );
    return respond(agg.mission.id);
  }

  async function current(): Promise<WritingCurrentResponse> {
    const agg = await store.activeMission();
    if (!agg) return { level: await levelView(), mission: null, submission: null };
    const { error: _, levelUp: __, ...view } = await respond(agg.mission.id);
    return view;
  }

  async function history(): Promise<WritingHistoryResponse> {
    const missions = await store.listMissions();
    const errors = await store.listErrors(missions.map((agg) => agg.submission.id));
    const entries = missions.map((agg): HistoryEntry => {
      const own = errors.filter((e) => e.submissionId === agg.submission.id);
      const { flow, scores } = agg.submission;
      return {
        id: agg.mission.id,
        title: agg.mission.title,
        format: agg.mission.format,
        level: agg.mission.level,
        status: flow.status,
        createdAt: agg.mission.createdAt.toISOString(),
        completedAt: flow.completedAt,
        scores,
        overall: scores ? overallScore(scores) : null,
        errorCount: own.length,
        fixedCount: own.filter((e) => e.fixed).length,
        publishedVersion: flow.publishedVersion,
      };
    });
    return { level: await levelView(missions), missions: entries };
  }

  // -------------------------------------------------------------------------------------------
  // Review flow
  // -------------------------------------------------------------------------------------------

  async function saveText(agg: MissionAggregate, text: string) {
    if (agg.submission.flow.status === "draft") {
      await store.updateSubmission(agg.submission.id, { textOriginal: text });
      agg.submission.textOriginal = text;
      await store.setMissionStatus(agg.mission.id, missionStatusFor("draft", text.trim() !== ""));
    } else {
      await store.updateSubmission(agg.submission.id, { textFixed: text });
      agg.submission.textFixed = text;
    }
  }

  async function saveDraft(missionId: string, text: string) {
    const { agg, can } = await load(missionId);
    ensure(can.saveDraft, "This text can no longer be edited");
    await saveText(agg, text);
    return respond(missionId);
  }

  async function submit(missionId: string, text: string) {
    const { agg } = await load(missionId);
    ensure(agg.submission.flow.status === "draft", "This mission was already submitted");
    await saveText(agg, text);

    const units = await store.listUnits();
    const review = await runWritingAi(deps.ai, prompts.review_writing, {
      text,
      mission: {
        title: agg.mission.title,
        format: agg.mission.format,
        promptEn: agg.mission.promptEn,
        targetUnit: targetRef(agg, units),
      },
      level: CEFR,
      units: catalog(units),
    });
    if (!review) return respond(missionId, { error: "ai-unavailable" });

    const found: NewError[] = review.errors.slice(0, MAX_ERRORS).map((finding) => ({
      span: newSpan(finding, text, "review", 0, finding.id),
      type: finding.type,
      unitId: validUnitId(units, finding.unitId),
      hint: finding.hintEs,
      fixed: false,
    }));
    const inserted = await store.insertErrors(agg.submission.id, found);
    await store.updateSubmission(agg.submission.id, { scores: review.scores });
    await setFlow(agg, {
      status: "reviewed",
      round: 0,
      strengthEs: review.strengthEs,
      reviewedAt: now().toISOString(),
    });
    await raisePriorities(inserted);
    await store.insertEvent("writing_submitted", {
      missionId,
      submissionId: agg.submission.id,
      format: agg.mission.format,
      level: agg.mission.level,
      scores: review.scores,
      overall: overallScore(review.scores),
      errorCount: inserted.length,
      errorTypes: inserted.map((e) => e.type),
      unitIds: inserted.flatMap((e) => (e.unitId === null ? [] : [e.unitId])),
    });
    return respond(missionId);
  }

  function newSpan(
    finding: Pick<WritingErrorFinding, "span">,
    text: string,
    origin: ErrorSpan["origin"],
    round: number,
    key: string,
  ): ErrorSpan {
    return {
      key,
      text: finding.span,
      status: "open",
      feedbackEs: null,
      origin,
      round,
      sentence: sentenceAround(text, finding.span),
      correctedSentence: null,
      cardId: null,
      reveal: null,
    };
  }

  async function recheck(missionId: string, text: string) {
    const { agg, errors, can } = await load(missionId);
    ensure(can.recheck, "No recheck available for this mission");
    await saveText(agg, text);

    const units = await store.listUnits();
    const open = errors.filter((e) => !e.fixed);
    const result = await runWritingAi(deps.ai, prompts.recheck_writing, {
      originalText: agg.submission.textOriginal,
      revisedText: text,
      errors: open.map((e) => ({
        id: e.span.key,
        span: e.span.text,
        type: e.type,
        unitId: e.unitId,
        hintEs: e.hint,
      })),
      units: catalog(units),
    });
    if (!result) return respond(missionId, { error: "ai-unavailable" });

    const round = agg.submission.flow.round + 1;
    for (const error of open) {
      const verdict = result.results.find((r) => r.errorId === error.span.key);
      if (!verdict) continue;
      const fixed = verdict.status === "fixed";
      const span: ErrorSpan = {
        ...error.span,
        status: verdict.status,
        feedbackEs: verdict.feedbackEs,
        correctedSentence:
          fixed && error.span.sentence
            ? correspondingSentence(text, error.span.sentence)
            : error.span.correctedSentence,
      };
      if (fixed && !span.cardId) span.cardId = await createCard(agg, { ...error, span });
      await store.updateError(error.id, { span, fixed });
    }

    if (result.newIssue) {
      const issue = result.newIssue;
      const inserted = await store.insertErrors(agg.submission.id, [
        {
          span: newSpan(issue, text, "recheck", round, `n${round}`),
          type: issue.type,
          unitId: validUnitId(units, issue.unitId),
          hint: issue.hintEs,
          fixed: false,
        },
      ]);
      await raisePriorities(inserted);
    }

    await setFlow(agg, { status: "rechecked", round });
    if (round >= MAX_RECHECKS) await reveal(agg, text);
    return respond(missionId);
  }

  /** After the last round: explanation + corrected fragment for every error still not fixed. */
  async function reveal(agg: MissionAggregate, text: string) {
    const remaining = (await store.listErrors([agg.submission.id])).filter((e) => !e.fixed);
    if (remaining.length === 0) return;
    const result = await runWritingAi(deps.ai, revealWritingPrompt, {
      text,
      errors: remaining.map((e) => ({
        id: e.span.key,
        span: e.span.text,
        type: e.type,
        hintEs: e.span.feedbackEs ?? e.hint,
      })),
    });
    for (const error of remaining) {
      const item = result?.items.find((i) => i.errorId === error.span.key);
      await store.updateError(error.id, {
        span: {
          ...error.span,
          reveal: {
            explanationEs: item?.explanationEs ?? error.span.feedbackEs ?? error.hint,
            correctedFragment: item?.correctedFragment ?? null,
          },
        },
      });
    }
  }

  async function rewrite(missionId: string) {
    const { agg, can } = await load(missionId);
    ensure(can.rewrite, "Rewrites are available after the self-fix step");
    const result = await runWritingAi(deps.ai, prompts.rewrite_natural, {
      text: currentText(agg),
      format: agg.mission.format,
    });
    if (!result) return respond(missionId, { error: "ai-unavailable" });
    await store.updateSubmission(agg.submission.id, { rewrites: result.versions });
    await setFlow(agg, { status: "rewritten" });
    return respond(missionId);
  }

  async function complete(missionId: string, publishedVersion?: PublishedVersion) {
    const { agg, errors, can } = await load(missionId);
    ensure(can.complete, "This mission cannot be completed yet");
    const at = now().toISOString();
    await setFlow(agg, {
      status: "completed",
      completedAt: at,
      ...(publishedVersion ? { publishedAt: at, publishedVersion } : {}),
    });
    const { scores } = agg.submission;
    await store.insertEvent("writing_completed", {
      missionId,
      submissionId: agg.submission.id,
      format: agg.mission.format,
      level: agg.mission.level,
      scores,
      overall: scores ? overallScore(scores) : null,
      errorCount: errors.length,
      fixedCount: errors.filter((e) => e.fixed).length,
      publishedVersion: publishedVersion ?? null,
    });

    const level = await readLevel();
    const missions = await store.listMissions();
    const format = formatForLevel(level);
    const progress = levelProgress(
      level,
      missions
        .filter((m) => m.mission.format === format && m.submission.flow.status === "completed")
        .flatMap((m) => (m.submission.scores ? [overallScore(m.submission.scores)] : [])),
    );
    if (progress.advance && deps.settings) {
      await deps.settings.putSetting(LEVEL_KEY, level + 1);
      await store.insertEvent("writing_level_up", {
        from: level,
        to: level + 1,
        format: formatForLevel(level + 1),
        average: progress.average,
      });
      return respond(missionId, { levelUp: true });
    }
    return respond(missionId);
  }

  async function markPublished(missionId: string, version: PublishedVersion) {
    const { agg, can } = await load(missionId);
    ensure(can.markPublished, "Only finished texts can be marked as published");
    await setFlow(agg, { publishedAt: now().toISOString(), publishedVersion: version });
    return respond(missionId);
  }

  async function skip(missionId: string) {
    const { agg, can } = await load(missionId);
    ensure(can.skip, "This mission is already closed");
    await setFlow(agg, { status: "skipped" });
    return respond(missionId);
  }

  // -------------------------------------------------------------------------------------------
  // Practice from recent errors
  // -------------------------------------------------------------------------------------------

  async function practice(count: number): Promise<PracticeResponse> {
    const [recent, units] = await Promise.all([
      store.recentErrors(RECENT_ERRORS),
      store.listUnits(),
    ]);
    if (recent.length === 0) return { unit: null, items: [] };

    const tally = new Map<number, number>();
    for (const error of recent) {
      if (error.unitId !== null) tally.set(error.unitId, (tally.get(error.unitId) ?? 0) + 1);
    }
    // Most frequent unit among recent errors; ties go to the most recent error's unit.
    const topUnitId = recent.reduce<number | null>((best, error) => {
      if (error.unitId === null) return best;
      if (best === null) return error.unitId;
      return (tally.get(error.unitId) ?? 0) > (tally.get(best) ?? 0) ? error.unitId : best;
    }, null);
    const unitInfo = units.find((u) => u.id === topUnitId) ?? pickTargetUnit(units) ?? undefined;
    if (!unitInfo) return { unit: null, items: [] };

    const sources = (topUnitId === null ? recent : recent.filter((e) => e.unitId === topUnitId))
      .slice(0, count)
      .map((error) => ({
        id: error.id,
        sentence: error.span.sentence ?? error.span.text,
        span: error.span.text,
        type: error.type,
        ...(error.span.correctedSentence ? { fixed: error.span.correctedSentence } : {}),
      }));
    const unit = { id: unitInfo.id, title: unitInfo.title };
    const result = await runWritingAi(deps.ai, prompts.generate_practice, {
      unit: { ...unitFocus(unitInfo), theorySummary: theorySummary(unitInfo.theory) },
      sources,
      count: sources.length,
    });
    if (!result) return { unit, items: [], error: "ai-unavailable" };
    return { unit, items: result.items.slice(0, count) };
  }

  return {
    current,
    history,
    generate,
    saveDraft,
    submit,
    recheck,
    rewrite,
    complete,
    markPublished,
    skip,
    practice,
  };
}

export type Writing = ReturnType<typeof createWriting>;
