import { type ComponentType, useEffect, useId, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router";
import {
  type IconProps,
  MoreIcon,
  ProgressIcon,
  ReadingIcon,
  SettingsIcon,
  TodayIcon,
  TutorIcon,
  UnitsIcon,
  VocabularyIcon,
  WritingIcon,
} from "../shared/ui/icons.tsx";
import styles from "./MainNav.module.css";

type Destination = { to: string; label: string; icon: ComponentType<IconProps>; end?: boolean };

/** Always in the mobile tab bar. */
const PRIMARY: Destination[] = [
  { to: "/", label: "Today", icon: TodayIcon, end: true },
  { to: "/units", label: "Units", icon: UnitsIcon },
  { to: "/reading", label: "Reading", icon: ReadingIcon },
  { to: "/vocabulary", label: "Vocabulary", icon: VocabularyIcon },
  { to: "/writing", label: "Writing", icon: WritingIcon },
];

/** Inline on desktop; behind "More" on mobile. */
const SECONDARY: Destination[] = [
  { to: "/progress", label: "Progress", icon: ProgressIcon },
  { to: "/tutor", label: "Tutor", icon: TutorIcon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

function Item({ to, label, icon: Icon, end }: Destination) {
  return (
    <li className={styles.item}>
      <NavLink to={to} end={end} className={styles.link}>
        <Icon className={styles.icon} size={22} />
        <span className={styles.label}>{label}</span>
      </NavLink>
    </li>
  );
}

/**
 * The app's main navigation, one set of links for every screen size: a row of links in the
 * desktop top bar; a fixed bottom tab bar on phones, where Progress/Tutor/Settings move into
 * the "More" menu.
 */
export function MainNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const inMore = SECONDARY.some(({ to }) => pathname === to || pathname.startsWith(`${to}/`));

  // Any navigation closes the menu.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on route changes only.
  useEffect(() => setMoreOpen(false), [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMoreOpen(false);
        moreButton.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [moreOpen]);

  return (
    <nav aria-label="Main" className={styles.nav} ref={navRef}>
      <ul className={styles.list}>
        {PRIMARY.map((destination) => (
          <Item key={destination.to} {...destination} />
        ))}
        <li className={styles.moreItem}>
          <button
            ref={moreButton}
            type="button"
            className={styles.moreButton}
            aria-expanded={moreOpen}
            aria-controls={menuId}
            data-active={inMore || undefined}
            onClick={() => setMoreOpen((open) => !open)}
          >
            <MoreIcon className={styles.icon} size={22} />
            <span className={styles.label}>More</span>
          </button>
        </li>
        <li className={styles.secondary} data-open={moreOpen || undefined}>
          <ul id={menuId} className={styles.secondaryList}>
            {SECONDARY.map((destination) => (
              <Item key={destination.to} {...destination} />
            ))}
          </ul>
        </li>
      </ul>
    </nav>
  );
}
