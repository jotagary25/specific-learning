# Feature: multi-user-providers

Objective: make the app multi-user ready (admin bootstrapped from `.env`), per-user timezone, optional AI providers (Ollama Cloud + OpenRouter), Dokploy-ready deployment.
Branch: `feat/multi-user-providers` (from `feat/english-course-mvp` @ `a4dde70`) · Delivery: `exception-ok` (no remote; push/PR/merge are user decisions) · Runner: `pnpm -r test`, `pnpm --filter @english-course/api test:db`, `pnpm lint`, `pnpm -r typecheck`.

## Specs

- **S1 — Users & admin bootstrap.** "por ahora email y pass configurable mediante ".env", si hay que migrar algo no hay problema, actualmente nada guardado es relevante". "Que el usuario por defecto del ".env" sea el admin. no se puede configurar más usuarios por ahí, habra una tabla para crear más usuarios pero por ahora no, recuerda que solo queremos estar listos para ello."
  - `app_user` table (id, email unique, password hash, role `admin` | `learner`, timestamps). On startup the `.env` user (`APP_USER_EMAIL`, `APP_USER_PASSWORD`) is created/updated as `admin`; changing its password revokes its sessions. No UI/command to create users.
  - Login by email + password. Sessions, session-epoch revocation and login rate limiting are per user (rate limit keyed by account + client IP).
- **S2 — Data isolation, ready to scale.** "por ahora es de un solo usuario, posiblemente escalemos y debemos estar listos."
  - `user_id` (FK, NOT NULL) on every learner-data table; every query scoped to the authenticated user. Shared content stays global: units/exercises/items, story, timeline, article pool. Per-user daily article selection (replaces `article.selected_for` uniqueness).
  - Per-user settings: AI provider keys, per-function model/effort, preferences. Instance env keys remain a fallback.
- **S3 — Per-user timezone.** "quisiera mantener el horario en UTC y que el horario sea configurable por usuario en settings de la appweb".
  - Server/container stay UTC. Preferences `timezone` (IANA) and `editorHour` per user in Settings; web proposes the browser timezone on first login. One `clock` module computes local day/hour for a user; all modules use it instead of the process TZ. The editor runs per user at their local hour (periodic check, catch-up).
- **S4 — Optional providers + OpenRouter.** "quisiera que Ollama cloud sea opcional estoy pensando en otro proveedor que quiero dar soporte, openrouter así que crea soporte para este también ya que se pone entiendo el modelo y el effort y nose que más, revisa la documentación oficial".
  - Provider per user: `ollama` | `openrouter`, each with its own key. OpenRouter: `POST https://openrouter.ai/api/v1/chat/completions` (OpenAI format, Bearer), tools, SSE streaming, `response_format: json_schema` strict + `provider.require_parameters`, `reasoning.effort` (`none|minimal|low|medium|high|xhigh|max`, per-model `supported_efforts` from `GET /api/v1/models`), `usage.cost` reported (eval shows real cost); model list with pricing in Settings.
- **S5 — News source.** "por ahora the conversetion es suficiente, luego vere si incorporamos alguna herramienta extra para búsqueda."
  - Editor uses only The Conversation; the Ollama web-search source is removed from the pipeline (news port stays for future sources).
- **S6 — Dokploy readiness.** "por si acaso uso dokploy en mi servidor para desplegar mis aplicaciones." "Luego veré como despliego en dokploy, solo quiero que esta aplicación tenga preparación y soporte para ello." "mi database esta en postgres 18".
  - Prod compose Dokploy-friendly (`expose` instead of published ports by default; named volumes only; env via `.env`), works behind Traefik with `TRUST_PROXY=true`; README guide: Application (Dockerfile) and Compose options, DB on Dokploy network vs host (`host.docker.internal`), env table updated (TZ removed, new user/provider vars). No deployment performed.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1, S2 | delegated writer (context backstop: parent session is very long) | [x] | see Log |
| T2 | S3, S5 | delegated writer (context backstop) | [x] | see Log |
| T3 | S4 | delegated writer (context backstop) | [x] | see Log |
| T4 | S6 | inline | [x] | see Log |

Risk: T1 item 1 (migration) + item 2 (auth); T3 item 2 (credentials). Each in its own commit for native review. Do not commit while a committed-only review is open.

## Log

- L1 (2026-10-26, user): "ok, algunas consultas/observaciones: quisiera mantener el horario en UTC y que el horario sea configurable por usuario en settings de la appweb, que opinas? la variable EDITOR_HOUR responde a un cron automatizado? Luego explicame cuantos servicios funcionan actualmente y como funcionan, he visto que hay 2 composes, necesito saber esto porque actualmente ya tengo un postgres en mi servidor, entonces creare ahí mi database para este proyecto con su usuario y contraseña y luego conectare mi proyecto a dicha database. Antes de cualquier cambio puntualicemos todo."
- L2 (user): "por ahora es de un solo usuario, posiblemente escalemos y debemos estar listos. Deacuerdo con lo demás. mi database esta en postgres 18 no te preocupes por eso. revisa todo, que cambios debemos hacer, etc..."
- L3 (user): "necesario, por ahora email y pass configurable mediante ".env", si hay que migrar algo no hay problema, actualmente nada guardado es relevante, lo será una vez que despleguemos en el servidor. por si acaso uso dokploy en mi servidor para desplegar mis aplicaciones. Me olvidaba otra cosa, quisiera que Ollama cloud sea opcional ... openrouter así que crea soporte para este también ... revisa la documentación oficial porque estoy revisando que me sale quizas más barato que ollama cloud."
- L4 (user): "Luego veré como despliego en dokploy, solo quiero que esta aplicación tenga preparación y soporte para ello. por ahora the conversetion es suficiente, luego vere si incorporamos alguna herramienta extra para búsqueda."
- L5 (user): "Que el usuario por defecto del ".env" sea el admin. no se puede configurar más usuarios por ahí, habra una tabla para crear más usuarios pero por ahora no, recuerda que solo queremos estar listos para ello."
- L6 (user): "empieza"
- L7 (analysis): 11 modules derive local time from the process TZ (today service/sources/planner, progress dates/routes/service/aggregate, vocabulary service, reading dates/scheduler/service, shared preferences + today bonus). Editor = in-process setTimeout scheduler, not cron. OpenRouter facts verified on openrouter.ai/docs (api overview, reasoning tokens, structured outputs, models API, FAQ, web search). Dokploy docs: env vars written to `.env` next to compose and must be loaded via `env_file`; prefer `expose` over `ports`; services join `dokploy-network`; named volumes recommended.

- L8 (T1 evidence): migration `0002_users_and_isolation` (app_user, user_id on learner tables, unit_progress, daily_article, per-user setting/secret; truncates learner data), admin bootstrap from `APP_USER_EMAIL`/`APP_USER_PASSWORD` (scrypt), per-user session epoch + email+IP rate limit, all stores scoped by user. Tests: shared 224, importer 40, api 522 (+29 skipped), web 110; test:db 29/29 incl. per-feature isolation; live: admin created, login/me/units/logout verified. Notes: article annotations shared from first user (follow-up: per-user annotations); in-memory fakes ignore user id. User must replace `APP_PASSWORD` with `APP_USER_EMAIL` + `APP_USER_PASSWORD` (≥12 chars). Engram mirror pending (memory session ended).

- L9 (T1 verification): independent verifier — S1 pass, S2 pass, no blockers (bootstrap, uniform 401 + decoy hash, rate limit 5/burst, token tamper, logout scope, no user-creation routes, per-store user scoping, migration from 0001, seed idempotent, cascade delete). Advisories: shared article annotations (→ T2), two admins if new email belongs to a learner (fixed: other admins demoted + signed out; RED→GREEN in bootstrap.test.ts), nullable user_id on setting/secret (intentional for instance defaults), web search uses admin key (removed in T2).

- L10 (user): "a quien se le ocurre poner ese limite de caracteres, que el minimo sea 8 y ya deja de molestar con eso." → admin password minimum lowered to 8 (`4338355`). User chose to skip native review of T1 (verifier evidence stands) and review T3 instead.
- L11 (T2 evidence): `shared/clock.ts` (Intl, DST-correct) replaces every process-TZ usage; per-user prefs `clock.timeZone` (+ chosen flag) and `reading.editorHour`; Settings zone picker + one-time browser-zone banner; editor tick every 5 min per user at local hour (shared candidate fetch per tick, failure isolation); Ollama web-search source removed (S5); migration `0003_user_timezone_annotations` moves annotations to `daily_article`; TZ=UTC pinned in compose/Dockerfile. Tests: shared 224, importer 40, api 536 (+31 skipped, also green under TZ=Asia/Tokyo/Pacific/Honolulu), web 114; test:db 31/31; live: La Paz morning plan at 15:21Z, manual + tick editor runs, cleanup done. Remaining: own-error card dates and tutor tool dates still UTC; docs/spec.md + .env.example stale (T4). Risk: items 1, 3, 4, 5 → one independent verifier at feature end (T2–T4).

- L12 (T3 evidence): OpenRouter adapter (`shared/llm/openrouter.ts`: SSE with comments, tool-call fragment accumulation by index, reasoning deltas, usage `costUsd`, truncation error; errors 401/402(`payment_required`)/403/408/429/5xx; chatJson strict json_schema + `provider.require_parameters`, json_object/plain fallbacks; models catalog cached 10 min; key test via `GET /key`). Per-user provider `ai.provider` (ollama|openrouter), per-provider keys + per-function configs, env fallbacks `OPENROUTER_API_KEY`/`OPENROUTER_BASE_URL`/`APP_PUBLIC_URL`; defaults `google/gemma-4-31b-it` (fast) and `deepseek/deepseek-v4-pro` (quality), both with tools + structured_outputs in the live catalog; Settings provider switch + prices per 1M; eval shows real cost. Tests: shared 224, importer 40, api 570 (+32 skipped), web 116; test:db 32; live: provider switch, not_configured without key, bad provider 400. Risk: items 2, 3.

- L13 (T3 review): `review-761a1e9b11b52faa` (risk, resilience, reliability) approved + burned. Advisories fixed in `8dfa15e` with RED→GREEN: env AI keys admin-only (`mayUseEnvKeys`), default provider prefers the user's stored key, strict-schema fallback only on 400s naming the schema (not 403/other 400s), per-provider row keys in Settings. Assess: medium, under_budget. Not fixed (advisory): none blocking.
- L14 (T4, inline): `docker-compose.dokploy.yml` (expose 3000, env_file, TZ UTC, extra_hosts host-gateway), `extra_hosts` in prod compose, README "Deploying with Dokploy" (Application/Dockerfile recommended, Compose option, env block, DB host cases, pg_hba), docs/spec.md stale lines updated. Both compose files validate; lint clean.

- L15 (T2–T4 verification): independent verifier — S3, S4, S5, S6 pass, no blockers (7-zone DST sweep, two-user live probe, tick isolation + concurrent manual runs idempotent, S4 fix commit behaviour, image builds and runs healthy with TRUST_PROXY=true, migration 0003 covered by test:db). Advisory fixed: editor retry capped at 3 attempts per user/day (`EDITOR_MAX_DAILY_ATTEMPTS`, RED→GREEN). Remaining advisories (display only): Node canonicalizes some zone names (Asia/Kolkata → Asia/Calcutta); tutor tool, own-error card dates and web progress labels not in user zone; prod compose keeps publishing 127.0.0.1:3000 (Dokploy uses its own compose).

- L16 (user): "osea que ahora hay 3 composes? que basura es esta>" / "en que mundo vives si te estoy diciendo que quiero desplegar en compose en dokploy?" → S6 clarified: production deploys as a Docker Compose service on Dokploy. `docker-compose.dokploy.yml` removed; `docker-compose.prod.yml` is now the single production compose, Dokploy-ready (`expose: 3000`, no published ports, `env_file: .env`, TZ UTC, `extra_hosts`, optional `with-db` profile; dropped APP_BIND/APP_PORT/APP_IMAGE/ENV_FILE). README "Production deployment (Dokploy)" rewritten around Compose on Dokploy. Compose config validates; lint clean.

## Next step

Feature complete. User: update `.env.example`; push/PR/merge are user decisions.
