import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { HttpError } from "../../shared/api/http.ts";
import { login, safeNext } from "./auth.api.ts";
import styles from "./LoginPage.module.css";

function errorText(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 401) return "Wrong password.";
    if (error.status === 429) return "Too many attempts. Wait a few minutes and try again.";
  }
  return "Could not log in. Is the server running?";
}

export function LoginPage() {
  const [password, setPassword] = useState("");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
    if (password) mutation.mutate(password);
  };

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={onSubmit} aria-describedby={errorId}>
        <h1 className={styles.title}>English Course</h1>
        {unavailable && (
          <div role="status" className={styles.notice}>
            <p className={styles.noticeText}>
              Server unavailable. Your session could not be checked; try again in a moment.
            </p>
            <button className={styles.secondary} type="button" onClick={retry}>
              Retry
            </button>
          </div>
        )}
        <label htmlFor={passwordId} className={styles.label}>
          Password
        </label>
        <input
          id={passwordId}
          className={styles.input}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button className={styles.button} type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Logging in…" : "Log in"}
        </button>
        <p id={errorId} role="alert" className={styles.error}>
          {mutation.isError ? errorText(mutation.error) : ""}
        </p>
      </form>
    </main>
  );
}
