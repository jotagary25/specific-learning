# English Course — Product Spec

A self-hosted, mobile-installable (PWA) web app that turns a grammar book, daily real articles, and AI feedback into a personal English course. It is designed around the learner profile in [`learning-methodology.md`](./learning-methodology.md). The MVP ships **all features** with **initial content limited to book units 1–6** (Present and Past).

> Read the methodology first. Every feature below exists to address one specific learner trait.

## Quick path (for implementers)

1. Section 1: goals and constraints.
2. Section 3: feature behavior and acceptance criteria.
3. Section 4: AI functions catalog.
4. Sections 5–9: architecture, data model, Ollama, deployment, content source.

---

## 1. Goals, non-goals, user

| Goals | Non-goals (MVP) |
|-------|-----------------|
| Progress through book units with auto-checked exercises | Multi-user, auth providers, social features |
| Read one current, annotated article per day, actively | Speaking/pronunciation practice |
| Write brand-ready posts with AI hints and natural rewrites | Units 7–142 content (the importer must support them, but only 1–6 are loaded) |
| Spaced review of vocabulary and own errors | Native mobile apps (a PWA is enough) |
| Make progress visible (timeline, monthly mirror) | Streaks, points, leaderboards |
| A 25-min daily session that decides what to do | Rewriting or simplifying third-party articles |

**User:** one learner (Spanish native, B1-ish, basic–intermediate English, strong receptive and weak grammar/writing). Self-hosted. Access is protected by a single app password (env-configured). The UI is in **English**; explanations from AI are in **Spanish** unless stated otherwise.

**Learner goals:** read current books and articles in English, and write posts in American English about tech, science, news, and books for a personal brand.

---

## 2. Learner-trait → feature map

| Trait | Feature |
|-------|---------|
| Low consistency, all-or-nothing | Today session engine: 25-min plan, auto-end, 5-min minimum, parking list |
| Confusion → escape to news | "I don't get it" button everywhere; tutor agent |
| News craving | Daily article in English on tech/science/geopolitics |
| Curiosity + narrative | Serial story per block; puzzle before rule |
| Grammar is the main weakness | Book units as the progression backbone |
| Felt competence motivates | Progress timeline, monthly mirror, can-do log |
| Learns by doing | Exercises, retell, posts, timeline drag |

---

## 3. Features

### 3.1 Today (session engine)

The home screen. It tells the learner exactly what to do now.

**Behavior**
- Builds a **session plan** of about 25 minutes from the available items, in this priority order:
  1. Due SRS reviews (capped at ~5 min).
  2. Today's article flow (if not done).
  3. Current unit (next step: puzzle, theory, or exercises). Units raised by writing errors come first.
  4. Writing mission (if the weekly post is due, or drafts are pending).
  5. Yesterday's article recall (2 min), if pending.
- Each item has an estimated duration. The plan fits into the session budget.
- **Session modes:** `standard` (25 min, configurable 15–40) and `minimum` (5 min: SRS reviews or one exercise set). Shown as "Only 5 minutes today".
- **Auto-end:** a visible countdown. At zero the session ends, current progress is saved, and a cliffhanger teaser (next story chapter or next article hook) is shown. The learner may press "Keep going (bonus)" once. Bonus time is logged separately.
- **Parking list:** a quick-add field ("something caught my interest") that stores a one-line note. Parked items are shown on weekends and after 18:00, never during the session.
- **Slump block:** after 13:00 the screen suggests a "10-min light block" (SRS + reading the article glossary).

**Acceptance criteria**
- [ ] Opening the app shows a plan of ≤ the session budget, with item durations.
- [ ] The session ends automatically at the budget. Progress persists. A teaser is shown.
- [ ] Minimum mode produces a ≤5-min plan.
- [ ] Parking list items can be added in ≤2 taps and are hidden during sessions.

### 3.2 Units

Each book unit is a learning unit with this flow: **Puzzle → Theory → Exercises → Done**. The learner may also go **straight to exercises**.

**Behavior**
- **Puzzle (curiosity gap):** two contrasting sentences plus a question ("Both are correct. What's the difference?"). The learner types a guess (free text, not graded), then reveals the explanation. Content is authored (see 3.3).
- **Theory:** the book's theory for the unit (imported HTML, sanitized and restyled), plus authored extras:
  - **Programmer analogy** (optional toggle). Example: present perfect = past action whose result "is still in memory/scope".
  - **Spanish-speaker pitfalls** (contrastive notes). Example: "I have 30 years" → "I'm 30".
- **Exercises:** the book's exercises, rendered interactively (blanks, choices, free sentences).
  - **Checking pipeline:** (1) deterministic normalization (see 3.2.1); (2) if no match and the item is open or ambiguous → AI check (`check_answer`).
  - **Hints:** a "Hint" button per item gives a progressive hint (rule reminder → partial form). It never reveals the answer directly. The answer is revealed only after 2 failed attempts plus an explicit "Show answer".
  - **"I don't get it"** opens the tutor (3.9) with the unit and item as context and returns to the same item.
- **Timeline drag (tense units 1–24):** given a sentence, the learner drags the action onto a timeline (start, duration, still ongoing, interrupted). Checked against an authored expected shape. Units 1–6 must have at least 3 timeline items each.
- **Completion:** a unit is `completed` when the first-attempt score on its exercises is **≥ 80%**. Going straight to exercises and scoring ≥80% completes the unit without reading theory.
- **Unit states:** `locked` (not used in the MVP; all units 1–6 are open), `new`, `in_progress`, `completed`, `needs_review` (raised by writing errors or SRS lapses).
- **Priority boost:** each writing error linked to a unit increases that unit's priority for Today, and adds a targeted mini-review (3 items) even if the unit is completed.

#### 3.2.1 Answer normalization rules

The book answer key (`answers_data.js`) uses free-text variants. The checker must handle:

| Pattern in key | Example | Rule |
|----------------|---------|------|
| Contraction + full form in parentheses | `’m looking (am looking)` | Both forms are accepted. |
| Alternatives with `/` | `aren’t speaking / ’re not speaking (are not speaking)` | Each alternative is accepted (expanded with its parenthesized full form). |
| Multi-blank with `. . .` | `’re making (are making) . . . ’m trying (am trying)` | Split into ordered blanks, each checked separately. |
| Curly quotes, apostrophes | `’` vs `'` | Normalize to `'`. |
| Case, extra spaces, final punctuation | `Is losing.` | Case-insensitive, collapse whitespace, ignore trailing punctuation. |
| Optional words in parentheses (non-full-form) | `(the) car` | Accept with and without. |
| Example items | Item numbers missing from the key (e.g., starts at `2.`) | Item 1 is the worked example: displayed pre-filled, not graded. |

Anything not matched deterministically and marked open-ended (e.g., "Answers will vary", or free-sentence exercises) goes to the AI check.

**Acceptance criteria**
- [ ] Units 1–6 are fully playable. Every exercise item is either deterministic-checkable or flagged open.
- [ ] Normalization passes a unit test suite covering every row above.
- [ ] A unit completes at ≥80% first-attempt accuracy.
- [ ] Hints never contain the exact expected answer on the first level.
- [ ] The timeline drag works on touch and mouse.

### 3.3 Serial story (per block)

Each book block has one **real-world story told in chapters**, one chapter per unit. Each chapter uses the unit's grammar deliberately and densely, and ends on a **cliffhanger**.

- **Block 1 (units 1–6):** a true story chosen for the learner's interests (history/science/computing). Suggested: *Apollo 13*. Chapter grammar: U1 present continuous (live "now" narration), U2 simple present (how things work), U3–U4 contrast, U5 simple past, U6 past continuous ("while they were sleeping, the oxygen tank…").
- Content is **authored and stored in the repo** (not generated at runtime): 250–450 words per chapter, with target-grammar spans annotated for highlighting.
- A chapter is shown at the start of its unit (before the puzzle) or as the session-end teaser.

**Acceptance criteria**
- [ ] 6 chapters exist with grammar annotations and cliffhanger endings.
- [ ] Target-grammar spans can be highlighted in the UI.

### 3.4 Reading (daily article)

#### 3.4.1 AI editor pipeline (daily job)

Runs per user at their local `editorHour` (Settings; initially the instance `EDITOR_HOUR`) via a periodic check, and selects **one article per user per day** from a shared pool. Annotations are stored per user (`daily_article`).

| Step | Detail |
|------|--------|
| 1. Gather candidates | **The Conversation** Atom feeds (technology, environment, politics, world). Other search sources can be added later behind the `NewsSource` port. |
| 2. Filter | Published ≤ 7 days ago; 500–1,200 words; not used before; extractable full text. |
| 3. Select (`select_article`) | Topic rotation (tech → science → geopolitics), estimated B1–B2 difficulty, presence of current-unit grammar, novelty, and interest. |
| 4. Annotate (`annotate_article`) | Glossary (10–20 items: word, lemma, Spanish gloss, example), grammar spots for the current unit (sentence spans + explanation), 3 inference questions, a headline-prediction prompt, and a writing-opinion prompt. |
| 5. Store | Original text **verbatim**, source URL, author(s), outlet, license, published date, annotations. |

**Licensing rules:** The Conversation articles are **CC BY-ND 4.0**. Show the text unmodified, with author(s), institution if available, and a link to the original at the top. **Never rewrite, simplify, or translate** article text; annotate only. For web-search sources, show the source link prominently. Content is for personal, non-public use.

**Fallback:** if the pipeline fails, Today shows the previous unread article or a manual "paste URL" option (fetched via `web_fetch`).

#### 3.4.2 Active reading flow (6 steps)

| Step | Learner action | Feedback |
|------|----------------|----------|
| 1. Predict | See the headline only; write one line about what it might say. | None (compared after reading). |
| 2. Read | Read the full text; tap a word for the glossary entry or an on-demand gloss (`gloss_word`); "save" adds it to SRS. | Instant. |
| 3. Understand | Answer 3 **inference** questions (not locate-the-fact). | `grade_comprehension`: score + hint for weak answers. |
| 4. Spot grammar | Find N instances of the current unit's grammar and explain one. | Deterministic against the annotated spans + AI for the explanation. |
| 5. Retell | Write a 3-sentence summary **without the text visible**. | Writing review flow (hints → self-fix → natural rewrites). |
| 6. Opinion | One sentence with the learner's opinion. | Stored as a seed for the weekly post. |

- **Next-day recall (2 min):** 3 quick questions about yesterday's article plus its saved words.
- **Weekly post:** the weekly writing mission is built from the week's opinions (3.6).

**Acceptance criteria**
- [ ] A new article appears daily without manual action; failures are logged and the fallback is shown.
- [ ] Article text matches the source verbatim; attribution and link are visible.
- [ ] All 6 steps are completable on mobile in ~15–20 min.
- [ ] Saved words appear in SRS the same day.

### 3.5 Vocabulary + SRS

- Scheduler: **FSRS** via `ts-fsrs`.
- **Card sources:**
  - `word`: saved from reading (front: word in its article sentence with the word blanked or highlighted; back: gloss + example).
  - `own_error`: created from writing errors (front: the learner's original wrong sentence + "fix it"; back: corrected sentence + rule + unit link).
  - `unit_item`: missed exercise items (optional, from failed first attempts).
- Review UI: show → recall → reveal → rate (Again/Hard/Good/Easy). Typed answers are used for `own_error` cards (checked by AI or normalized match).
- Daily cap configurable (default 30 reviews, 10 new).

**Acceptance criteria**
- [ ] Cards from all sources are scheduled by FSRS and persisted.
- [ ] `own_error` cards show the learner's own sentence and its date.

### 3.6 Writing

**Missions** are about the learner's interests (tech, science, news, books), **not about themselves**.

| Level | Format | Length |
|-------|--------|--------|
| 1 | Tweet / X post | ≤ 280 chars |
| 2 | Thread | 3–5 posts |
| 3 | LinkedIn post | 120–250 words |
| 4 | Short article | 300–600 words |

- Each mission has a **goal**: topic (often from the week's article opinions), a target grammar (current unit), and a format.
- Level advances after 3 missions with a review score ≥ 75.

**Review flow (`review_writing`)**
1. **Hints for real errors:** the AI detects grammar/usage errors. At most **3 focused errors**, prioritizing the **current unit's grammar**. Each gets a hint (rule + location), **never the corrected text**.
2. **Self-fix:** the learner edits the text. A re-check confirms which errors are fixed.
3. **Natural rewrites:** 2–3 **American English** versions of the learner's (fixed) text, one per register: `casual` (X), `professional` (LinkedIn), `neutral`. Each comes with a short note on what makes it more natural.
4. **Scores:** grammar, clarity, vocabulary, naturalness (0–100 each). The overall score is stored for the timeline.
5. **Error log:** every error is stored with a type, the linked book unit (if any), and creates an `own_error` SRS card and a unit priority boost.

**Acceptance criteria**
- [ ] The first feedback screen never shows corrected text, only hints.
- [ ] Max 3 errors are surfaced per review; current-unit errors come first.
- [ ] 2–3 register-labelled rewrites are shown after self-fix.
- [ ] Errors are linked to units when applicable and produce SRS cards.

### 3.7 Progress

- **Timeline:** units completed, writing scores over time, words known (SRS mature cards), reading days, and top error types with their trend.
- **Monthly mirror** (shown on the 1st of each month, or on demand):
  - The first article read ≥30 days ago, re-shown with the words unknown then highlighted, plus "unknown then vs. now" counts (now = no longer in SRS as new/learning).
  - The first post side by side with the latest one (scores and errors).
  - Prompt to add "Now I can…" entries.
- **Can-do log:** learner-written entries plus suggested CEFR-style descriptors to check.
- **No streaks or points.**

**Acceptance criteria**
- [ ] The timeline renders from stored events.
- [ ] The mirror compares real stored artifacts (article, posts).

### 3.8 Settings

- **Ollama API key:** entered in the UI, stored **encrypted at rest** (AES-256-GCM with `APP_SECRET` from env) in the database. Never returned to the browser (only "set / not set" + last 4 chars).
- **Per-AI-function model + effort:** for each function in section 4: a model (dropdown from `/api/tags`) and an effort (values from `/api/show` → `thinking.values`; e.g., `low|medium|high`, or `true|false`, or default).
- Session length, daily SRS caps, editor schedule, RSS feed list, timezone.

**Acceptance criteria**
- [ ] The API key is never present in any API response or frontend bundle.
- [ ] Changing a function's model/effort takes effect on the next call.

### 3.9 Tutor agent ("I don't get it" + chat)

- Opened from any screen with **context** (screen, unit, item, article span, writing error).
- Explains in **Spanish**, with a **different angle** from the book: programmer analogies, Spanish-contrast pitfalls, timeline descriptions, mini examples. Keeps answers short (~2 min read) and ends with a "back to where you were" action.
- **Tools** (function calling):
  - Read: `get_unit_theory(unitNumber, section?)`, `get_item(itemId)` (answer key only after every item of the exercise was attempted), `get_today_article_excerpt(paragraph?)`, `get_recent_errors(limit)`, `get_progress_summary()`, `search_my_cards(query)`
  - Write (safe, reversible): `create_vocab_card(word, sentence, meaningEs)`, `add_parking_item(text)`, `save_doubt(text)`
  - Loop: max 4 tool rounds, results truncated to ~4k chars, streamed to the web over SSE (`thinking`, `text`, `tool`, `done`, `error`).
- The free chat mode is available from the menu. Conversations are stored.

**Acceptance criteria**
- [ ] "I don't get it" returns to the exact origin state.
- [ ] Tool calls are validated (zod) and logged.

### 3.10 Model eval tool

- A settings sub-page to compare models for writing review quality.
- **Fixture set:** 5 authored learner texts with known errors (stored in the repo), each with expected error spans and types.
- Runs `review_writing` on the selected models and efforts and reports: errors detected (recall/precision vs. fixtures), hint leakage (does a hint contain the correction?), JSON validity, latency, and token usage. Naturalness is rated by the learner (1–5) in the UI.
- Shortlist to test first: quality: `deepseek-v4-pro`, `kimi-k3`, `mistral-large-4`; fast/cheap: `gemma4:31b`, `deepseek-v4.1-flash`, `glm-5.3-flash` (Ollama Cloud catalog, Oct 2026).

---

## 4. AI functions catalog

All functions use the LLM port and return **JSON validated with zod**. Ollama `format` gets the JSON schema derived from the zod schema. On a validation failure: one retry with the error appended; then fail gracefully. System prompts, output schemas and message builders live in `apps/api/src/prompts/<function-id>.ts` (registry in `index.ts`, shared blocks in `shared.ts`); output schemas are in `packages/shared/src/ai/`.

| Function | Input | Output (shape) | Default effort | Tier |
|----------|-------|----------------|----------------|------|
| `check_answer` | item prompt, expected key, learner answer, unit rule | `{correct: bool, feedback_es: string, hint?: string}` | low | fast |
| `hint_exercise` | item, unit theory, attempt #, previous answers | `{hint_es: string, level: 1|2}` (no answer) | low | fast |
| `explain_tutor` | context, question, history | streamed text + tool calls | medium | quality |
| `select_article` | candidates (title, summary, url, length, topic), current unit, recent topics | `{chosen_url, reason, topic, est_level}` | medium | fast |
| `annotate_article` | article text, current unit grammar | `{glossary[], grammar_spots[], questions[], predict_prompt, opinion_prompt}` | medium | quality |
| `gloss_word` | word, sentence | `{lemma, gloss_es, pos, example}` | low | fast |
| `grade_comprehension` | question, article excerpt, answer | `{score 0-2, feedback_es, hint?}` | low | fast |
| `review_writing` | text, mission (format, target unit), learner level, unit list | `{errors[≤3]: {span, type, unit_id?, hint_es}, scores{grammar,clarity,vocabulary,naturalness}}` | high | quality |
| `recheck_writing` | original errors, new text | `{fixed: [error_id], remaining: [...] }` | low | fast |
| `rewrite_natural` | fixed text, format | `{versions[2-3]: {register: casual|professional|neutral, text, note_es}}` | medium | quality |
| `generate_mission` | interests, week opinions, level, target unit | `{title, prompt, format, target_unit, constraints}` | medium | quality |
| `generate_practice` | unit theory, learner errors, n | `{items[]: {prompt, answer_key, type}}` | medium | quality |
| `recall_questions` | yesterday's article + saved words | `{questions[3]}` | low | fast |

---

## 5. Architecture

**pnpm monorepo, TypeScript everywhere.**

```
english-course/
├─ apps/
│  ├─ web/            React + Vite + vite-plugin-pwa (installable, offline shell)
│  └─ api/            Hono (Node), REST + SSE for streaming
├─ packages/
│  └─ shared/         zod schemas + inferred types (API DTOs, AI outputs, content)
├─ content/           authored + imported content (JSON/Markdown), versioned
├─ scripts/           importer (book HTML → content JSON)
├─ docs/
└─ docker-compose.yml
```

**Backend: light hexagonal + screaming architecture.** Organize by feature, with ports **only** where something is external.

```
apps/api/src/
├─ units/        domain (answer checker, completion), routes, repo
├─ reading/      editor pipeline, flow, routes
├─ vocabulary/   srs (ts-fsrs), routes
├─ writing/      missions, review flow, error log
├─ progress/     timeline, mirror, can-do
├─ tutor/        agent loop + tools
├─ today/        session planner
├─ settings/     key encryption, model config
├─ eval/         model eval
└─ shared/
   ├─ llm/       port: LlmClient { chat, chatJson, listModels, modelCapabilities }
   │             adapter: ollama (native API)
   ├─ news/      port: NewsSource { candidates, fetchFullText }
   │             adapters: theconversation
   └─ db/        drizzle schema, client, migrations
```

- Domain logic (answer normalization, session planning, completion rules, SRS wrapping) is **pure and unit-tested** (vitest).
- No interfaces for internal collaborators; plain functions and modules.
- Frontend: feature folders mirroring the backend (`today/`, `units/`, `reading/`…), TanStack Query for server state, mobile-first UI.

---

## 6. Data model outline (PostgreSQL 18, Drizzle)

| Entity | Key fields |
|--------|-----------|
| `unit` | id (1–142), block_id, title, theory_html, extras (puzzle, analogy, pitfalls) json, status, priority, completed_at |
| `exercise` | id, unit_id, code ("1.1"), instruction, type, position |
| `exercise_item` | id, exercise_id, num, prompt (json with blanks), answer_key raw, answer_variants json, is_example, is_open |
| `attempt` | id, item_id, answer, correct, method (deterministic/ai), attempt_no, created_at |
| `timeline_item` | id, unit_id, sentence, expected_shape json |
| `story_chapter` | id, block_id, unit_id, title, body, grammar_spans json, teaser |
| `article` | id, source, url, title, authors, outlet, license, published_at, text, topic, est_level, selected_for date, annotations json |
| `reading_session` | id, article_id, prediction, answers json, spots json, retell_id, opinion, completed_at |
| `srs_card` | id, source (word/own_error/unit_item), front, back, ref json, fsrs state json, due |
| `srs_review` | id, card_id, rating, reviewed_at |
| `writing_mission` | id, level, format, title, prompt, target_unit_id, status |
| `writing_submission` | id, mission_id, text_original, text_fixed, scores json, rewrites json, created_at |
| `writing_error` | id, submission_id, span, type, unit_id, hint, fixed bool |
| `session` | id, mode, budget_min, plan json, started_at, ended_at, bonus_min |
| `parking_item` | id, text, created_at, done |
| `can_do` | id, text, source, created_at |
| `doubt` | id, context json, text, resolved |
| `tutor_conversation` / `tutor_message` | id, context json / role, content, tool_calls |
| `setting` | key, value json (ai function configs, caps, schedule) |
| `secret` | key, ciphertext, iv, tag, last4 |
| `event` | id, type, payload json, created_at (feeds the timeline) |
| `eval_run` | id, model, effort, results json, created_at |

---

## 7. Ollama Cloud integration

| Item | Fact |
|------|------|
| Auth | `Authorization: Bearer <key>`; each user creates the key at ollama.com/settings/keys and saves it in Settings |
| Chat | `POST https://ollama.com/api/chat` with `model`, `messages`, `stream`, `think`, `format` (JSON schema), `tools` |
| Effort | `think`: `true`/`false`/`null` or a level string from the model's `thinking.values` (e.g., gpt-oss `low|medium|high`); unsupported values fall back to the default |
| Capabilities | `POST https://ollama.com/api/show` → `thinking` object (values, default) |
| Models | `GET https://ollama.com/api/tags` |
| Web fetch | `POST https://ollama.com/api/web_fetch` `{url}` → `{title, content, links}` |
| OpenAI compat | `https://ollama.com/v1` exists (`tool_choice` unsupported); **not used**, the native API is preferred for `think` and `format` |
| Security | Docs require keeping the key out of browser code → **backend proxy only** |
| Billing | Credit-based plans (since 2026-08-31); monitor at ollama.com/settings/usage |

Reasoning output (`message.thinking`) is discarded, never shown or stored.

---

## 8. Deployment

- **Docker Compose** services: `web` (static build served by nginx or by the api), `api` (Node), `db` (`postgres:18`, **local/dev only**).
- **Production:** the user's existing PostgreSQL 18 server via `DATABASE_URL`; the compose file has a profile/override that omits `db`.
- **Env:** every variable is required with no default and the api fails on start naming each missing one (full list in README "Environment variables"): `DATABASE_URL`, `PORT`, `APP_SECRET` (32-byte key for encryption), `APP_USER_EMAIL` + `APP_USER_PASSWORD` (admin user bootstrapped on startup; see README "Users"), provider base URLs, `APP_PUBLIC_URL`, `COOKIE_SECURE`, `TRUST_PROXY`, `EDITOR_ENABLED`, `EDITOR_HOUR`, `CONTENT_DIR`; `WEB_DIST_DIR` is an optional mode switch. AI provider keys are never env variables: each user saves their own in Settings. The app runs in UTC; each user picks a time zone in Settings.
- Migrations run on api start (Drizzle). The content seed is idempotent.
- PWA: manifest, icons, service worker (app shell cache; API is network-first).

---

## 9. Content source

- **Book:** `../english-intermediate-book/` (sibling of this repo), an HTML digital edition of an intermediate grammar book (Murphy-style).
  - `units/unit_001.html` … `unit_142.html`: two-page layout (theory left, exercises right). Classes include `lesson-section`, `section-tab`, `section-content`, `example-box`, `rule-highlight`, `grammar-target`, `grammar-contrast`, `exercise-block`, `exercise-number`, `exercise-instruction`, `exercise-list`, `exercise-item`, `item-index`, `item-content`, `blank-line`, `word-bank`, `word-bank-item`, `example-answer`. Images in `units/img/`.
  - `js/answers_data.js`: `window.BOOK_ANSWERS = { "1": { "1.1": { "items": [ {"num": "2.", "ans": "’m looking (am looking)"}, … ] } } }`.
  - `index.html`: block/category list (e.g., "Present and Past (Units 1 – 6)").
- **Importer** (`packages/book-importer`, `pnpm import:book -- --units 1-6`): parses units into `content/units/unit-NNN.json` + `content/units/index.json`, images into `content/images/` (theory HTML sanitized, exercises, items, blanks, word banks, examples, answers joined from `answers_data.js`) and reports items it cannot classify. It runs on all units without crashing, but ~20 later units have unhandled layouts and fail validation (to fix when those units are added); the seed loads **units 1–6 only** for the MVP.
- **Authored content** (`content/authored/`): block-1 story chapters, puzzles, programmer analogies, Spanish pitfalls, timeline items, and eval fixtures.
- The book is a personally purchased copy; the app is for personal, self-hosted use only.

---

## 10. MVP scope checklist

- [ ] Units 1–6: imported, playable, auto-checked, with puzzles, extras, timeline items, and story chapters
- [ ] Daily article pipeline + 6-step reading flow + next-day recall
- [ ] SRS with word, own-error, and unit-item cards
- [ ] Writing missions + review flow + error log
- [ ] Today engine with auto-end, minimum mode, and parking list
- [ ] Progress timeline + monthly mirror + can-do log
- [ ] Tutor agent with tools
- [ ] Settings (encrypted key, per-function model/effort) + model eval
- [ ] PWA installable; Docker Compose for local and production
