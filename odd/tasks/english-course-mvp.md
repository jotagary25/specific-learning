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
| T05 | DB schema + migrations (all features) | delegated writer | multi-file | [ ] | |
| T06 | LLM port + Ollama adapter + settings (key, model, effort) | delegated writer | multi-file | [ ] | |
| T07 | System prompts per AI function | delegated writer | multi-file | [ ] | |
| T08 | Authored content: block 1 serial story, puzzles, ES contrast notes, analogies | delegated writer | content files | [ ] | |
| T09 | Units UI: list, unit flow, exercises, hints, timeline drag, completion | delegated writer | multi-file | [ ] | |
| T10 | Reading: AI editor pipeline + 6-step flow + next-day recall | delegated writer | multi-file | [ ] | |
| T11 | Vocabulary + SRS (incl. own-error cards) | delegated writer | multi-file | [ ] | |
| T12 | Writing missions + review flow + error log | delegated writer | multi-file | [ ] | |
| T13 | Today session engine (25 min, 5-min minimum, parking list) | delegated writer | multi-file | [ ] | |
| T14 | Progress timeline + monthly mirror + can-do log | delegated writer | multi-file | [ ] | |
| T15 | Tutor agent ("I don't get it" + chat, tools) | delegated writer | multi-file | [ ] | |
| T16 | Model eval tool | delegated writer | multi-file | [ ] | |
| T17 | PWA polish, production Docker, README | delegated writer | multi-file | [ ] | |

## Progress

- 2026-10-25: repo initialized (`b938f22`), branch `feat/english-course-mvp`, RDD on (global).
- 2026-10-25: T01 done — docs/learning-methodology.md (117 lines), docs/spec.md (400 lines). Writer-chosen defaults: APP_PASSWORD single-user login, AES-256-GCM key encryption with APP_SECRET, editor job 05:00, article 500–1,200 words, Apollo 13 story for block 1.

## Verification evidence

- T01 (`47ab8cf`): structural readback of headings; `wc -l` 117/400. RDD assess: `passive` (non_executable_only), review not due; reviewed boundary → `47ab8cf`.
- T02: api 2/2 + web 1/1 tests (RED observed first), typecheck + lint clean, compose up → `/api/health` db ok, web 200; parent spot check `pnpm -r test` passed. Notes: api runs TS directly on Node 24 (no build), pnpm 11 `allowBuilds`, jsdom 29 pinned (Node 24.12), postgres:18 volume at /var/lib/postgresql. Migrations-on-start deferred to T05. Commit `0e032d0`. RDD assess: `medium` (executable_change), review_due false (`under_budget`) — pending in slice since boundary `47ab8cf`.
- T03 (`fda28ef`): importer `packages/book-importer`, schemas in `packages/shared/src/content`. Units 1–6 → 24 exercises, 174 items (146 graded), 10 needsAi (3.3#3 wildcard, 4.2#2 one key part for 2 blanks, 6.1/6.2 open), 9 images. Tests 40/40 (RED first), typecheck/lint clean; parent spot check of unit-001 JSON (1.1#2 alternatives, 1.3 dialogue blanks). ~20 later units fail validation (deferred until added). Spec §9 updated to actual paths. RDD assess: review_due false (`under_budget`), slice still pending since `47ab8cf`.
- T04: pure checker in `packages/shared/src/units` (normalize, contraction canonicalization driven by key first, wildcard, "almost" = apostrophe slip or OSA distance 1 on ≥5 chars excluding function words/-s/-d endings/vowel swaps; needsAi items checked deterministically first). Shared tests 126/126 (RED first); sweep over all key alternatives in units 1–6: 0 failures. Parent spot check: shared tests 126/126. Known limitation: bought/brought-type real-word drops count as almost.

## Next step

T05 — DB schema + migrations + seed.
