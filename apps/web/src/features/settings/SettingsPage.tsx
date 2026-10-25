import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { logout } from "../auth/auth.api.ts";
import { AiFunctionsSection } from "./AiFunctionsSection.tsx";
import { ApiKeySection } from "./ApiKeySection.tsx";
import styles from "./SettingsPage.module.css";

export function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
      <section className={styles.section}>
        <button className={styles.secondary} type="button" onClick={() => signOut.mutate()}>
          Log out
        </button>
      </section>
    </div>
  );
}
