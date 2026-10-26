import type { AiProviderId, AiProviderResponse } from "@english-course/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import styles from "./SettingsPage.module.css";
import { PROVIDER_LABEL, saveAiProvider, settingsKeys } from "./settings.api.ts";

/** Active AI provider switch; each provider keeps its own key and per-function models. */
export function AiProviderSection({ current }: { current: AiProviderResponse }) {
  const queryClient = useQueryClient();
  const titleId = useId();
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
    <section className={styles.section} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.heading}>
        AI provider
      </h2>
      <p className={styles.muted}>
        Every AI feature uses the active provider. Keys and model choices are kept per provider.
      </p>
      <fieldset className={styles.actions} aria-labelledby={titleId}>
        {current.available.map((provider: AiProviderId) => (
          <label key={provider} className={styles.label}>
            <input
              type="radio"
              name="ai-provider"
              value={provider}
              checked={current.provider === provider}
              disabled={save.isPending}
              onChange={() => save.mutate(provider)}
            />{" "}
            {PROVIDER_LABEL[provider]}
          </label>
        ))}
      </fieldset>
      <p role="status" className={styles.message}>
        {message}
      </p>
    </section>
  );
}
