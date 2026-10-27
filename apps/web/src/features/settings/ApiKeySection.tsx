import type { AiKeyStatus, AiProviderId } from "@english-course/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { Button } from "../../shared/ui/index.ts";
import styles from "./SettingsPage.module.css";
import { SettingsSection } from "./SettingsSection.tsx";
import {
  deleteAiKey,
  fetchAiKey,
  PROVIDER_LABEL,
  saveAiKey,
  settingsKeys,
  testAiKey,
} from "./settings.api.ts";

function describeStatus(status: AiKeyStatus): string {
  if (status.error === "undecryptable") {
    return "Saved key can't be decrypted (APP_SECRET changed?) — enter it again";
  }
  if (!status.configured) return "Not configured";
  const ending = status.last4 ? ` · ends in ${status.last4}` : "";
  return `Saved (encrypted)${ending}`;
}

export function ApiKeySection({ provider }: { provider: AiProviderId }) {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const inputId = useId();
  const statusId = useId();

  const status = useQuery({
    queryKey: settingsKeys.aiKey(provider),
    queryFn: () => fetchAiKey(provider),
  });

  const onKeyChanged = async (next: AiKeyStatus) => {
    // The mutation answer is authoritative: show it now instead of waiting for the refetch,
    // which is still needed for the key-dependent model list and capabilities.
    queryClient.setQueryData(settingsKeys.aiKey(provider), next);
    await queryClient.invalidateQueries({ queryKey: ["settings"] });
  };

  const save = useMutation({
    mutationFn: (key: string) => saveAiKey(provider, key),
    onSuccess: async (next) => {
      setApiKey("");
      setMessage("Key saved.");
      await onKeyChanged(next);
    },
    onError: (error) => setMessage(error.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteAiKey(provider),
    onSuccess: async (next) => {
      setMessage("Stored key removed.");
      await onKeyChanged(next);
    },
    onError: (error) => setMessage(error.message),
  });

  const test = useMutation({
    mutationFn: () => testAiKey(provider),
    onSuccess: (result) =>
      setMessage(
        result.ok
          ? `Connection works: ${result.modelCount ?? 0} models available.`
          : `Connection failed: ${result.message ?? result.error ?? "unknown error"}`,
      ),
    onError: (error) => setMessage(error.message),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (apiKey.trim()) save.mutate(apiKey.trim());
  };

  return (
    <SettingsSection eyebrow="Credentials" title={`${PROVIDER_LABEL[provider]} API key`}>
      <p
        id={statusId}
        className={
          status.data?.configured && !status.data.error ? styles.keyStatusOk : styles.keyStatus
        }
      >
        {status.isPending
          ? "Loading…"
          : status.isError
            ? "Could not load the key status."
            : describeStatus(status.data)}
      </p>
      <form className={styles.keyForm} onSubmit={onSubmit}>
        <label htmlFor={inputId} className={styles.label}>
          New {PROVIDER_LABEL[provider]} API key
        </label>
        <input
          id={inputId}
          className={styles.input}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          aria-describedby={statusId}
        />
        <div className={styles.actions}>
          <Button type="submit" disabled={!apiKey.trim() || save.isPending}>
            Save key
          </Button>
          <Button
            variant="secondary"
            onClick={() => test.mutate()}
            disabled={!status.data?.configured || test.isPending}
          >
            {test.isPending ? "Testing…" : "Test connection"}
          </Button>
          {status.data?.source === "db" && (
            <Button variant="ghost" onClick={() => remove.mutate()} disabled={remove.isPending}>
              Remove stored key
            </Button>
          )}
        </div>
      </form>
      <p role="status" className={styles.message}>
        {message}
      </p>
    </SettingsSection>
  );
}
