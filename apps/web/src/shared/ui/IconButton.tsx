import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./IconButton.module.css";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** Accessible name (required: the button shows only an icon). */
  label: string;
  /** The icon, e.g. `<CloseIcon />`. */
  children: ReactNode;
  /** `md` = 44px (default), `sm` = 36px visual inside a 44px target. */
  size?: "sm" | "md";
  /** Filled with the accent color instead of an outline. */
  filled?: boolean;
};

/** Circular outlined icon button with a ≥44px touch target. */
export function IconButton({
  label,
  children,
  size = "md",
  filled = false,
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  const classes = [styles.iconButton, styles[size], filled ? styles.filled : null, className]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      title={rest.title ?? label}
      className={classes}
    >
      {children}
    </button>
  );
}
