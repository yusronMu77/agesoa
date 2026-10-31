# apps/portal

Public web portal of AGESOA (Next.js 16, App Router, TypeScript). Server-rendered pages read the backend
services on the server; the browser never talks to a service or a database directly.

## Routes and naming

Use English for documentation, source paths, identifiers and canonical URL segments. Use **organization** as the
shared term for newsrooms and government agencies. The selected UI language does not change URLs. Paths are built in
`src/lib/routes.ts` (`ROUTES`), never typed as literals.

Four separate surfaces (DESIGN-BRIEF §1 in the design repository), each with its own shell and, for validators and
institutions, its own sign-in page; a reader never sees another surface's menu.

| Surface | Route | Screen | What it shows |
|---|---|---|---|
| Public | `/` | SCR-040 | Public dashboard: context pickers, trending, nearby, findings, latest log |
| Public | `/cases/[caseId]` | SCR-043 | Case page: who validated, the institution's follow-up and right of reply, the case's log. A finding id redirects (308) to its case |
| Public | `/cases/[caseId]/report` | SCR-041 | Audit report of the case |
| Public | `/log`, `/log/[seq]` | SCR-042 | Hash-chained decision log (`transparency`), 50 entries per page via `?after=<seq>`; one entry with its hashes |
| Public | `/about`, `/status` | | What AGESOA is and the ways in for validators and institutions; readiness of the five services |
| Validator | `/validators/login` | SCR-023 | Validator sign-in (`?next=` limited to `/validators/*`) |
| Validator | `/validators` | SCR-022 | Queue (`?filter=decided` = my decisions) |
| Validator | `/validators/findings/[findingId]` | SCR-020 | Basis of the finding and the decision |
| Validator | `/validators/register` | SCR-021, 024–026 | Registration wizard |
| Validator | `/validators/log`, `/validators/log/[seq]` | SCR-042 | The decision log inside the validator console |
| Organization | `/organizations/login` | SCR-063 | Organization sign-in (`?signup=1` creates an account; `?next=` limited to `/organizations/*`) |
| Organization | `/organizations` | SCR-060 | Register an organization, the admin's organizations |
| Organization | `/organizations/[organizationId]` | SCR-061, 062, 064, 065 | Domain verification, newsroom staff confirmation, agency integration |
| Organization | `/organizations/[organizationId]/deliveries` | SCR-062 | Every delivery to the agency |
| Organization | `/organizations/log`, `/organizations/log/[seq]` | SCR-042 | The decision log inside the organization console |
| Operator | `/ops` | SCR-090 | Machine status, events, outbox, demo reset |
| | `/ops/login` | SCR-090 | Operator sign-in (`?signup=1` creates an account; `?next=` limited to `/ops`) |
| | `/login` | | Public-header sign-in. `/login` without `next` → 308 `/validators/login`; `next=/validators…`, `next=/organizations…`, `next=/ops…` → 308 to that console's sign-in page with `next` kept |
| | `GET`/`POST /location` | | "Near you" district: `?to=<district code>&back=<path>` chooses (empty forgets) a district; `POST lat, lon, back` turns a point into the published district and drops the point |
| | `POST /logout?to=<path>` | | Clears the session, 303 to `to` (the console's sign-in page) or `/` |
| | `GET /api/status`, `GET /api/healthz` | | Status report as JSON; `{service: "portal", status: "ok", release, environment, demo_mode}` |

Old paths answer with a permanent **308** to the English route, query string kept, relative `Location`
(`LEGACY_REDIRECTS` in `src/lib/routes.ts`, served by `next.config.ts`):

| Old path | Current route |
|---|---|
| `/dashboard` | `/` |
| `/findings/[id]`, `/temuan/[id]` | `/cases/[id]` |
| `/temuan/[id]/laporan` | `/cases/[id]/report` |
| `/validate`, `/validator` | `/validators` |
| `/validate/[id]`, `/validator/temuan/[id]` | `/validators/findings/[id]` |
| `/validator/masuk`, `/validator/daftar` | `/validators/login`, `/validators/register` |
| `/validator/log[/seq]` | `/validators/log[/seq]` |
| `/instansi`, `/instansi/[id]` | `/organizations`, `/organizations/[id]` |
| `/instansi/masuk`, `/instansi/[id]/riwayat` | `/organizations/login`, `/organizations/[id]/deliveries` |
| `/instansi/log[/seq]` | `/organizations/log[/seq]` |
| `/lokasi` | `/location` |

Dates and times follow the reader's language, always in Western Indonesia Time (`src/lib/i18n/core.ts`):
`16 Okt 2026, 10.42 WIB` / `Oct 16, 2026, 10:42 AM WIB`.

Every page renders when services are down: data sections show an error state instead of failing.
Simulation bands are localized and carry `role="status"`. Organization surfaces are always labelled as
simulations in this prototype; other surfaces show the data simulation band when `DEMO_MODE=true`.

## Frontend source layout

```text
src/
  app/
    (public)/                    dashboard, about, cases and decision log
    (auth)/                      sign-in
    (validator)/                 validation and validator registration
    (institution)/organizations/ organization routes and actions
    (ops)/                       operations and service status
    api/                         portal route handlers
  components/
    shell/                       public, sign-in and console layouts
    public/                      public dashboard and finding components
    console/                     reusable console controls
  lib/
    i18n/                        request language, dictionaries and translation helpers
    organizations.ts             organization API calls
    trust.ts                     validator API calls
    institutions.ts              agency integration API calls
    config.ts                    server environment configuration
  assets/                        application logos
```

The shared `packages/ui` package supplies design tokens, fonts and the theme. Application components and
backend API helpers belong to the frontend application.
## Run locally

Requires [bun](https://bun.sh) and Node.js 24 (Next.js runs on Node).

```sh
# from the repository root
bun install
bun run --cwd apps/portal dev        # http://localhost:3000 (or: bun run portal:dev)
```

The backend services are expected on their local ports (8001–8005); see the service READMEs. Without them,
the portal still runs and shows the services as down.

Other commands (from `apps/portal`):

```sh
bun test              # unit tests: config, status, routes and redirects, i18n formats, view helpers
bun run typecheck     # tsc --noEmit
bun run build         # production build (standalone output)
bun run start         # serve the build with next start (port 3000, or --port <n>)
```

`next start` prints a warning because the build uses `output: "standalone"`; it still serves the build and is
fine locally. Deployments run the standalone server instead (see the Dockerfile).

## Configuration

Server-side environment variables only, validated in `src/lib/config.ts`. Values are read at request time,
so changing them needs a restart, not a rebuild.

| Variable | Default | Notes |
|---|---|---|
| `APP_ENV` | `local` | `local`, `demo`, `staging` or `prod` |
| `DEMO_MODE` | `false` | `true` shows the localized simulation band. **Refused with `APP_ENV=prod`**: the config module throws, pages return 500 and `/api/healthz` reports the error. |
| `RELEASE` | `dev` | Release identifier shown in the footer and in `/api/healthz` |
| `SERVICE_URL_INGESTION` | `http://localhost:8001` | Base URL, no trailing path |
| `SERVICE_URL_CASE_AUDIT` | `http://localhost:8002` | |
| `SERVICE_URL_TRUST` | `http://localhost:8003` | |
| `SERVICE_URL_DELIVERY` | `http://localhost:8004` | |
| `SERVICE_URL_TRANSPARENCY` | `http://localhost:8005` | Source of the decision log |

## Design tokens

Colours, type, spacing and radii come from `@agesoa/ui/tokens.css` (`--ag-*` custom properties, generated
from the design repository; see `packages/ui/README.md`). `src/app/globals.css` only uses those variables.

## Deploy

The portal runs on Cloud Run (`agesoa-portal`, `asia-southeast2`), declared in `infra/tofu/envs/demo` together
with its environment (service URLs, `APP_ENV`, `DEMO_MODE`). The deploy workflow
(`.github/workflows/deploy.yml`) builds the image below and rolls out a revision labelled with the commit.
Firebase App Hosting is not used: its buildpacks install with npm, yarn or pnpm only (this repository uses
bun), and it is not offered in `asia-southeast2`.

The Dockerfile builds from the **repository root** (the portal needs the `@agesoa/ui` workspace package); the
context is filtered by `apps/portal/Dockerfile.dockerignore` (BuildKit).

```sh
docker build -f apps/portal/Dockerfile --build-arg RELEASE=$(git rev-parse HEAD) -t agesoa-portal .
docker run --rm -p 8080:8080 -e APP_ENV=local -e SERVICE_URL_TRANSPARENCY=http://host.docker.internal:8005 agesoa-portal
```

The image installs and builds with bun, then runs the Next.js standalone server on Node.js as the non-root
`node` user, listening on `PORT` (default 8080).
