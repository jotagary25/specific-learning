import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import styles from "./Button.module.css";
import { ArrowRightIcon } from "./icons.tsx";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

type ButtonLook = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full width always (`true`) or only below 768px (`"mobile"`). */
  fullWidth?: boolean | "mobile";
  className?: string;
};

type CommonProps = ButtonLook & {
  /** Trailing circled arrow, for forward actions ("Start", "Continue"). */
  arrow?: boolean;
  children: ReactNode;
};

type AsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & {
    to?: undefined;
    href?: undefined;
  };
type AsRouterLink = CommonProps & Omit<LinkProps, keyof CommonProps> & { href?: undefined };
type AsAnchor = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps> & {
    href: string;
    to?: undefined;
  };

export type ButtonProps = AsButton | AsRouterLink | AsAnchor;

/** Class names of the button look, for elements that cannot be a <Button> (e.g. a NavLink). */
export function buttonClassName({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: ButtonLook = {}): string {
  return [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth === true ? styles.full : null,
    fullWidth === "mobile" ? styles.fullMobile : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

function Content({ arrow, children }: { arrow?: boolean; children: ReactNode }) {
  return (
    <>
      <span className={styles.label}>{children}</span>
      {arrow ? (
        <span className={styles.arrow} aria-hidden="true">
          <ArrowRightIcon size={18} />
        </span>
      ) : null}
    </>
  );
}

/**
 * The app's action. Renders a <button> (default `type="button"`), a router <Link> when `to`
 * is given, or an <a> when `href` is given.
 */
export function Button(props: ButtonProps) {
  const { variant, size, fullWidth, className, arrow, children, ...rest } = props;
  const look = buttonClassName({ variant, size, fullWidth, className });
  const withArrow = arrow ? `${look} ${styles.withArrow}` : look;

  if ("to" in rest && rest.to !== undefined) {
    return (
      <Link {...(rest as LinkProps)} className={withArrow}>
        <Content arrow={arrow}>{children}</Content>
      </Link>
    );
  }
  if ("href" in rest && rest.href !== undefined) {
    return (
      <a {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)} className={withArrow}>
        <Content arrow={arrow}>{children}</Content>
      </a>
    );
  }
  const { type = "button", ...buttonRest } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button {...buttonRest} type={type} className={withArrow}>
      <Content arrow={arrow}>{children}</Content>
    </button>
  );
}
