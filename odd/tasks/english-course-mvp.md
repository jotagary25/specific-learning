# Feature: english-course-mvp

Locator: `odd/tasks/english-course-mvp.md` · Engram mirror: `odd/english-course-mvp/tasks` (project `learning`)

## Objective

Self-hosted, mobile-friendly (PWA) English learning web app built around the learner's personal methodology, with full functionality and initial content limited to book units 1–6 (Present and Past).

## Problem / Why

The learner is curiosity- and gap-driven, holds focus for ~25 min, escapes to news/social media when confused, works all-or-nothing, and stays motivated only by felt competence (not streaks). Grammar is the main weakness; the goal is to read current English books/articles and write posts for a personal brand. Generic tools (Duolingo 2019) failed because practice did not transfer to real use.

## Scope (authorized)

- Methodology doc (cross-topic) and product spec.
- Monorepo: React + Vite + PWA (web), Hono (api), shared zod schemas, PostgreSQL 18 + Drizzle, Docker Compose.
- Units 1–6 imported from `../english-intermediate-book` (theory, exercises, answers).
- Features: Today session engine, Units (puzzle → theory → exercises, timeline drag, hints, "I don't get it"), serial story per block, daily reading pipeline (AI editor; The Conversation + Ollama web search), active reading flow, vocabulary + SRS (incl. own errors), writing missions (hints → self-fix → natural US rewrites by register), progress timeline + monthly mirror, tutor agent, settings (Ollama key, per-function model + effort), model eval.

## Constraints

- Ollama Cloud via backend only (key never in browser). Native `/api/chat` (`think`, `format`), `/api/tags`, `/api/web_search`, `/api/web_fetch`.
- The Conversation is CC BY-ND: show original text with attribution and link; annotate, never rewrite.
- Light hexagonal + screaming architecture: feature modules; ports only for LLM, news sources, persistence.
- Artifacts in English. Conventional commits, no AI attribution. Git identity is repo-local.
- No remote configured: delivery strategy `exception-ok` — work-unit commits on `feat/english-course-mvp`; push/PR/merge remain user decisions.

## Acceptance criteria

- `docker compose up` runs web + api + postgres locally; the app is installable as a PWA.
- Units 1–6 are fully playable with automatic answer checking; unit completes at ≥80%.
- A daily article is selected and annotated; the 6-step reading flow works end to end.
- Writing review returns hints and 2–3 natural rewrites; errors link to units and feed SRS.
- Today screen builds a 25-min session (5-min minimum variant) and ends it automatically.
- Progress timeline and monthly mirror show before/after evidence.
- Settings allow API key, model and effort per AI function.

## Delivery forecast

Forecast far above 400 authored lines (estimated 8–12k). Strategy `exception-ok` (no remote, single user); slices are recorded per task commit below.

## Tasks

| ID | Task | Route | Trigger evidence | Status | Commit |
|----|------|-------|------------------|--------|--------|
| T01 | Methodology doc + product spec | delegated (fork writer) | 2 non-trivial docs needing conversation context | [x] | see Progress |
| T02 | Monorepo scaffold, Docker, Postgres, health check | delegated writer | 2+ non-trivial files | [x] | see evidence |
| T03 | Book importer (units 1–6 → content JSON + DB seed) | delegated writer | preparation reading of HTML + multi-file | [x] | see evidence |
| T04 | Answer checker domain (normalization, variants) TDD | delegated writer | multi-file + tests | [x] | see evidence |
| T05 | DB schema + migrations (all features) | delegated writer | multi-file | [x] | see evidence |
| T06 | LLM port + Ollama adapter + settings (key, model, effort) | delegated writer | multi-file | [x] | see evidence |
| T07 | System prompts per AI function | delegated writer | multi-file | [x] | see evidence |
| T08 | Authored content: block 1 serial story, puzzles, ES contrast notes, analogies | delegated writer | content files | [x] | see evidence |
| T09 | Units UI: list, unit flow, exercises, hints, timeline drag, completion | delegated writer | multi-file | [x] | see evidence |
| T10 | Reading: AI editor pipeline + 6-step flow + next-day recall | delegated writer | multi-file | [ ] | |
| T11 | Vocabulary + SRS (incl. own-error cards) | delegated writer | multi-file | [ ] | |
| T12 | Writing missions + review flow + error log | delegated writer | multi-file | [ ] | |
| T13 | Today session engine (25 min, 5-min minimum, parking list) | delegated writer | multi-file | [ ] | |
| T14 | Progress timeline + monthly mirror + can-do log | delegated writer | multi-file | [ ] | |
| T15 | Tutor agent ("I don't get it" + chat, tools) | delegated writer | multi-file | [ ] | |
| T16 | Model eval tool | delegated writer | multi-file | [ ] | |
| T17 | PWA polish, production Docker, README | delegated writer | multi-file | [ ] | |
| T18 | Schema gaps: persist AI feedback on attempts, hint level, story title, doubt explanation | delegated writer | migration + units module | [ ] | |

## Progress

- 2026-10-25: repo initialized (`b938f22`), branch `feat/english-course-mvp`, RDD on (global).
- 2026-10-25: T01 done — docs/learning-methodology.md (117 lines), docs/spec.md (400 lines). Writer-chosen defaults: APP_PASSWORD single-user login, AES-256-GCM key encryption with APP_SECRET, editor job 05:00, article 500–1,200 words, Apollo 13 story for block 1.

## Verification evidence

- T01 (`47ab8cf`): structural readback of headings; `wc -l` 117/400. RDD assess: `passive` (non_executable_only), review not due; reviewed boundary → `47ab8cf`.
- T02: api 2/2 + web 1/1 tests (RED observed first), typecheck + lint clean, compose up → `/api/health` db ok, web 200; parent spot check `pnpm -r test` passed. Notes: api runs TS directly on Node 24 (no build), pnpm 11 `allowBuilds`, jsdom 29 pinned (Node 24.12), postgres:18 volume at /var/lib/postgresql. Migrations-on-start deferred to T05. Commit `0e032d0`. RDD assess: `medium` (executable_change), review_due false (`under_budget`) — pending in slice since boundary `47ab8cf`.
- T03 (`fda28ef`): importer `packages/book-importer`, schemas in `packages/shared/src/content`. Units 1–6 → 24 exercises, 174 items (146 graded), 10 needsAi (3.3#3 wildcard, 4.2#2 one key part for 2 blanks, 6.1/6.2 open), 9 images. Tests 40/40 (RED first), typecheck/lint clean; parent spot check of unit-001 JSON (1.1#2 alternatives, 1.3 dialogue blanks). ~20 later units fail validation (deferred until added). Spec §9 updated to actual paths. RDD assess: review_due false (`under_budget`), slice still pending since `47ab8cf`.
- T04: pure checker in `packages/shared/src/units` (normalize, contraction canonicalization driven by key first, wildcard, "almost" = apostrophe slip or OSA distance 1 on ≥5 chars excluding function words/-s/-d endings/vowel swaps; needsAi items checked deterministically first). Shared tests 126/126 (RED first); sweep over all key alternatives in units 1–6: 0 failures. Parent spot check: shared tests 126/126. Known limitation: bought/brought-type real-word drops count as almost.

- T05: 22+ tables in `apps/api/src/shared/db/schema/` (by feature; `study_session` instead of `session`, extra `block`, theory as jsonb sections), migration `drizzle/0000_init.sql`, migrate + idempotent seed on api start, `/content/images/*` static route; parent added `/content` vite proxy. Tests: api 15 (+5 DB integration passed against compose db via `test:db`), all suites green, lint clean; compose: seed 6 units/24 exercises/174 items, restart writes 0 rows. Pending for user: add `CONTENT_DIR` (optional) and `DATABASE_URL_TEST` to `.env.example` (writes to `.env*` blocked by permissions).

- T06: single-user auth (signed httpOnly cookie, rate-limited login), LLM port + Ollama native adapter (stream, chatJson with zod + 1 retry, tools, /api/tags, /api/show thinking), AES-256-GCM key storage (env fallback), per-function model/effort settings + Settings/Login UI. Defaults: fast `gemma4:31b` (low; select_article medium), quality `deepseek-v4-pro` (medium; review_writing high). Tests: api 81 (+5 db skipped), web 7, all green; compose: 401 unauthenticated, login 200 + cookie, key endpoint exposes last4 only. Parent spot check: api tests 81 passed. Pending for user: `.env.example` additions `OLLAMA_BASE_URL`, `COOKIE_SECURE`; set Ollama key in Settings.

- T06 review: full slice 47ab8cf..4f35cb9 → `lens_context_budget_exceeded`; reduced to T06 commit (base 9e85d9e), consent granted, lineage `review-aea7ddcc064c2612` (4 lenses, correction budget 200). Captures blocked: claude CLI OAuth session expired (client runtime). Waiting for user re-login to relaunch.
- T07: 13 prompt modules in `apps/api/src/prompts/` (system prompt + zod schema + pure builder, injection guard, hints never reveal answers, review ≤3 focused errors with Spanish hints and no corrections), output schemas in `packages/shared/src/ai/`, eval samples `content/eval/writing-samples.json` (5 texts). Tests: shared 157, api 127 (+5 skipped), all green; lint clean. Parent spot check: read `review-writing.ts`. Spec §4 updated with prompt location.

- T08: authored block 1 — Apollo 13 serial story (6 chapters, 201–229 words, 10–14 grammar spans each, facts checked against NASA sources listed in story.json), unit extras (puzzle, analogyEs, pitfalls, canDoEs) and 30 timeline items; schemas in `packages/shared/src/content/authored.ts`; seed extended (42 rows, idempotent 0 on restart). Tests: shared 181, api 134 (+6 skipped), test:db 6/6; lint clean. Parent spot check: chapter 1 text + unit 1 puzzle.

- T09: Units end to end — api `apps/api/src/units/` (list, detail without keys, attempts with server-side check + AI fallback for open items, graduated hints with key-leak guard and offline fallback, one-shot explain, timeline placement check, answers gated until all attempted, completion ≥80% over all graded items → event + can_do once); web stepper Story → Puzzle → Theory → Timeline → Exercises, direct-to-exercises, "I don't get it" sheet, drag timeline with keyboard alternative. Tests: shared 191, api 159 (+6 skipped), web 27; lint clean. Parent wired `createUnits` in `apps/api/src/index.ts` (writer surface gap) and verified live: unauthenticated 401, login 200, 6 units listed, 1.1-2 "am looking" correct (smoke attempt deleted afterwards). Schema gaps recorded as T18.

## Next step

T10 — Reading pipeline + flow; relaunch T06 review captures after user re-login.
