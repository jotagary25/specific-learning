import type { AiFunctionConfig, ModelSummary, ThinkValue } from "@english-course/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { decodeThink, effortOptions, encodeThink, functionLabel } from "./effort.ts";
import styles from "./SettingsPage.module.css";
import {
  fetchAiFunctions,
  fetchCapabilities,
  fetchModels,
  saveAiFunction,
  settingsKeys,
} from "./settings.api.ts";

function AiFunctionRow({ config, models }: { config: AiFunctionConfig; models: ModelSummary[] }) {
  const queryClient = useQueryClient();
  const [model, setModel] = useState(config.model);
  const [think, setThink] = useState<ThinkValue>(config.think);
  const [message, setMessage] = useState("");
  const modelId = useId();
  const effortId = useId();
  const label = functionLabel(config.id);

  const capabilities = useQuery({
    queryKey: settingsKeys.capabilities(model),
    queryFn: () => fetchCapabilities(model),
    staleTime: 10 * 60_000,
    retry: false,
  });

  const save = useMutation({
    mutationFn: () => saveAiFunction(config.id, { model, think }),
    onSuccess: (saved) => {
      setMessage("Saved");
      queryClient.setQueryData<AiFunctionConfig[]>(settingsKeys.aiFunctions, (list) =>
        list?.map((item) => (item.id === saved.id ? saved : item)),
      );
    },
    onError: (error) => setMessage(error.message),
  });

  const modelNames = models.map((m) => m.name);
  if (!modelNames.includes(model)) modelNames.unshift(model);
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
          {modelNames.map((name) => (
            <option key={name} value={name}>
              {name}
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

export function AiFunctionsSection() {
  const titleId = useId();
  const functions = useQuery({ queryKey: settingsKeys.aiFunctions, queryFn: fetchAiFunctions });
  const models = useQuery({
    queryKey: settingsKeys.models,
    queryFn: fetchModels,
    staleTime: 10 * 60_000,
    retry: false,
  });

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.heading}>
        AI functions
      </h2>
      <p className={styles.muted}>Model and reasoning effort used by each AI feature.</p>
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
              <AiFunctionRow key={config.id} config={config} models={models.data ?? []} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
