import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { Link, useNavigate } from "react-router";
import { authKeys, fetchMe, logout } from "../auth/auth.api.ts";
import { AiFunctionsSection } from "./AiFunctionsSection.tsx";
import { ApiKeySection } from "./ApiKeySection.tsx";
import { PreferencesSection } from "./PreferencesSection.tsx";
import styles from "./SettingsPage.module.css";

export function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const evalTitle = useId();
  const accountTitle = useId();
  const me = useQuery({ queryKey: authKeys.me, queryFn: fetchMe });
  const user = me.data?.user;
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
      <section className={styles.section} aria-labelledby={accountTitle}>
        <h2 id={accountTitle} className={styles.heading}>
          Account
        </h2>
        {user ? (
          <p className={styles.account}>
            <span>Signed in as</span> <strong>{user.email}</strong>{" "}
            <span className={styles.role}>{user.role === "admin" ? "Admin" : "Learner"}</span>
          </p>
        ) : (
          <p className={styles.muted}>{me.isError ? "Account unavailable." : "Loading…"}</p>
        )}
      </section>
      <ApiKeySection />
      <AiFunctionsSection />
      <PreferencesSection />
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
