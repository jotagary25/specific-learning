# English Course

A self-hosted English course that installs on your phone as a PWA. It is built
around one learner's methodology: short 25-minute sessions planned for you every day, grammar
units from an intermediate grammar book (puzzle → theory → timeline → exercises with automatic
checking), a daily real-world article read through a 6-step active-reading flow, spaced-repetition
vocabulary that includes your own mistakes, writing missions reviewed with hints instead of
corrections, a tutor you can ask "I don't get it", and a progress timeline with a monthly
"mirror". AI features run through the backend only, on Ollama Cloud or OpenRouter (each user
picks one; see [AI providers](#ai-providers)).

- Why it works this way: [docs/learning-methodology.md](docs/learning-methodology.md)
- What it does and how: [docs/spec.md](docs/spec.md)

## Quick start (development)

**Prerequisites:** Docker with Compose v2.20+, `openssl`. For running tools on the host
instead of in containers: Node.js 24 and pnpm 11 (`corepack enable`).

```sh
cp .env.example .env
openssl rand -hex 32   # paste as APP_SECRET
openssl rand -hex 16   # a strong APP_USER_PASSWORD (or choose your own, 8+ characters)
```

Nothing has a default: `.env` must hold every variable below, or `docker compose` (and the api)
refuses to start and names what is missing. A ready-to-copy development `.env` (use a real
`POSTGRES_PASSWORD`):

```env
# ============================================================
# PostgreSQL — local development database (compose service `db`).
# Compose builds the api's DATABASE_URL from these three values.
# ============================================================
POSTGRES_USER=english
POSTGRES_PASSWORD=<a real password>
POSTGRES_DB=english_course

# ============================================================
# API — port it listens on, the public address of the app (sent
# to OpenRouter as HTTP-Referer) and whether a TLS proxy sits in
# front (false in development).
# ============================================================
PORT=3000
APP_PUBLIC_URL=http://localhost:5173
TRUST_PROXY=false

# ============================================================
# Admin account — created or updated on every start. APP_SECRET
# (openssl rand -hex 32) encrypts saved AI keys and signs
# sessions: keep it stable.
# ============================================================
APP_USER_EMAIL=you@example.com
APP_USER_PASSWORD=<8+ characters>
APP_SECRET=<openssl rand -hex 32>

# ============================================================
# AI providers — API addresses only. The API keys are saved by
# each user in Settings, never here.
# ============================================================
OLLAMA_BASE_URL=https://ollama.com
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# ============================================================
# Daily reading editor — turn the automatic daily article on/off
# and the hour (0-23) new users get until they pick their own.
# ============================================================
EDITOR_ENABLED=true
EDITOR_HOUR=5
```

Compose builds the api's `DATABASE_URL` from the `POSTGRES_*` values (service `db`) and sets
`CONTENT_DIR` (`/app/content`); the web gets `API_URL`. Then:

```sh
docker compose up
```

| URL | What |
|-----|------|
| http://localhost:5173 | Web app (Vite dev server, proxies `/api` and `/content`) |
| http://localhost:3000/api/health | API health (`{"status":"ok","db":"ok"}`) |

First run:

1. **Log in** with `APP_USER_EMAIL` and `APP_USER_PASSWORD`. Migrations, the content seed
   (units 1–6) and the admin account run when the api starts.
2. **Settings → AI provider**: pick Ollama Cloud or OpenRouter and paste that provider's key
   (https://ollama.com/settings/keys or https://openrouter.ai/settings/keys). Keys are encrypted
   at rest with `APP_SECRET` and never reach the browser. Keys are set per user in Settings only;
   there are no key environment variables.
3. **Settings → Open model evaluation** (`/settings/eval`): run the evaluation, compare models on
   quality, latency and cost, and apply the winner to each AI function.
4. **Time zone**: after the first login the app offers your browser's time zone; accept it or
   keep UTC (change it any time in **Settings → Study preferences**). The Today plan, day
   boundaries, weekly/monthly progress and your daily article all follow it.
5. **Daily editor**: once your local hour reaches your **Daily article from** hour (Settings,
   initially `EDITOR_HOUR`), the editor picks and annotates an article from The Conversation for
   you. Before the first run, use **Reading → Run editor now**.

**Time zones.** The app and its containers always run in UTC (`TZ=UTC` is fixed in the image and
both compose files, so a `TZ` in `.env` has no effect on the app). Each user picks their own IANA
zone in Settings, and every local day or hour is computed in that zone.

## Environment variables

The api validates its variables on start and refuses to boot when one is missing or invalid,
with one message naming every offending variable. **Nothing has a default**; empty values count
as missing. AI provider keys are not environment variables: each user saves their own in
**Settings**. The tables list only what you write yourself.

**Development `.env`** (`docker-compose.yml`):

| Name | What it is |
|------|------------|
| `POSTGRES_USER` | User name of the local development database. |
| `POSTGRES_PASSWORD` | Password of that user; pick a real one. |
| `POSTGRES_DB` | Name of the local development database. |
| `PORT` | Port the api listens on and is published on (`3000`). |
| `APP_USER_EMAIL` | Email you log in with; it is the admin account (case-insensitive). See [Users](#users). |
| `APP_USER_PASSWORD` | Admin password, at least 8 characters. Changing it logs the admin out everywhere. |
| `APP_SECRET` | 64 hex chars (`openssl rand -hex 32`) that encrypt saved AI keys and sign sessions. Changing it logs everyone out and makes saved keys unreadable. |
| `APP_PUBLIC_URL` | Address you open the app at (`http://localhost:5173`); sent to OpenRouter as `HTTP-Referer` so it can attribute the requests. |
| `OLLAMA_BASE_URL` | Ollama API address the app calls (`https://ollama.com`). |
| `OPENROUTER_BASE_URL` | OpenRouter API address the app calls (`https://openrouter.ai/api/v1`). |
| `TRUST_PROXY` | `true` only behind a TLS reverse proxy (see below); `false` in development. |
| `EDITOR_ENABLED` | `true` runs the daily article editor automatically; `false` leaves only manual runs. |
| `EDITOR_HOUR` | Hour (0–23) from which a user's daily article is prepared, until they pick their own in Settings; read in each user's time zone. |

**Production environment** (`docker-compose.prod.yml`, or your host's Environment tab):

| Name | What it is |
|------|------------|
| `DATABASE_URL` | Your PostgreSQL 18 database, `postgres://user:pass@host:5432/db`. |
| `APP_USER_EMAIL` | Email you log in with; it is the admin account (case-insensitive). |
| `APP_USER_PASSWORD` | Admin password, at least 8 characters. |
| `APP_SECRET` | 64 hex chars (`openssl rand -hex 32`), generated once on the server and kept stable. |
| `APP_PUBLIC_URL` | Public address of the app (`https://english.example.com`); sent to OpenRouter as `HTTP-Referer` for attribution. |
| `OLLAMA_BASE_URL` | Ollama API address the app calls (`https://ollama.com`). |
| `OPENROUTER_BASE_URL` | OpenRouter API address the app calls (`https://openrouter.ai/api/v1`). |
| `TRUST_PROXY` | `true` behind a TLS reverse proxy, `false` when the app is reached directly. |
| `EDITOR_ENABLED` | `true` runs the daily article editor automatically; `false` leaves only manual runs. |
| `EDITOR_HOUR` | Default hour (0–23) for the daily article, read in each user's time zone. |
| `APP_BIND` | Host address the app is published on: `127.0.0.1` behind a proxy, `0.0.0.0` to expose it. |
| `APP_PORT` | Host port the app is published on. |

**Set for you**: `PORT`, `CONTENT_DIR` (content root) and `WEB_DIST_DIR` (serve the built web)
come from the `Dockerfile` in production; in development, compose sets `CONTENT_DIR` and builds
`DATABASE_URL`, and the web gets `API_URL`. `pnpm --filter @english-course/api test:db` uses
`DATABASE_URL_TEST` when set, otherwise `<POSTGRES_DB>_test` on the dev database at
`localhost:5432` (created if missing).

**Session cookie and proxy.** The session cookie's `Secure` flag is automatic: with
`TRUST_PROXY=true` and a request from a loopback/private proxy, `X-Forwarded-Proto` decides
(missing header → Secure); otherwise https → Secure, and plain http drops it only for local hosts
(`localhost`, `*.localhost`, `127.*`, `::1`, single-label hosts such as `api`). With
`TRUST_PROXY=true`, login rate limiting (per account and client) also uses the last
`X-Forwarded-For` entry. Forwarded headers are honored only from a loopback or private peer
(`127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `::1`, `fc00::/7`, `fe80::/10`); keep the app
unreachable from clients except through the proxy.

## AI providers

Both providers are optional: without a key, AI features answer "AI unavailable" and everything
else keeps working. Keys are set per user in **Settings → AI provider** only (never in `.env`),
encrypted with `APP_SECRET`. A user who never picked a provider uses the one whose key they
saved, else Ollama. Each user picks the active provider in **Settings → AI provider**; keys and
the model/effort chosen for every AI function are kept per provider, so switching back and forth
loses nothing. Evaluation runs use the active provider.

- **Ollama Cloud** (default): key from https://ollama.com/settings/keys. Default models
  `gemma4:31b` (fast functions) and `deepseek-v4-pro` (quality functions).
- **OpenRouter**: create a key at https://openrouter.ai/settings/keys and add credits. OpenRouter
  passes model prices through; every reply reports its real cost (`usage.cost`), which the model
  evaluation shows per run and per sample. A 402 (no credits) shows as AI unavailable.
  - **Choosing models**: Settings lists every OpenRouter model with its price per 1M input / output
    tokens and its context length; the effort menu shows the model's `supported_efforts` (plus
    `none` when reasoning is optional) or on/off. Effort maps to `reasoning.effort`.
  - **Structured output**: AI functions that return JSON use `response_format: json_schema`
    (strict) with `provider.require_parameters`, so only endpoints that honor it are used. Models
    without `structured_outputs` fall back to `json_object` or a plain prompt; replies are always
    validated and retried once. Prefer models that list `tools` and `structured_outputs` (the
    tutor needs `tools`).
  - **Defaults**: `google/gemma-4-31b-it` (fast, $0.20 / $0.40 per 1M) and
    `deepseek/deepseek-v4-pro` (quality, $0.78 / $1.55 per 1M) — the same model families as the
    Ollama defaults, both with `tools` and `structured_outputs` (prices from the models API,
    Oct 2026).

## Users

The app is multi-user ready: every piece of learner data (attempts, cards, readings, writing,
sessions, settings and AI keys…) belongs to one account, and every query is scoped to the
signed-in user. Book content, the story, the timeline exercises and the article pool are shared.

- **The admin comes from `.env`.** On every start the api makes `APP_USER_EMAIL` /
  `APP_USER_PASSWORD` the admin: it creates the account on the first start, updates the
  password when it changed, and when you change `APP_USER_EMAIL` it moves the existing admin to
  the new email instead of creating a second admin (your data stays). A changed email or
  password ends that account's sessions.
- **No other users yet.** There is no sign-up page or command to add users; the `app_user` table
  and the `learner` role are ready for it.
- **Sessions are per user.** Logging out (or a password change) ends only that user's sessions.
  Login attempts are limited per email and client address (5 per 15 minutes), and a wrong email
  or password get the same answer.

## Production deployment

`docker-compose.prod.yml` is the only production compose file and works on any Docker host or
platform (Dokploy included) without changes. One image runs everything: the api (Node 24 running
TypeScript directly) serves the built PWA, the content images and `/api`, as a non-root user with
a healthcheck on `/api/health`. Migrations and the idempotent content seed run on every start.

### 1. Database (PostgreSQL 18)

Create a database and a user once (as a superuser, e.g. `psql -U postgres`):

```sql
CREATE ROLE english_course LOGIN PASSWORD 'use-a-long-random-password';
CREATE DATABASE english_course OWNER english_course;
```

The user must own the database: the app creates its tables on start. In `DATABASE_URL`,
`localhost` would be the container itself:

- **PostgreSQL installed on the host**: use `host.docker.internal` (mapped by `extra_hosts`),
  make PostgreSQL listen on the Docker bridge (`listen_addresses`) and allow the Docker subnet in
  `pg_hba.conf`, e.g. `host english_course english_course 172.16.0.0/12 scram-sha-256`.
- **PostgreSQL in another container or service**: its hostname on a shared Docker network.

### 2. Environment and start

Every line is required (no defaults); `PORT`, `CONTENT_DIR` and `WEB_DIST_DIR` are set by the
image, so leave them out. AI keys are not here: each user saves
theirs in Settings.

```env
# ============================================================
# Database — your own PostgreSQL 18 (the user must own the db).
# ============================================================
DATABASE_URL=postgres://english_course:<password>@<db-host>:5432/english_course

# ============================================================
# Admin account — created or updated on every start. Generate
# APP_SECRET on the server (openssl rand -hex 32), keep it stable.
# ============================================================
APP_USER_EMAIL=you@example.com
APP_USER_PASSWORD=<8+ characters>
APP_SECRET=<openssl rand -hex 32>

# ============================================================
# App and network — public HTTPS address, a TLS proxy in front
# (Traefik on Dokploy: true), and where the container port is
# published on the host.
# ============================================================
APP_PUBLIC_URL=https://english.example.com
TRUST_PROXY=true
APP_BIND=127.0.0.1
APP_PORT=3000

# ============================================================
# AI providers — API addresses only; keys are saved per user in
# Settings.
# ============================================================
OLLAMA_BASE_URL=https://ollama.com
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# ============================================================
# Daily reading editor — automatic daily article on/off and the
# hour (0-23) new users get until they pick their own.
# ============================================================
EDITOR_ENABLED=true
EDITOR_HOUR=5
```

```sh
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps    # wait for "healthy"
```

The compose file has no defaults: `APP_BIND` and `APP_PORT` must be set, or it fails; the api
then fails on start, naming each variable, if any other line is missing. Keep `APP_SECRET`
stable: changing it signs everyone out and makes saved AI keys unreadable.

**On Dokploy**: create a Compose service with `docker-compose.prod.yml`, put the variables above
in its Environment tab (Dokploy writes them to `.env`), and add your domain to service `app`,
port 3000, in the Domains tab.

### 3. Reverse proxy and TLS

Put a TLS-terminating proxy in front and set `TRUST_PROXY=true`, so the session cookie gets the
`Secure` flag from `X-Forwarded-Proto` and login rate limiting keys on the client address.
Forwarded headers are honored only from loopback or private peers (a host proxy, or a proxy
container such as Traefik on a Docker network), so a client cannot spoof them. To reach the app
without a proxy, set `APP_BIND=0.0.0.0` and `TRUST_PROXY=false`. A service worker (offline
support, install on the phone) requires HTTPS.

- **Caddy**: `english.example.com { reverse_proxy 127.0.0.1:3000 }`.
- **nginx**: `proxy_pass http://127.0.0.1:3000;` plus `proxy_set_header Host $host;`,
  `proxy_set_header X-Forwarded-Proto $scheme;`,
  `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` and `proxy_buffering off;`
  (the tutor streams its answers over SSE).

### Backups

```sh
pg_dump -Fc "$DATABASE_URL" > english-course-$(date +%F).dump
# Restore into an empty database
pg_restore --no-owner -d "$DATABASE_URL" english-course-YYYY-MM-DD.dump
```

Keep `APP_SECRET` with your backups: without it the stored provider keys cannot be decrypted.

### Updating

```sh
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

On Dokploy, redeploy the service (or enable auto-deploy). New migrations apply on start. Open apps show **New version available — Reload**.

### Installing on the phone

Open the HTTPS URL in Chrome (Android) and use **Install** in the app's banner or the browser menu.
On iPhone/iPad, open it in Safari, tap **Share → Add to Home Screen**. The installed app has
shortcuts to Today, Vocabulary and Reading.

Offline, the app shell opens and units and articles you already opened stay readable. Anything
that writes (answers, reviews, writing, AI help) needs a connection; nothing is queued.

## Content

- **Book units** come from a personal HTML copy of the grammar book in `../english-intermediate-book/`
  (a sibling of this repo). The importer writes `content/units/` and `content/images/`.
  The index it writes lists only the units of that run, so always import the full range you want:

  ```sh
  pnpm import:book -- --units 1-24
  ```

  Restart the api to seed the new units. Around 20 later units still have layouts the importer
  cannot parse; such a run fails validation and writes nothing, so those units need importer
  fixes first (see `packages/book-importer`).
- **Authored content** lives in `content/authored/` (block-1 serial story, puzzles, analogies,
  Spanish pitfalls, timeline items) and evaluation samples in `content/eval/`. Only block 1
  (units 1–6) has authored content so far.

## Development

| Command | What |
|---------|------|
| `docker compose up` | Postgres + api (watch) + web (Vite) |
| `API_URL=http://localhost:3000 pnpm dev` | api + web on the host (also export `DATABASE_URL` and `CONTENT_DIR=../../content`) |
| `pnpm -r test` | All unit tests (vitest) |
| `pnpm --filter @english-course/api test:db` | DB integration tests (`DATABASE_URL_TEST`, or `<POSTGRES_DB>_test` on the dev db) |
| `pnpm typecheck` | TypeScript in every package |
| `pnpm lint` / `pnpm format` | Biome check / fix |
| `pnpm build` | Production web build (`apps/web/dist`) |
| `pnpm --filter @english-course/api db:generate` | New Drizzle migration from schema changes |
| `docker compose exec api corepack pnpm --filter @english-course/api db:seed` | Re-run the content seed (inside the api container, which has `DATABASE_URL` and `CONTENT_DIR`) |
| `pnpm import:book -- --units 1-6` | Import book units into `content/` |
| `apps/web/icons/generate.sh` | Regenerate PWA icons from the SVG sources (Inkscape) |

```
english-course/
├─ apps/
│  ├─ api/            Hono api: one folder per feature (units, reading, vocabulary, writing,
│  │                  today, progress, tutor, settings, eval) + shared/ (db, llm, news)
│  └─ web/            React 19 + Vite + vite-plugin-pwa; features/ mirror the api
├─ packages/
│  ├─ shared/         zod schemas and types shared by api and web, answer checker
│  └─ book-importer/  book HTML → content JSON
├─ content/           imported units, images, authored content, eval samples
├─ docs/              methodology and product spec
├─ Dockerfile, docker-compose.yml (dev), docker-compose.prod.yml
```

**Architecture.** Light hexagonal, organized by feature ("screaming" folders). Ports exist only
for external things — the LLM (Ollama native API or OpenRouter), news sources (The Conversation feeds; the port
stays open for more) and persistence (Drizzle stores with in-memory test doubles). Domain rules (answer
normalization, session planning, completion, SRS, scoring) are pure functions with unit tests.
The web app uses TanStack Query for server state; the service worker precaches the app shell,
caches content images (cache-first) and unit/article reads (network-first), and never caches
auth, settings, tutor or any write.

## Content license notes

- The grammar book is the learner's personally purchased copy. Imported text and images are for
  personal, self-hosted use; do not redistribute them or expose the app publicly with that content.
- Daily articles from The Conversation are CC BY-ND 4.0: they are shown unmodified, with author,
  outlet, licence and a link to the original. The app adds annotations around the text and never
  rewrites it.
