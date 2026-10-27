# Design system — English Course

The web app's visual language. It adapts **SONORUS / Matter & Frequency**
(`docs/SONORUS-Matter-Frequency-DESIGN.md` and its reference screenshots) to a learning app:
an editorial page of full-bleed color blocks, Gloock headlines, Commissioner body text,
square corners and 1px hairlines.

Where things live:

| What | Where |
|---|---|
| Tokens (colors, type, spacing, motion, layers) | `apps/web/src/app/tokens.css` |
| Reset, element baselines, utilities | `apps/web/src/app/global.css` |
| App shell (top bar, bottom tab bar, footer) | `apps/web/src/app/Layout.tsx`, `MainNav.tsx` |
| Shared components | `apps/web/src/shared/ui/` (import from `shared/ui/index.ts`) |

## 1. Rules of thumb

1. **Use tokens, never raw values.** Feature CSS reads semantic roles (`--color-text`,
   `--space-3`, `--text-h2`…). Raw ramp steps (`--rose-700`) only where this guide names them.
2. **Square.** `border-radius: 0` everywhere. Only circular icon buttons and dots use
   `--radius-pill`.
3. **Flat.** No shadows on the page. Overlays (drawer, sheet, toast, More menu) are the only
   elements with `--shadow-overlay`.
4. **Hairlines structure the page.** 1px lines (`--hairline`) separate blocks; 2px rules
   (`--rule`) mark the active item (nav, stepper).
5. **Color blocks carry emphasis**, not color text. Lime and rose are never text colors on
   cream.
6. **6px rhythm.** Spacing comes from `--space-1…7` only.
7. **Never color alone.** Every state has text (a badge label, a message) or an icon.

## 2. Color

### Palette and ramps

| Role | Base (500) | Ramp |
|---|---|---|
| Plum (primary) | `#381D2B` | `--plum-50…900` |
| Lime (secondary) | `#E9EDB0` | `--lime-50…900` (shades go olive) |
| Rose (tertiary) | `#BF938D` | `--rose-50…900` (shades go burgundy) |
| Taupe (neutral) | `#685A57` | `--taupe-50…900` |
| Cream (surface) | `#F3EFE5` | `--cream-50…900` |

50–400 are tints, 500 is the base, 600–900 are shades.

### Semantic roles

| Token | Default (page) | Use |
|---|---|---|
| `--color-bg` | cream-500 | Page background |
| `--color-surface` | cream-200 | Inputs, cards that need a lift, secondary buttons |
| `--color-surface-sunken` | cream-400 | Wells, code, quoted text |
| `--color-text` | plum-500 | Body text, headings, icons |
| `--color-text-muted` | taupe-500 | Secondary text, captions, inactive nav |
| `--color-line` | plum-500 | Control borders, structural hairlines |
| `--color-line-soft` | plum 18% | Dividers between list rows, table rows |
| `--color-accent` / `--color-on-accent` | plum / cream | Primary button, filled icon button, progress fill |
| `--color-highlight` | lime-500 | Highlighted words, selection, secondary-button hover |
| `--color-success-text` / `--color-error-text` | lime-900 / rose-800 | Inline success/error copy on the page |
| `--focus-ring-color` | plum-500 | Focus outline |

### Tones (color blocks)

Set `data-tone="lime" | "plum" | "cream"` on any element (or use `<Panel tone>`). The tone
paints the block and **re-maps every role above** for its subtree, so components inside stay
legible without extra CSS:

| Tone | Background | Text | Muted | Accent (primary button) | Focus ring |
|---|---|---|---|---|---|
| (page) | cream | plum | taupe | plum block, cream text | plum |
| `lime` | lime-500 | plum | plum-400 | plum block, lime text | plum |
| `plum` | plum-500 | cream | rose-500 | lime block, plum text | lime |
| `cream` | cream-200 | plum | taupe | plum block, cream text | plum |

Gotcha: role tokens resolve where they are used. Always reference `--color-*` directly in a
component; never copy them into another custom property on `:root` (it would freeze the page
value and ignore the tone).

### Which block for what

| Block | Use for | Avoid |
|---|---|---|
| **Lime** | The page's hero/intro (page header with the title and the main CTA), "today's" focus card, positive moments (session complete) | Long forms; more than one lime block per screen |
| **Plum** | The featured content of a page (the article being read, the current unit's story, a big stat), the tutor's voice, toasts | Forms and inputs (placeholder contrast fails); long body text over ~3 paragraphs |
| **Cream** (`tone="cream"`) | Cards inside the page: exercises, list items that need a frame, settings sections | Nesting cream inside cream more than once |
| **Plain** | Everything else: lists, tables, reading text | — |

Desktop composition (from the reference): two or three blocks side by side in a grid,
separated by 1px plum hairlines, full-bleed to the viewport edges. On phones the blocks stack.

### States

Derived from the ramps only. Use them for exercise feedback, grades and verdicts.

| State | bg | fg | line | Contrast fg/bg |
|---|---|---|---|---|
| Correct | `--state-correct-bg` lime-500 | `--state-correct-fg` lime-900 (olive) | `--state-correct-line` lime-800 | 6.55 |
| Almost | `--state-almost-bg` rose-100 | `--state-almost-fg` rose-800 | `--state-almost-line` rose-500 | 6.78 |
| Incorrect | `--state-incorrect-bg` rose-200 | `--state-incorrect-fg` rose-900 (burgundy) | `--state-incorrect-line` rose-800 | 8.49 |

- A feedback block: `background: var(--state-x-bg); color: var(--state-x-fg); border-left: 3px solid var(--state-x-line)` plus a `<Badge tone="x">` with the word ("Correct", "Almost", "Not quite").
- An answered input: keep the cream surface, set `border-color: var(--state-x-line)`; the
  global baseline already marks `aria-invalid="true"` with the incorrect line and a 3px inset.
- A gap/blank input inside a sentence: underline only — `border: 0; border-bottom: 2px solid var(--state-x-line)`.

### Contrast (WCAG 2.x, measured)

| Pair | Ratio | Text? |
|---|---|---|
| plum on cream | 13.26 | yes |
| plum on surface (cream-200) | 14.35 | yes |
| taupe on cream (muted) | 5.74 | yes |
| plum on lime | 12.48 | yes |
| plum-400 on lime (muted in lime) | 7.79 | yes |
| cream on plum | 13.26 | yes |
| rose on plum (muted in plum) | 5.64 | yes |
| lime on plum | 12.48 | yes |
| lime-900 on cream (success text) | 6.96 | yes |
| rose-800 on cream (error text) | 7.35 | yes |
| rose-300 on plum (error in plum) | 8.29 | yes |
| rose-700 on cream | 4.90 | yes (smallest safe rose for text on cream) |
| lime-800 on cream | 3.95 | lines/icons ≥ 3:1 only |
| rose on cream | 2.35 | **never text** (decoration only) |
| lime on cream | 1.06 | **never text**; lime is a block color |

## 3. Typography

Self-hosted (`@fontsource`, latin subset, `font-display: swap`, precached for offline):
**Gloock 400** (display) and **Commissioner 400/500/600** (body/UI). Do not import other weights.

| Token | Size (mobile → desktop) | Font | Line height | Tracking | Use |
|---|---|---|---|---|---|
| `--text-display` | 48 → 88px | Gloock | 1.0 | −0.055em | One per page at most: hero words ("Born to wander.") |
| `--text-h1` | 36 → 56px | Gloock | 1.02 | −0.045em | Page title (`<h1>` default) |
| `--text-h2` | 28 → 40px | Gloock | 1.1 | −0.03em | Section titles (`<h2>` default) |
| `--text-h3` | 20 → 24px | Gloock | 1.1 | −0.015em | Card titles (`<h3>` default) |
| `--text-lead` | 18px | Commissioner | 1.6 | 0 | Intros, the reading text |
| `--text-body` | 16px | Commissioner | 1.6 | 0 | Body, UI |
| `--text-small` | 14px | Commissioner | 1.45 | 0 | Captions, hints, nav |
| `--text-eyebrow` | 12px | Commissioner 500, UPPERCASE | 1.4 | 0.16em | Eyebrows, table headers |

- Headings `h1–h4` are already Gloock in `global.css`; just size them with the tokens when the
  default level does not fit.
- Display text: `font-family: var(--font-display); font-size: var(--text-display);
  line-height: var(--leading-display); letter-spacing: var(--tracking-display);`.
- Numbers that matter (unit numbers "01", scores, counts) use `.numeral` (Gloock, tabular).
- Weights: 400 body, 500 labels/buttons/eyebrows, 600 strong. Never bold Gloock.
- Reading measure: `max-width: var(--measure)` (40rem) for long text.

## 4. Space, layout and shape

- Spacing: `--space-1` 6 · `--space-2` 12 · `--space-3` 18 · `--space-4` 24 · `--space-5` 32 ·
  `--space-6` 48 · `--space-7` 64.
- Gaps: inside a card `--space-2…3`; between cards `--space-4`; between page sections
  `--space-6` (mobile) / `--space-7` (desktop). Panel padding: `md` 24px, `lg` 48 → 64px.
- Shell: content column `max-width: var(--content-max)` (75rem) with `--gutter`
  (18 → 48px) on each side. The `<main>` already applies both.
- Full bleed: `<Panel bleed>` (or the same CSS: `margin-inline: calc(50% - 50vw);
  padding-inline: max(var(--gutter), calc(50vw - 50%))`). Only on **direct children of the
  page column** — inside a grid cell it breaks.
- Shape: `--radius` 0; `--hairline` 1px; `--rule` 2px; `--tap-target` 44px.
- Breakpoint: one, at **768px**. Write `@media (max-width: 767.98px)` for phone rules and
  `@media (min-width: 768px)` for desktop rules (custom properties cannot be used in media
  queries).

### Page header recipe

```tsx
<Panel tone="lime" bleed padding="lg" as="header">
  <Eyebrow rule>Unit 04 · Present perfect</Eyebrow>
  <h1>Things that just happened</h1>
  <p className={styles.lead}>Short intro, max two lines, var(--text-lead).</p>
  <Button to="…" arrow>Start the story</Button>
</Panel>
```

Smaller pages (settings, history) skip the color block: `<Eyebrow rule>` + `<h1>` + muted lead,
then a hairline (`border-bottom: var(--hairline) solid var(--color-line)`) before the content.

### Two-block hero (desktop) recipe

A grid of two panels, side by side ≥768px, stacked below:

```css
.hero { display: grid; margin-inline: calc(50% - 50vw); border-bottom: var(--hairline) solid var(--color-line); }
@media (min-width: 768px) { .hero { grid-template-columns: 5fr 7fr; } }
```

Children: `<Panel tone="lime" padding="lg">` (eyebrow, display/h1, lead, CTA, a big
`.numeral` at the bottom) and `<Panel tone="plum" padding="lg">` (eyebrow + live status, the
featured content, a `Stat` row and a `ProgressLine`).

## 5. Components (`apps/web/src/shared/ui`)

| Component | Props | Rules |
|---|---|---|
| `Button` | `variant` `primary`\|`secondary`\|`ghost` · `size` `sm`\|`md`\|`lg` · `arrow` · `fullWidth` `true`\|`"mobile"` · `to` (router Link) · `href` (`<a>`) · button attrs | **Defaults to `type="button"`**: pass `type="submit"` in forms. One primary per view area; `arrow` on forward actions only. `buttonClassName({variant,size,fullWidth})` styles elements that cannot be a `Button` (e.g. a `NavLink`). |
| `IconButton` | `label` (required, accessible name) · `size` `md` 44px \| `sm` 36px (44px hit area) · `filled` · button attrs | Circular 1px outline; icon from `icons.tsx`. Close, play/pause, reset, audio. |
| `Eyebrow` | `as` `p`\|`span`\|`div`\|`h2`\|`h3` · `rule` (leading line) · `muted` | Above every page title and section title. Short (2–5 words). |
| `Panel` | `tone` `lime`\|`plum`\|`cream`\|`plain` · `bleed` · `padding` `none`\|`md`\|`lg` · `bordered` · `as` | The block of the grid. See "Which block for what". |
| `Stepper` | `label` (nav name) · `steps: {id,title,subtitle?,to?,disabled?,done?}[]` · `current` · `onSelect?` | Numbered "01 Story / subtitle", filled dot + top rule on the active step, `aria-current="step"`, scrolls horizontally on phones. Use for the unit flow and the reading flow (keep their nav labels "Unit steps" / "Reading steps"). |
| `StatusDot` | `filled` · `tone` `current`\|`correct`\|`almost`\|`incorrect` · `pulse` · `label?` | Decorative unless `label` is given. "● In motion" style status lines. |
| `Stat` | `label` · `value` · `unit?` · `size` `md`\|`lg` · `stacked` | "Breeze 34": muted label + Gloock number. |
| `ProgressLine` | `value` 0–100 · `label` (accessible name) · `showValue` | 1px track, 3px fill, percentage at the right. `role="progressbar"`. |
| `Field` | `label` · `hint?` · `error?` · `id?` · `hideLabel?` · `children` (node or `(control) => node`) | Wraps every input/select/textarea. With a function child, spread `control` on the control to get `id`, `aria-describedby`, `aria-invalid`. Controls inside are full width. |
| `Badge` | `tone` `neutral`\|`correct`\|`almost`\|`incorrect`\|`accent` | Square, uppercase 12px. Always with a word. |
| `Sparkline` | `values` · `label` · `width` · `height` | 1.5px line in the tone's text color. |
| `overlayStyles` | `.backdrop` `.drawer` `.sheet` `.header` `.title` `.toast` | CSS module of the overlay pattern. Use via `composes: drawer from "../../shared/ui/Overlay.module.css";` or `className={overlayStyles.sheet}`. Put `data-tone="plum"` on a toast. |
| Icons | `ArrowRightIcon` `ArrowLeftIcon` `CloseIcon` `CheckIcon` `PlusIcon` `MoreIcon` + nav icons · `size` | 24×24, 1.5px stroke, `currentColor`, `aria-hidden`. |

### Form controls

`global.css` gives every `input`/`select`/`textarea` the baseline: square, 1px `--color-line`,
`--color-surface` background, 12×18px padding, 44px min height, 2px focus outline,
`aria-invalid` styling. Width is `auto` unless inside `Field` (or your own CSS). Prefer `Field`
over hand-written label/control pairs; keep existing ids that tests or labels rely on.

Exercise choices (radio-like options): square tiles, `border: var(--hairline) solid var(--color-line-soft)`;
selected = `border-color: var(--color-line)` + `background: var(--color-highlight)`; checked
answers use the state tokens.

## 6. App shell

- **Desktop (≥768px):** sticky cream top bar, Gloock wordmark left, nav links right (14px,
  500, muted → plum, 2px rule under the active link on the bar's hairline).
- **Phones (<768px):** the top bar only shows the wordmark (not sticky); navigation is a fixed
  **bottom tab bar**: Today, Units, Reading, Vocabulary, Writing, More. "More" opens a menu with
  Progress, Tutor, Settings (Escape and outside clicks close it). Active tab: plum text + 2px
  rule on top.
- **Footer:** hairline + uppercase tracked tagline and the server health line.
- **Bottom offset:** on phones `--shell-bottom` = tab bar height + safe area (0 on desktop).
  Anything fixed or sticky at the bottom (session bar, floating buttons, sheets' own content)
  must add it: `bottom: calc(var(--shell-bottom) + var(--space-3))`. Sheets and drawers sit
  above the tab bar (`--z-sheet` > `--z-tabbar`) and may cover it.
- **Floating buttons:** all share the bottom-right corner and `--fab-size` (52px). The tutor
  button sits at `--fab-bottom`; any page-level floating button (e.g. "I don't get it") stacks
  above it at `--fab-stack`. `main` reserves `--fab-size` of bottom padding so they never cover
  the last content.
- **Layers:** `--z-sticky` 10 · `--z-fab` 15 · `--z-tabbar` 18 · `--z-sheet` 20 ·
  `--z-drawer` 30 · `--z-toast` 40 · `--z-overlay` 50 (full-screen takeovers).

## 7. Mobile rules

- Blocks stack in source order; put the primary action in the first block.
- Touch targets ≥ 44px (`--tap-target`); buttons in a row wrap, primary action can be
  `fullWidth="mobile"`.
- Steppers and wide tables scroll horizontally inside their own box; the page never scrolls
  sideways.
- Respect safe areas: `env(safe-area-inset-*)` on anything touching the screen edges.

## 8. Motion

- `--dur-ui` 300ms for hovers, toggles, color changes; `--dur-reveal` 500ms for entering
  panels, sheets, active rules. Easing `--ease-out` (`cubic-bezier(0.22, 1, 0.36, 1)`).
- Move little (≤ 24px), fade in, never bounce. CSS only, no animation libraries.
- `prefers-reduced-motion: reduce` sets both durations to 0ms, so **always use the tokens**
  for `transition`/`animation` durations; a hard-coded duration will not be reduced.

## 9. Do / Don't

**Do**
- Start each page with an eyebrow + Gloock title.
- Use one lime block per screen for "what to do now", plum for the featured content.
- Separate list rows and sections with 1px hairlines instead of cards with shadows.
- Show numbers big in Gloock (`.numeral`, `Stat`).
- Reuse the shared components before writing a new button/badge/stepper style.

**Don't**
- Round corners, add drop shadows to cards, or use gradients.
- Put rose or lime text on cream, or use color alone to signal a state.
- Introduce colors outside the ramps or new font weights.
- Use `--color-primary`, `--color-muted`, `--color-border`, `--color-ok`, `--color-down`,
  `--color-warn`, `--color-on-primary`, `--color-focus` in new code: they are **legacy aliases**
  kept only until every feature is restyled, then they will be removed.
- Put forms inside plum blocks.
