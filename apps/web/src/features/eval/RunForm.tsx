import { type AiProviderId, EvalFunctionId, type ThinkValue } from "@english-course/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { decodeThink, effortOptions, encodeThink, functionLabel } from "../settings/effort.ts";
import {
  fetchAiProvider,
  fetchCapabilities,
  fetchModels,
  modelLabel,
  PROVIDER_LABEL,
  settingsKeys,
} from "../settings/settings.api.ts";
import styles from "./EvalPage.module.css";
import { estimateCalls } from "./estimate.ts";
import { evalKeys, fetchFixtureCounts, startEval } from "./eval.api.ts";

function EffortSelect({
  provider,
  model,
  think,
  onChange,
}: {
  provider: AiProviderId;
  model: string;
  think: ThinkValue;
  onChange: (think: ThinkValue) => void;
}) {
  const id = useId();
  const capabilities = useQuery({
    queryKey: settingsKeys.capabilities(provider, model),
    queryFn: () => fetchCapabilities(provider, model),
    staleTime: 10 * 60_000,
    retry: false,
  });
  const thinking = capabilities.isSuccess ? capabilities.data.thinking : undefined;
  return (
    <span className={styles.effort}>
      <label htmlFor={id} className={styles.visuallyHidden}>
        Effort for {model}
      </label>
      <select
        id={id}
        className={styles.select}
        value={encodeThink(think)}
        onChange={(event) => onChange(decodeThink(event.target.value))}
      >
        {effortOptions(thinking, think).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  );
}

export function RunForm() {
  const queryClient = useQueryClient();
  const modelsTitle = useId();
  const functionsTitle = useId();
  const [selected, setSelected] = useState<Map<string, ThinkValue>>(new Map());
  const [functions, setFunctions] = useState<EvalFunctionId[]>(["review_writing"]);
  const [message, setMessage] = useState("");

  const providerQuery = useQuery({ queryKey: settingsKeys.provider, queryFn: fetchAiProvider });
  // Runs use the active provider (the api resolves it too); until it loads nothing is listed.
  const provider = providerQuery.data?.provider;
  const models = useQuery({
    queryKey: settingsKeys.models(provider ?? "ollama"),
    queryFn: () => fetchModels(provider ?? "ollama"),
    enabled: provider !== undefined,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const counts = useQuery({ queryKey: evalKeys.fixtures, queryFn: fetchFixtureCounts });

  const calls = estimateCalls(counts.data, functions, selected.size);

  const start = useMutation({
    mutationFn: () =>
      startEval({
        models: [...selected].map(([model, think]) => ({ model, think })),
        functions,
      }),
    onSuccess: async ({ runIds }) => {
      setMessage(`Started ${runIds.length} run${runIds.length === 1 ? "" : "s"}.`);
      await queryClient.invalidateQueries({ queryKey: evalKeys.runs });
    },
    onError: (error) => setMessage(error.message),
  });

  const toggleModel = (name: string, on: boolean) => {
    setSelected((current) => {
      const next = new Map(current);
      if (on) next.set(name, null);
      else next.delete(name);
      return next;
    });
    setMessage("");
  };

  const toggleFunction = (fn: EvalFunctionId, on: boolean) => {
    setFunctions((current) =>
      on
        ? EvalFunctionId.options.filter((f) => f === fn || current.includes(f))
        : current.filter((f) => f !== fn),
    );
    setMessage("");
  };

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        start.mutate();
      }}
    >
      <fieldset className={styles.fieldset} aria-labelledby={modelsTitle}>
        <legend id={modelsTitle} className={styles.legend}>
          Models
        </legend>
        {models.isPending && <p className={styles.muted}>Loading models…</p>}
        {models.isError && (
          <p className={styles.warning}>
            Could not load the model list ({models.error.message}). Check the API key.
          </p>
        )}
        <ul className={styles.modelList}>
          {(models.data ?? []).map((model) => {
            const { name } = model;
            const think = selected.get(name);
            return (
              <li key={name} className={styles.modelRow}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={selected.has(name)}
                    onChange={(event) => toggleModel(name, event.target.checked)}
                  />
                  {modelLabel(model)}
                </label>
                {think !== undefined && provider && (
                  <EffortSelect
                    provider={provider}
                    model={name}
                    think={think}
                    onChange={(value) =>
                      setSelected((current) => new Map(current).set(name, value))
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <fieldset className={styles.fieldset} aria-labelledby={functionsTitle}>
        <legend id={functionsTitle} className={styles.legend}>
          Functions
        </legend>
        {EvalFunctionId.options.map((fn) => (
          <label key={fn} className={styles.check}>
            <input
              type="checkbox"
              checked={functions.includes(fn)}
              onChange={(event) => toggleFunction(fn, event.target.checked)}
            />
            {functionLabel(fn)}
            {counts.data && <span className={styles.muted}>({counts.data[fn]} fixtures)</span>}
          </label>
        ))}
      </fieldset>

      <p className={styles.warning} data-testid="estimate">
        Uses {provider ? PROVIDER_LABEL[provider] : "provider"} credits: about {calls} LLM call
        {calls === 1 ? "" : "s"} (fixtures × functions × models; a JSON retry adds one).
      </p>
      <div className={styles.actions}>
        <button
          className={styles.primary}
          type="submit"
          disabled={selected.size === 0 || functions.length === 0 || start.isPending}
        >
          Run evaluation
        </button>
        <span role="status" className={styles.message}>
          {message}
        </span>
      </div>
    </form>
  );
}
