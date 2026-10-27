# Feature: sonorus-redesign

Objective: restyle the whole web app (PWA, mobile + desktop) with the SONORUS / Matter & Frequency design language, adapted to an editorial learning app.
Branch: `feat/sonorus-redesign` (from `feat/multi-user-providers` @ `247713d`) · Delivery: `exception-ok` (no remote) · Runner: `pnpm -r typecheck`, `pnpm -r test`, `pnpm lint`, browser check (in-app browser, mobile 375×812 + desktop).

## Specs

- **S1 — Apply the design.** User: "no, mejor aplicalo, lo que consideres que es necesario ajustar, ajustalo, sea para movil, web, con la tematica, etc. confiare en tí esta vez."
  Sources: `docs/SONORUS-Matter-Frequency-DESIGN.md` + the reference screenshots (see Log L2) — the screenshots win where they contradict the MD.
- **S2 — Design language (derived, see Log L3):**
  - Palette: plum `#381D2B` (primary), lime `#E9EDB0` (secondary), rose `#BF938D` (tertiary), taupe `#685A57` (neutral), cream `#F3EFE5` (surface); tonal ramps per color; semantic states derived from the ramps only (correct = olive from the lime ramp, almost = rose mid, incorrect = deep rose/burgundy).
  - Contrast rules (WCAG, measured): plum on cream 13.3, taupe on cream 5.7, lime on plum 12.5, rose on plum 5.6 → OK for text; rose on cream 2.35 and lime on cream 1.06 → never for text.
  - Typography: Gloock (display, section titles, big numerals) + Commissioner (body, UI); small uppercase tracked eyebrows (optionally with a leading rule). Self-hosted fonts (offline PWA).
  - Shape: square corners (radius 0); circular icon buttons with 1px border; 1px hairline dividers; strong grid with full-bleed color blocks; mostly flat — shadows only for overlays (tutor drawer, toasts, sheets).
  - Spacing: 6px base rhythm with generous steps (6/12/18/24/32/48/64).
  - Buttons: primary = plum block, cream text, circled arrow at the right; secondary = cream block, plum text; link/ghost; icon = circle outline.
  - Stepper/tabs: numbered items ("01 Story") with title + subtitle, dot (filled active / outline inactive) and a top rule on the active item — used for the unit flow and other step flows.
  - Motion: moderate, CSS only (no new animation libraries): 300ms UI, 500ms section reveals, easing `cubic-bezier(0.22, 1, 0.36, 1)`; respect `prefers-reduced-motion`.
  - Mobile: color-block panels stack; navigation becomes a bottom tab bar; steppers scroll horizontally; touch targets ≥ 44px.
- **S3 — No behavior changes.** Visual/structural only; every existing test keeps passing (update selectors only when markup must change, never weaken assertions); accessibility (labels, focus visible, contrast) must not regress.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1, S2, S3 | delegated writer (context backstop): tokens, fonts, global styles, app shell (desktop top bar + mobile bottom tab bar), shared UI primitives, `docs/design-system.md` | [x] | 014f5ac |
| T2 | S1–S3 | parallel writer A: `features/today`, `features/units` | [ ] | |
| T3 | S1–S3 | parallel writer B: `features/reading`, `features/vocabulary`, `features/writing` | [ ] | |
| T4 | S1–S3 | parallel writer C: `features/progress`, `features/tutor`, `features/settings`, `features/auth`, `features/eval`, `features/home`, `shared/pwa` | [ ] | |
| T5 | S1–S3 | parent: browser check mobile + desktop, fix findings | [ ] | |

Risk: none of the high-risk items (UI only). Writer reason for T2–T4: parallel independent units with disjoint edit surfaces.

## Log

- L1 (user): "listo, ahora quiero cambiar el diseño, descargue un diseño en MD en la carpeta @english-course/docs creo que se llama sonorus, revisalo y dime si lo comprendes lo suficinete para aplicarlo." → then screenshots; then "no, mejor aplicalo, lo que consideres que es necesario ajustar, ajustalo, sea para movil, web, con la tematica, etc. confiare en tí esta vez."
- L2 (reference screenshots, session scratch): `/tmp/claude-1000/-home-grizzly-development-personal-learning/3c0d8eec-b0eb-4e90-bf76-943b7ba1cc3d/images/1.webp` (full page + typography + palette ramps + overview + buttons), `2.png` (icons, spacing, elevation), `3.png` (shapes, do/don't, motion).
- L3 (analysis): the page is a full-bleed grid of color blocks (lime panel with plum text, plum panel with cream/rose text, cream header/footer bands) separated by 1px hairlines; primary CTA = plum rectangle + circled arrow; secondary = cream; icon buttons = outlined circles; numbered bottom tabs "01 Gather / The familiar shape" with dot + active top rule; eyebrows uppercase tracked with leading rule; Gloock numerals ("01"); flat editorial surfaces; the "18px radius" and "elevated" samples belong to the extraction tool UI, not the page; MD spacing values are noisy (normalize to 6px multiples); MD background/text contradiction resolved by the color-block layout.
- L4: user's own edit to `.env.example` is uncommitted and not read by the agent (`.env*` access is blocked); left untouched.

- L5 (T1 evidence): tokens.css (10-step ramps, roles, `data-tone` lime/plum/cream remapping, state colors, 6px spacing, clamp type scale, motion, focus), self-hosted Gloock 400 + Commissioner 400/500/600 precached (woff2 globPatterns), global.css, 9 primitives in shared/ui (Button, IconButton, Eyebrow, Panel, Stepper, StatusDot, Stat, ProgressLine, Badge, Field + overlay styles + icons), shell with desktop top bar + mobile bottom tab bar + More menu, recolored PWA icons, docs/design-system.md. Web tests 132, typecheck/lint/build green. Notes for T2–T4: fixed-bottom elements add `var(--shell-bottom)`; overlays compose `shared/ui/Overlay.module.css`; old variable aliases removed after T4; light-only.

## Next step

T2–T4 in parallel.
