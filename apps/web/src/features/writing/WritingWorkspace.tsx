import {
  lengthStatus,
  type MissionView,
  type PublishedVersion,
  type SubmissionView,
  type WritingMissionResponse,
} from "@english-course/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button, Eyebrow, Panel } from "../../shared/ui/index.ts";
import { ReviewPanel } from "./ReviewPanel.tsx";
import { Rewrites } from "./Rewrites.tsx";
import styles from "./Writing.module.css";
import {
  completeMission,
  generateMission,
  localDraft,
  markPublished,
  recheckText,
  requestRewrites,
  saveDraft,
  skipMission,
  submitText,
  writingKeys,
} from "./writing.api.ts";
import { versionLabel } from "./writing.model.ts";

export const AUTOSAVE_MS = 3000;

type SaveState = "saved" | "saving" | "local";

const AI_DOWN =
  "The AI is not available right now. Your text is saved; try again in a moment or check the API key in Settings.";

/** Editor + review flow of the active mission. Keyed by mission id by the page. */
export function WritingWorkspace({
  mission,
  submission,
}: {
  mission: MissionView;
  submission: SubmissionView;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(() => localDraft.read(mission.id) ?? submission.text);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [notice, setNotice] = useState<string | null>(null);
  const [levelUp, setLevelUp] = useState(false);
  const saved = useRef(submission.text);
  const can = submission.can;

  // Autosave a few seconds after the last keystroke; keep a local copy meanwhile.
  useEffect(() => {
    if (!can.saveDraft || text === saved.current) return;
    localDraft.write(mission.id, text);
    const timer = setTimeout(() => {
      setSaveState("saving");
      saveDraft(mission.id, text).then(
        () => {
          saved.current = text;
          setSaveState("saved");
        },
        () => setSaveState("local"),
      );
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [text, can.saveDraft, mission.id]);

  const apply = (res: WritingMissionResponse) => {
    saved.current = res.submission.text;
    setSaveState("saved");
    setNotice(res.error === "ai-unavailable" ? AI_DOWN : null);
    if (res.levelUp) setLevelUp(true);
    if (res.submission.status === "completed" || res.submission.status === "skipped") {
      localDraft.clear(mission.id);
    }
    queryClient.setQueryData(writingKeys.current, {
      level: res.level,
      mission: res.mission,
      submission: res.submission,
    });
    void queryClient.invalidateQueries({ queryKey: writingKeys.history });
  };
  const onError = (error: Error) => setNotice(error.message);

  const action = useMutation({
    mutationFn: (run: () => Promise<WritingMissionResponse>) => run(),
    onSuccess: apply,
    onError,
  });
  const next = useMutation({
    mutationFn: generateMission,
    onSuccess: (res) =>
      queryClient.setQueryData(writingKeys.current, {
        level: res.level,
        mission: res.mission,
        submission: res.submission,
      }),
    onError,
  });
  const busy = action.isPending;
  const run = (fn: () => Promise<WritingMissionResponse>) => action.mutate(fn);

  const length = lengthStatus(text, mission.limits);
  const status = submission.status;
  const editable = can.saveDraft;
  const reviewing = status !== "draft";
  const closed = status === "completed" || status === "skipped";

  return (
    <div className={styles.workspace}>
      {notice ? (
        <p role="alert" className={styles.notice}>
          {notice}
        </p>
      ) : null}

      {!closed ? (
        <section className={styles.editor} aria-labelledby="editor-label">
          <label className={styles.editorLabel} id="editor-label">
            <span className={styles.editorTitle}>{reviewing ? "Fix your text" : "Your text"}</span>
            <textarea
              className={styles.textarea}
              value={text}
              readOnly={!editable}
              onChange={(event) => setText(event.target.value)}
              spellCheck={false}
            />
          </label>
          <div className={styles.editorMeta}>
            <span
              className={`${styles.counter} ${length.state === "long" ? styles.counterLong : ""}`}
              aria-live="polite"
            >
              {length.words} / {mission.limits.maxWords} words
              {mission.limits.maxChars
                ? ` · ${length.chars} / ${mission.limits.maxChars} chars`
                : ""}
              {length.state === "short" ? ` · aim for at least ${mission.limits.minWords}` : ""}
            </span>
            {editable ? (
              <span className={styles.counter}>
                {saveState === "saving"
                  ? "Saving…"
                  : saveState === "local"
                    ? "Saved on this device only"
                    : text === saved.current
                      ? "Saved"
                      : "Editing…"}
              </span>
            ) : null}
          </div>
          <div className={styles.editorActions}>
            {status === "draft" ? (
              <Button
                arrow
                fullWidth="mobile"
                disabled={busy || !text.trim()}
                onClick={() => run(() => submitText(mission.id, text))}
              >
                {busy ? "Reviewing…" : "Submit for review"}
              </Button>
            ) : null}
            {can.recheck ? (
              <Button
                arrow
                fullWidth="mobile"
                disabled={busy || !text.trim()}
                onClick={() => run(() => recheckText(mission.id, text))}
              >
                {busy
                  ? "Checking…"
                  : `Check my fixes (${submission.round + 1} of ${submission.maxRounds})`}
              </Button>
            ) : null}
            {can.rewrite ? (
              <Button
                variant={can.recheck ? "secondary" : "primary"}
                fullWidth="mobile"
                disabled={busy}
                onClick={() => run(() => requestRewrites(mission.id))}
              >
                Show natural versions
              </Button>
            ) : null}
            {can.complete ? (
              <Button
                variant="secondary"
                fullWidth="mobile"
                disabled={busy}
                onClick={() => run(() => completeMission(mission.id))}
              >
                Finish mission
              </Button>
            ) : null}
            {can.skip ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => run(() => skipMission(mission.id))}
              >
                Skip this mission
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {reviewing && status !== "skipped" ? (
        <ReviewPanel text={closed ? submission.text : text} submission={submission} />
      ) : null}

      {submission.rewrites.length > 0 ? (
        <Rewrites
          ownText={submission.text}
          rewrites={submission.rewrites}
          publishedVersion={submission.publishedVersion}
          canMarkPublished={can.markPublished}
          onMarkPublished={(version: PublishedVersion) =>
            run(() => markPublished(mission.id, version))
          }
        />
      ) : null}

      {closed ? (
        <Panel tone="lime" padding="lg" className={styles.closed} role="status">
          <Eyebrow rule>{status === "completed" ? "Well done" : "Set aside"}</Eyebrow>
          <h2 className={styles.startTitle}>
            {status === "completed" ? "Mission completed" : "Mission skipped"}
          </h2>
          {levelUp ? (
            <p className={styles.lead}>You moved up to the next format. Well earned.</p>
          ) : null}
          {submission.publishedVersion ? (
            <p>Published: {versionLabel(submission.publishedVersion)}</p>
          ) : null}
          <div className={styles.actions}>
            <Button
              arrow
              fullWidth="mobile"
              disabled={next.isPending}
              onClick={() => next.mutate()}
            >
              {next.isPending ? "Preparing…" : "Next mission"}
            </Button>
            <Button to="/writing/history" variant="secondary" fullWidth="mobile">
              History
            </Button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
