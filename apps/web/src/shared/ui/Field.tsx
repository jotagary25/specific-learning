import { type ReactNode, useId } from "react";
import styles from "./Field.module.css";

/** Props to spread on the control so it is labelled and described. */
export type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

export type FieldProps = {
  label: ReactNode;
  /** Help text under the control. */
  hint?: ReactNode;
  /** Error message; marks the control invalid. */
  error?: ReactNode;
  /** Control id; generated when omitted. */
  id?: string;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  className?: string;
  /** The control. A function receives the id/aria props to spread; a node must use `id`. */
  children: ReactNode | ((control: FieldControlProps) => ReactNode);
};

/** Label + control + hint/error, stacked. Controls inside take the full width. */
export function Field({ label, hint, error, id, hideLabel, className, children }: FieldProps) {
  const generated = useId();
  const controlId = id ?? generated;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control: FieldControlProps = {
    id: controlId,
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
    ...(error ? { "aria-invalid": true as const } : {}),
  };
  return (
    <div className={className ? `${styles.field} ${className}` : styles.field}>
      <label htmlFor={controlId} className={hideLabel ? "visually-hidden" : styles.label}>
        {label}
      </label>
      {typeof children === "function" ? children(control) : children}
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
