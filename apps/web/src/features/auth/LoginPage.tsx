import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { HttpError } from "../../shared/api/http.ts";
import { Button, Eyebrow, Field } from "../../shared/ui/index.ts";
import { login, safeNext } from "./auth.api.ts";
import styles from "./LoginPage.module.css";

function errorText(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 401) return "Wrong email or password.";
    if (error.status === 429) return "Too many attempts. Wait a few minutes and try again.";
  }
  return "Could not log in. Is the server running?";
}

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      await navigate(safeNext(params.get("next")), { replace: true });
    },
  });

  const unavailable = params.get("reason") === "unavailable";
  const retry = () => void navigate(safeNext(params.get("next")), { replace: true });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (email && password) mutation.mutate({ email: email.trim(), password });
  };

  return (
    <main className={styles.page}>
      <section data-tone="lime" className={styles.brand}>
        <Eyebrow rule>An English course</Eyebrow>
        <div className={styles.brandBody}>
          <h1 className={styles.wordmark}>English Course</h1>
          <p className={styles.tagline}>English, one story at a time.</p>
          <p className={styles.lead}>
            Short units, real articles and your own writing — reviewed, remembered, and shown back
            to you as progress.
          </p>
        </div>
        <div className={styles.brandFoot} aria-hidden="true">
          <span className={`numeral ${styles.brandNumber}`}>01</span>
          <span className="eyebrow">/ Sign in</span>
        </div>
      </section>
      <section data-tone="plum" className={styles.formPanel}>
        <form
          data-tone="cream"
          className={styles.card}
          onSubmit={onSubmit}
          aria-describedby={errorId}
        >
          <div className={styles.cardHead}>
            <Eyebrow muted>Welcome back</Eyebrow>
            <h2 className={styles.cardTitle}>Sign in to continue</h2>
          </div>
          {unavailable && (
            <div role="status" className={styles.notice}>
              <p className={styles.noticeText}>
                Server unavailable. Your session could not be checked; try again in a moment.
              </p>
              <Button variant="secondary" onClick={retry}>
                Retry
              </Button>
            </div>
          )}
          <Field label="Email" id={emailId}>
            <input
              id={emailId}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>
          <Field label="Password" id={passwordId}>
            <input
              id={passwordId}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>
          <Button type="submit" arrow fullWidth disabled={mutation.isPending}>
            {mutation.isPending ? "Logging in…" : "Log in"}
          </Button>
          <p id={errorId} role="alert" className={styles.error}>
            {mutation.isError ? errorText(mutation.error) : ""}
          </p>
        </form>
      </section>
    </main>
  );
}
