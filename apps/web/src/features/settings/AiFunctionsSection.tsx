import type {
  AiFunctionConfig,
  AiProviderId,
  ModelSummary,
  ThinkValue,
} from "@english-course/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { decodeThink, effortOptions, encodeThink, functionLabel } from "./effort.ts";
import styles from "./SettingsPage.module.css";
import {
  fetchAiFunctions,
  fetchCapabilities,
  fetchModels,
  MODEL_METADATA_STALE_MS,
  modelLabel,
  PROVIDER_LABEL,
  saveAiFunction,
  settingsKeys,
} from "./settings.api.ts";

type RowProps = { provider: AiProviderId; config: AiFunctionConfig; models: ModelSummary[] };

function AiFunctionRow({ provider, config, models }: RowProps) {
  const queryClient = useQueryClient();
  const [model, setModel] = useState(config.model);
  const [think, setThink] = useState<ThinkValue>(config.think);
  const [message, setMessage] = useState("");
  const modelId = useId();
  const effortId = useId();
  const label = functionLabel(config.id);

  const capabilities = useQuery({
    queryKey: settingsKeys.capabilities(provider, model),
    queryFn: () => fetchCapabilities(provider, model),
    staleTime: MODEL_METADATA_STALE_MS,
    retry: false,
  });

  const save = useMutation({
    mutationFn: () => saveAiFunction(provider, config.id, { model, think }),
    onSuccess: (saved) => {
      setMessage("Saved");
      queryClient.setQueryData<AiFunctionConfig[]>(settingsKeys.aiFunctions(provider), (list) =>
        list?.map((item) => (item.id === saved.id ? saved : item)),
      );
    },
    onError: (error) => setMessage(error.message),
  });

  const options = models.some((m) => m.name === model) ? models : [{ name: model }, ...models];
  const thinking = capabilities.isSuccess ? capabilities.data.thinking : undefined;
  const dirty = model !== config.model || think !== config.think;

  return (
    <tr className={styles.row}>
      <th scope="row" className={styles.fnCell}>
        {label}
        <span className={styles.tier}>{config.tier}</span>
      </th>
      <td className={styles.cell}>
        <label htmlFor={modelId} className={styles.cellLabel}>
          Model for {label}
        </label>
        <select
          id={modelId}
          className={styles.select}
          value={model}
          onChange={(event) => {
            setModel(event.target.value);
            setMessage("");
          }}
        >
          {options.map((m) => (
            <option key={m.name} value={m.name}>
              {modelLabel(m)}
            </option>
          ))}
        </select>
      </td>
      <td className={styles.cell}>
        <label htmlFor={effortId} className={styles.cellLabel}>
          Effort for {label}
        </label>
        <select
          id={effortId}
          className={styles.select}
          value={encodeThink(think)}
          onChange={(event) => {
            setThink(decodeThink(event.target.value));
            setMessage("");
          }}
        >
          {effortOptions(thinking, think).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </td>
      <td className={styles.cell}>
        <button
          className={styles.primary}
          type="button"
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          aria-label={`Save ${label}`}
        >
          Save
        </button>
        <span role="status" className={styles.message}>
          {message}
        </span>
      </td>
    </tr>
  );
}

export function AiFunctionsSection({ provider }: { provider: AiProviderId }) {
  const titleId = useId();
  const functions = useQuery({
    queryKey: settingsKeys.aiFunctions(provider),
    queryFn: () => fetchAiFunctions(provider),
  });
  const models = useQuery({
    queryKey: settingsKeys.models(provider),
    queryFn: () => fetchModels(provider),
    staleTime: MODEL_METADATA_STALE_MS,
    retry: false,
  });

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.heading}>
        AI functions
      </h2>
      <p className={styles.muted}>
        Model and reasoning effort used by each AI feature on {PROVIDER_LABEL[provider]}.
        {provider === "openrouter" && " Prices are USD per 1M input / output tokens."}
      </p>
      {models.isError && (
        <p className={styles.warning}>
          Could not load the model list ({models.error.message}). Check the API key.
        </p>
      )}
      {functions.isPending && <p className={styles.muted}>Loading…</p>}
      {functions.isError && <p className={styles.warning}>Could not load the AI functions.</p>}
      {functions.isSuccess && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Function</th>
              <th scope="col">Model</th>
              <th scope="col">Effort</th>
              <th scope="col">
                <span className={styles.visuallyHidden}>Save</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {functions.data.map((config) => (
              <AiFunctionRow
                key={config.id}
                provider={provider}
                config={config}
                models={models.data ?? []}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
