import { type ReactNode, useEffect, useRef } from "react";
import { Link, type To } from "react-router";
import styles from "./Stepper.module.css";

export type StepperStep = {
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Navigate with a router link instead of calling `onSelect`. */
  to?: To;
  disabled?: boolean;
  /** Completed step: a check-like filled dot and "(done)" for assistive tech. */
  done?: boolean;
};

export type StepperProps = {
  /** Accessible name of the step navigation, e.g. "Unit steps". */
  label: string;
  steps: readonly StepperStep[];
  /** Id of the active step (gets `aria-current="step"`). */
  current: string;
  onSelect?: (id: string) => void;
  className?: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Numbered horizontal steps ("01 Story / The familiar shape"): filled dot and top rule on the
 * active item, outline dot otherwise. Scrolls horizontally on narrow screens.
 */
export function Stepper({ label, steps, current, onSelect, className }: StepperProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const activeIndex = steps.findIndex((step) => step.id === current);

  // Keep the active step visible inside the horizontal scroller (never scrolls the page).
  useEffect(() => {
    const list = listRef.current;
    const active = list?.children[activeIndex];
    if (!list || !(active instanceof HTMLElement)) return;
    // The list is the items' offset parent (position: relative).
    const start = active.offsetLeft;
    const end = start + active.offsetWidth;
    if (start < list.scrollLeft || end > list.scrollLeft + list.clientWidth) {
      list.scrollLeft = Math.max(0, start - 18);
    }
  }, [activeIndex]);

  return (
    <nav
      aria-label={label}
      className={className ? `${styles.stepper} ${className}` : styles.stepper}
    >
      <ol ref={listRef} className={styles.list}>
        {steps.map((step, index) => {
          const active = step.id === current;
          const content = (
            <>
              <span className={styles.index}>{pad(index + 1)}</span>
              <span className={styles.text}>
                <span className={styles.title}>{step.title}</span>
                {step.subtitle ? <span className={styles.subtitle}>{step.subtitle}</span> : null}
              </span>
              <span className={styles.dot} aria-hidden="true" />
              {step.done ? <span className="visually-hidden"> (done)</span> : null}
            </>
          );
          return (
            <li
              key={step.id}
              className={styles.item}
              data-active={active || undefined}
              data-done={step.done || undefined}
            >
              {step.to !== undefined && !step.disabled ? (
                <Link
                  to={step.to}
                  className={styles.control}
                  aria-current={active ? "step" : undefined}
                  onClick={onSelect ? () => onSelect(step.id) : undefined}
                >
                  {content}
                </Link>
              ) : (
                <button
                  type="button"
                  className={styles.control}
                  aria-current={active ? "step" : undefined}
                  disabled={step.disabled}
                  onClick={() => onSelect?.(step.id)}
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
