---
version: "alpha"
name: "SONORUS / Matter & Frequency"
description: "Sonorus Matter Content Section is designed for structuring a full-width content block for modern web pages. Key features include reusable structure, responsive behavior, and production-ready presentation. It is suitable for component libraries and responsive product interfaces."
colors:
  primary: "#381D2B"
  secondary: "#E9EDB0"
  tertiary: "#BF938D"
  neutral: "#685A57"
  background: "#381D2B"
  surface: "#F3EFE5"
  text-primary: "#381D2B"
  text-secondary: "#685A57"
  border: "#381D2B"
  accent: "#381D2B"
typography:
  display-lg:
    fontFamily: "Gloock"
    fontSize: "93.536px"
    fontWeight: 400
    lineHeight: "94.0037px"
    letterSpacing: "-0.055em"
  body-md:
    fontFamily: "Commissioner"
    fontSize: "16px"
    fontWeight: 400
rounded:
  md: "0px"
spacing:
  base: "6px"
  sm: "1px"
  md: "6px"
  lg: "7px"
  xl: "10px"
  gap: "9px"
  card-padding: "14px"
  section-padding: "25px"
components:
  button-primary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "15px"
  button-link:
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "15px"
---

## Overview

- **Composition cues:**
  - Layout: Grid
  - Content Width: Full Bleed
  - Framing: Open
  - Grid: Strong

## Colors

The color system uses light mode with #381D2B as the main accent and #685A57 as the neutral foundation.

- **Primary (#381D2B):** Main accent and emphasis color.
- **Secondary (#E9EDB0):** Supporting accent for secondary emphasis.
- **Tertiary (#BF938D):** Reserved accent for supporting contrast moments.
- **Neutral (#685A57):** Neutral foundation for backgrounds, surfaces, and supporting chrome.

- **Usage:** Background: #381D2B; Surface: #F3EFE5; Text Primary: #381D2B; Text Secondary: #685A57; Border: #381D2B; Accent: #381D2B

## Typography

Typography pairs Gloock for display hierarchy with Commissioner for supporting content and interface copy.

- **Display (`display-lg`):** Gloock, 93.536px, weight 400, line-height 94.0037px, letter-spacing -0.055em.
- **Body (`body-md`):** Commissioner, 16px, weight 400.

## Layout

Layout follows a grid composition with reusable spacing tokens. Preserve the grid, full bleed structural frame before changing ornament or component styling. Use 6px as the base rhythm and let larger gaps step up from that cadence instead of introducing unrelated spacing values.

Treat the page as a grid / full bleed composition, and keep that framing stable when adding or remixing sections.

- **Layout type:** Grid
- **Content width:** Full Bleed
- **Base unit:** 6px
- **Scale:** 1px, 6px, 7px, 10px, 12px, 13px, 15px, 18px
- **Section padding:** 25px, 32px, 36.5px
- **Card padding:** 14px, 15px
- **Gaps:** 9px, 12px, 14px, 20px

## Elevation & Depth

Depth is communicated through elevated, border contrast, and reusable shadow or blur treatments. Keep those recipes consistent across hero panels, cards, and controls so the page reads as one material system.

Surfaces should read as elevated first, with borders, shadows, and blur only reinforcing that material choice.

- **Surface style:** Elevated
- **Borders:** 1px #381D2B; 1px #F3EFE5; 1px #E9EDB0
- **Shadows:** rgba(233, 237, 176, 0.25) 0px 0px 9px 0px; rgba(19, 9, 14, 0.333) 0px 25px 100px 0px

### Techniques
- **Gradient border shell:** Use a thin gradient border shell around the main card. Wrap the surface in an outer shell with 0px padding and a 0px radius. Drive the shell with none so the edge reads like premium depth instead of a flat stroke. Keep the actual stroke understated so the gradient shell remains the hero edge treatment. Inset the real content surface inside the wrapper with a slightly smaller radius so the gradient only appears as a hairline frame.

## Components

Anchor interactions to the detected button styles.

### Buttons
- **Primary:** background #F3EFE5, text #381D2B, radius 0px, padding 15px, border 0px none rgb(56, 29, 43).
- **Links:** text #381D2B, radius 0px, padding 15px, border 0px none rgb(56, 29, 43).

## Do's and Don'ts

Use these constraints to keep future generations aligned with the current system instead of drifting into adjacent styles.

### Do
- Do use the primary palette as the main accent for emphasis and action states.
- Do keep spacing aligned to the detected 6px rhythm.
- Do reuse the Elevated surface treatment consistently across cards and controls.

### Don't
- Don't introduce extra accent colors outside the core palette roles unless the page needs a new semantic state.
- Don't mix unrelated shadow or blur recipes that break the current depth system.
- Don't exceed the detected moderate motion intensity without a deliberate reason.

## Motion

Motion feels controlled and interface-led across text, layout, and section transitions. Timing clusters around 300ms and 1100ms. Easing favors ease and cubic-bezier(0.22. Scroll choreography uses Framer Motion for section reveals and pacing.

**Motion Level:** moderate

**Durations:** 300ms, 1100ms, 350ms, 500ms

**Easings:** ease, cubic-bezier(0.22, 1, 0.36, 1)

**Scroll Patterns:** framer-motion
