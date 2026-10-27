import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Panel.module.css";

export type PanelTone = "lime" | "plum" | "cream" | "plain";

export type PanelProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "div" | "article" | "aside" | "header" | "footer";
  /** Color block. `plain` = no fill, inherits the surrounding tone. */
  tone?: PanelTone;
  /** Breaks out of the content column to the viewport edges (content stays aligned). */
  bleed?: boolean;
  /** Inner padding: `none`, `md` (24px, default) or `lg` (48→64px). */
  padding?: "none" | "md" | "lg";
  /** 1px border in the tone's line color. */
  bordered?: boolean;
  children: ReactNode;
};

/**
 * A block of the editorial grid. The tone re-maps the color roles for everything inside
 * (text, muted text, lines, buttons, focus ring) through `data-tone`.
 */
export function Panel({
  as: Tag = "section",
  tone = "plain",
  bleed = false,
  padding = "md",
  bordered = false,
  className,
  children,
  ...rest
}: PanelProps) {
  const classes = [
    styles.panel,
    styles[`pad-${padding}`],
    bleed ? styles.bleed : null,
    bordered ? styles.bordered : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag {...rest} data-tone={tone === "plain" ? undefined : tone} className={classes}>
      {children}
    </Tag>
  );
}
