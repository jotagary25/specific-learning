import type { AiProviderId, AiProviderResponse } from "@english-course/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import styles from "./SettingsPage.module.css";
import { SettingsSection } from "./SettingsSection.tsx";
import { PROVIDER_LABEL, saveAiProvider, settingsKeys } from "./settings.api.ts";

/** Active AI provider switch; each provider keeps its own key and per-function models. */
export function AiProviderSection({ current }: { current: AiProviderResponse }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const save = useMutation({
    mutationFn: saveAiProvider,
    onSuccess: async (next) => {
      setMessage(`Now using ${PROVIDER_LABEL[next.provider]}.`);
      queryClient.setQueryData(settingsKeys.provider, next);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error) => setMessage(error.message),
  });

  return (
    <SettingsSection number="02" eyebrow="Where the AI runs" title="AI provider">
      <p className={styles.muted}>
        Every AI feature uses the active provider. Keys and model choices are kept per provider.
      </p>
      <fieldset className={styles.segmented}>
        <legend className="visually-hidden">AI provider</legend>
        {current.available.map((provider: AiProviderId) => (
          <label key={provider} className={styles.segment}>
            <input
              type="radio"
              name="ai-provider"
              value={provider}
              checked={current.provider === provider}
              disabled={save.isPending}
              onChange={() => save.mutate(provider)}
            />
            {PROVIDER_LABEL[provider]}
          </label>
        ))}
      </fieldset>
      <p role="status" className={styles.message}>
        {message}
      </p>
    </SettingsSection>
  );
}
