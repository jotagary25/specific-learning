import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { Link, useNavigate } from "react-router";
import { logout } from "../auth/auth.api.ts";
import { AiFunctionsSection } from "./AiFunctionsSection.tsx";
import { ApiKeySection } from "./ApiKeySection.tsx";
import styles from "./SettingsPage.module.css";

export function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const evalTitle = useId();
  const signOut = useMutation({
    mutationFn: logout,
    onSettled: async () => {
      queryClient.clear();
      await navigate("/login", { replace: true });
    },
  });

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Settings</h1>
      <ApiKeySection />
      <AiFunctionsSection />
      <section className={styles.section} aria-labelledby={evalTitle}>
        <h2 id={evalTitle} className={styles.heading}>
          Model evaluation
        </h2>
        <p className={styles.muted}>
          Compare models on fixed learner texts before choosing one: errors found, hint leaks, JSON
          validity, latency and tokens.
        </p>
        <Link to="/settings/eval">Open model evaluation</Link>
      </section>
      <section className={styles.section}>
        <button className={styles.secondary} type="button" onClick={() => signOut.mutate()}>
          Log out
        </button>
      </section>
    </div>
  );
}
