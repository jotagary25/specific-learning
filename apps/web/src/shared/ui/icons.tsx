import type { ReactNode, SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  /** Rendered size in px (square). */
  size?: number;
};

/** Thin-line 24×24 icon frame: 1.5px stroke in `currentColor`, hidden from assistive tech. */
function Icon({ size = 24, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const ArrowRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const ArrowLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const PlusIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const MoreIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="5.5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="18.5" cy="12" r="1" />
  </Icon>
);

/** Today: a rising sun over the horizon. */
export const TodayIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 17h18M7 17a5 5 0 0 1 10 0M12 5v3M5.2 9.2l2 2M18.8 9.2l-2 2" />
  </Icon>
);

/** Units: a stack of square cards. */
export const UnitsIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="4" y="8" width="12" height="12" />
    <path d="M8 4h12v12" />
  </Icon>
);

/** Reading: an open book. */
export const ReadingIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5v13" />
  </Icon>
);

/** Vocabulary: a word card with lines. */
export const VocabularyIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3.5" y="5" width="17" height="14" />
    <path d="M7 10h6M7 14h10" />
  </Icon>
);

/** Writing: a nib drawing a line. */
export const WritingIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15 4.5l4.5 4.5L9 19.5H4.5V15zM12.5 7l4.5 4.5M4 21h16" />
  </Icon>
);

/** Progress: a rising line. */
export const ProgressIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3.5 19.5h17M5 15l4.5-4.5 3.5 3 6-6.5M15 7h4v4" />
  </Icon>
);

/** Tutor: a speech bubble. */
export const TutorIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 5h16v11h-9l-4.5 3.5V16H4z" />
  </Icon>
);

/** Settings: sliders. */
export const SettingsIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </Icon>
);
