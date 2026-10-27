import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Badge, Button, Eyebrow } from "../../shared/ui/index.ts";
import { authKeys, fetchMe, logout } from "../auth/auth.api.ts";
import { AiFunctionsSection } from "./AiFunctionsSection.tsx";
import { AiProviderSection } from "./AiProviderSection.tsx";
import { ApiKeySection } from "./ApiKeySection.tsx";
import { PreferencesSection } from "./PreferencesSection.tsx";
import styles from "./SettingsPage.module.css";
import { SettingsSection } from "./SettingsSection.tsx";
import { fetchAiProvider, settingsKeys } from "./settings.api.ts";

export function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: authKeys.me, queryFn: fetchMe });
  const user = me.data?.user;
  const provider = useQuery({ queryKey: settingsKeys.provider, queryFn: fetchAiProvider });
  const signOut = useMutation({
    mutationFn: logout,
    onSettled: async () => {
      queryClient.clear();
      await navigate("/login", { replace: true });
    },
  });

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <Eyebrow rule>Your course, your models</Eyebrow>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.lead}>
          Account, AI provider and keys, the model behind each feature, and your study rhythm.
        </p>
      </header>
      <SettingsSection number="01" eyebrow="Who is studying" title="Account">
        {user ? (
          <p className={styles.account}>
            <span className={styles.muted}>Signed in as</span> <strong>{user.email}</strong>{" "}
            <Badge tone={user.role === "admin" ? "accent" : "neutral"}>
              {user.role === "admin" ? "Admin" : "Learner"}
            </Badge>
          </p>
        ) : (
          <p className={styles.muted}>{me.isError ? "Account unavailable." : "Loading…"}</p>
        )}
      </SettingsSection>
      {provider.isError && <p className={styles.warning}>Could not load the AI provider.</p>}
      {provider.isSuccess && (
        <>
          <AiProviderSection current={provider.data} />
          {provider.data.available.map((id) => (
            <ApiKeySection key={id} provider={id} />
          ))}
          <AiFunctionsSection provider={provider.data.provider} />
        </>
      )}
      <PreferencesSection />
      <SettingsSection number="05" eyebrow="Benchmarks" title="Model evaluation">
        <p className={styles.muted}>
          Compare models on fixed learner texts before choosing one: errors found, hint leaks, JSON
          validity, latency, tokens and cost.
        </p>
        <div className={styles.actions}>
          <Button to="/settings/eval" variant="secondary" arrow>
            Open model evaluation
          </Button>
        </div>
      </SettingsSection>
      <div className={styles.signOut}>
        <Button variant="ghost" onClick={() => signOut.mutate()}>
          Log out
        </Button>
      </div>
    </div>
  );
}
