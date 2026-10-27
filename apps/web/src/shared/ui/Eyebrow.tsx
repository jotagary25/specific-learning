import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Eyebrow.module.css";

export type EyebrowProps = HTMLAttributes<HTMLElement> & {
  as?: "p" | "span" | "div" | "h2" | "h3";
  /** Leading hairline rule ("—— A STUDY IN LETTING GO"). */
  rule?: boolean;
  /** Muted color instead of the text color. */
  muted?: boolean;
  children: ReactNode;
};

/** Small uppercase tracked label that introduces a heading or a block. */
export function Eyebrow({
  as: Tag = "p",
  rule = false,
  muted = false,
  className,
  children,
  ...rest
}: EyebrowProps) {
  const classes = [
    "eyebrow",
    styles.eyebrow,
    rule ? styles.rule : null,
    muted ? styles.muted : null,
  ]
    .concat(className ?? [])
    .filter(Boolean)
    .join(" ");
  return (
    <Tag {...rest} className={classes}>
      {children}
    </Tag>
  );
}
