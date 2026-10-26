# English Course

A self-hosted, single-user English course that installs on your phone as a PWA. It is built
around one learner's methodology: short 25-minute sessions planned for you every day, grammar
units from an intermediate grammar book (puzzle → theory → timeline → exercises with automatic
checking), a daily real-world article read through a 6-step active-reading flow, spaced-repetition
vocabulary that includes your own mistakes, writing missions reviewed with hints instead of
corrections, a tutor you can ask "I don't get it", and a progress timeline with a monthly
"mirror". AI features use Ollama Cloud through the backend only.

- Why it works this way: [docs/learning-methodology.md](docs/learning-methodology.md)
- What it does and how: [docs/spec.md](docs/spec.md)

## Quick start (development)

**Prerequisites:** Docker with Compose v2.20+, `openssl`. For running tools on the host
instead of in containers: Node.js 24 and pnpm 11 (`corepack enable`).

```sh
cp .env.example .env
openssl rand -hex 32   # paste as APP_SECRET
openssl rand -hex 16   # a strong APP_PASSWORD (or choose your own)
```

Edit `.env`: set `APP_SECRET`, `APP_PASSWORD`, a real `POSTGRES_PASSWORD` (and the same password
inside `DATABASE_URL`), and `TZ` to your timezone, then:

```sh
docker compose up
```

| URL | What |
|-----|------|
| http://localhost:5173 | Web app (Vite dev server, proxies `/api` and `/content`) |
| http://localhost:3000/api/health | API health (`{"status":"ok","db":"ok"}`) |

First run:

1. **Log in** with `APP_PASSWORD`. Migrations and the content seed (units 1–6) run when the api starts.
2. **Settings → Ollama API key**: paste a key from https://ollama.com/settings/keys. It is
   encrypted at rest with `APP_SECRET` and never reaches the browser. (`OLLAMA_API_KEY` in `.env`
   works as a bootstrap; a key saved in Settings wins.)
3. **Settings → Open model evaluation** (`/settings/eval`): run the evaluation, compare models on
   quality, latency and cost, and apply the winner to each AI function.
4. **Daily editor**: every day at `EDITOR_HOUR` (default 05:00, in `TZ`) the editor picks and
   annotates an article. Before the first run, use **Reading → Run editor now**.

Set `TZ` to your timezone (e.g. `America/Santiago`) — the daily plan and editor use it.

## Environment variables

The api validates its variables on start and refuses to boot with a clear message when one is
invalid. Empty values count as unset.

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `DATABASE_URL` | yes | — | PostgreSQL 18 URL, `postgres://user:pass@host:5432/db`. |
| `APP_PASSWORD` | yes | — | The single user's login password. |
| `APP_SECRET` | yes | — | 64 hex chars (`openssl rand -hex 32`). Encrypts stored secrets and signs sessions; changing it logs you out and makes the stored Ollama key unreadable (save it again). |
| `TZ` | no | system (`UTC` in the image) | IANA timezone, e.g. `America/Santiago`. Drives the Today plan, day boundaries and the editor hour. |
| `PORT` | no | `3000` | API listen port. `docker-compose.prod.yml` pins it to 3000 inside the container. |
| `OLLAMA_API_KEY` | no | — | Bootstrap Ollama Cloud key; a key saved in Settings overrides it. |
| `OLLAMA_BASE_URL` | no | `https://ollama.com` | Ollama API base URL (chat, tags, show, web search). |
| `COOKIE_SECURE` | no | `auto` | Session cookie `Secure` flag: `auto`, `true` or `false`. `auto` = with `TRUST_PROXY=true`, `X-Forwarded-Proto` decides (missing header → Secure); otherwise https → Secure, and plain http drops Secure only for local hosts (`localhost`, `*.localhost`, `127.*`, `::1`, single-label hosts such as `api`). |
| `TRUST_PROXY` | no | `false` | `true` behind a TLS-terminating reverse proxy: with `COOKIE_SECURE=auto`, `X-Forwarded-Proto` decides the `Secure` flag, and login rate limiting uses `X-Forwarded-For`. Only enable it when clients cannot reach the app directly. |
| `EDITOR_ENABLED` | no | `true` | `false` disables the in-process daily editor (manual runs still work). |
| `EDITOR_HOUR` | no | `5` | Local hour (0–23, in `TZ`) of the daily editor run. |
| `CONTENT_DIR` | no | repo `content/` | Content root (units, authored content, images, eval samples). Relative paths resolve from the working directory. |
| `WEB_DIST_DIR` | no | unset (`/app/apps/web/dist` in the image) | When set, the api also serves the built web app with SPA fallback. Leave unset in development. |
| `DATABASE_URL_TEST` | no | `DATABASE_URL` with `_test` appended to the db name | Database for `pnpm --filter @english-course/api test:db` (created if missing; name must end in `_test`). |
| `API_URL` | no | `http://localhost:3000` | Dev only: where the Vite dev server proxies `/api` and `/content` (`http://api:3000` in compose). |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | dev; prod `with-db` | prod: `english` / — / `english_course` | Credentials for the bundled `postgres:18` service. Keep them in sync with `DATABASE_URL`. |
| `APP_PORT` | no | `3000` | Prod compose: host port published for the app. |
| `APP_BIND` | no | `0.0.0.0` | Prod compose: host address to publish on; use `127.0.0.1` behind a local reverse proxy. |
| `APP_IMAGE` | no | `english-course:latest` | Prod compose: image tag to build/run. |
| `ENV_FILE` | no | `.env` | Prod compose: env file passed to the app container. |

## Production deployment

One image runs everything: the api (Node 24 running TypeScript directly) serves the built PWA,
the content images and `/api`. It runs as a non-root user, with `NODE_ENV=production` and a
healthcheck on `/api/health`.

### With your existing PostgreSQL 18 (default)

Create a database and a user once (as a superuser, e.g. `psql -U postgres`):

```sql
CREATE ROLE english_course LOGIN PASSWORD 'use-a-long-random-password';
CREATE DATABASE english_course OWNER english_course;
```

Then, on the server:

```sh
git clone <this repo> english-course && cd english-course
cp .env.example .env
# set DATABASE_URL=postgres://english_course:<password>@<db-host>:5432/english_course
# set APP_PASSWORD, APP_SECRET (openssl rand -hex 32), TZ, and for a reverse proxy:
#   TRUST_PROXY=true, APP_BIND=127.0.0.1
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps    # wait for "healthy"
```

Migrations and the idempotent content seed run on every start. If the database runs on the same
host outside Docker, use the host's address reachable from the container (for example the
Docker bridge IP) rather than `localhost`.

### Without a PostgreSQL server

Start the bundled `postgres:18` with the `with-db` profile (data in the `pgdata` volume, not
published on any host port):

```sh
# .env: POSTGRES_PASSWORD=<secret> and DATABASE_URL=postgres://english:<secret>@db:5432/english_course
docker compose -f docker-compose.prod.yml --profile with-db up -d --build
```

### Reverse proxy and TLS

Put a TLS-terminating proxy in front, publish the app only on `127.0.0.1` (`APP_BIND`), and set
`TRUST_PROXY=true` so the session cookie gets the `Secure` flag from `X-Forwarded-Proto`. A
service worker (offline support, install) requires HTTPS on any host other than `localhost`.

- **Caddy**: `english.example.com { reverse_proxy 127.0.0.1:3000 }` (forwarded headers are set automatically).
- **nginx**: `proxy_pass http://127.0.0.1:3000;` plus
  `proxy_set_header Host $host;`, `proxy_set_header X-Forwarded-Proto $scheme;`,
  `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. Add `proxy_buffering off;`
  so the tutor's streamed answers (SSE) arrive as they are written.

### Backups

```sh
# External database
pg_dump -Fc "$DATABASE_URL" > english-course-$(date +%F).dump
# Bundled database (with-db profile)
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U english -Fc english_course > english-course-$(date +%F).dump
# Restore into an empty database
pg_restore --no-owner -d "$DATABASE_URL" english-course-YYYY-MM-DD.dump
```

Keep `APP_SECRET` with your backups: without it the stored Ollama key cannot be decrypted.

### Updating

```sh
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

New migrations apply on start. Open apps show **New version available — Reload**.

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
| `pnpm dev` | api + web on the host (needs a reachable `DATABASE_URL`) |
| `pnpm -r test` | All unit tests (vitest) |
| `pnpm --filter @english-course/api test:db` | DB integration tests against `DATABASE_URL_TEST` |
| `pnpm typecheck` | TypeScript in every package |
| `pnpm lint` / `pnpm format` | Biome check / fix |
| `pnpm build` | Production web build (`apps/web/dist`) |
| `pnpm --filter @english-course/api db:generate` | New Drizzle migration from schema changes |
| `pnpm --filter @english-course/api db:seed` | Re-run the content seed |
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
for external things — the LLM (Ollama native API), news sources (The Conversation feeds, Ollama
web search) and persistence (Drizzle stores with in-memory test doubles). Domain rules (answer
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
