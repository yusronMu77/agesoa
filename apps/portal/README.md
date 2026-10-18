# apps/portal

Public web portal of AGESOA (Next.js 16, App Router, TypeScript). Server-rendered pages read the backend
services on the server; the browser never talks to a service or a database directly.

At CP0 the portal has:

| Route | What it shows |
|---|---|
| `/` | What AGESOA is, links to the log and the status page, evidence status legend |
| `/log` | Public hash-chained decision log (`transparency` `GET /v1/log`), 50 entries per page via `?after=<seq>`, chain verification badge (`GET /v1/log/verify`) |
| `/log/[seq]` | One log entry: fields, full hash, previous hash linked to the previous entry (and checked against it), the hashed entry as JSON |
| `/status` | Readiness of the five services (`GET /readyz`, called in parallel, 3 s timeout each; unreachable = down) |
| `GET /api/status` | The same status report as JSON (always 200; the state is in `overall` and per service) |
| `GET /api/healthz` | `{service: "portal", status: "ok", release, environment, demo_mode}` |

Every page renders when services are down: data sections show an error state instead of failing.
When `DEMO_MODE=true`, every page shows a fixed `SIMULATION — synthetic data for demonstration` band
(`role="status"`).

Later checkpoints add the public dashboard (map, findings), validator, institution and operator views.

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
bun test              # unit tests: config, services, routes, feature helpers
bun run typecheck     # tsc --noEmit
bun run build         # production build (standalone output)
bun run start         # serve the build with next start (port 3000, or --port <n>)
```

`next start` prints a warning because the build uses `output: "standalone"`; it still serves the build and is
fine locally. Deployments run the standalone server instead (see the Dockerfile).

## Code layout

Pages are thin: a route file reads its params, loads data through its feature, and renders a view. Feature code
lives next to the other code of the same feature, and the backend calls live in one layer per service.

```text
src/
  app/                      routes only; route groups do not change URLs
    (public)/               no account: home, dashboard, cases, decision log, status
    (auth)/                 login, logout
    (validator)/            validation queue, finding decision, validator registration
    (organization)/         organizations, one organization (DNS, staff, integration)
    (operator)/             operations
    api/                    healthz, session, status (route handlers)
    layout.tsx              <html>, metadata, AppShell; error.tsx, global-error.tsx, not-found.tsx
  features/<feature>/       auth, home, dashboard, cases, decision-log, service-status, validation,
                            organizations, ops
    views/*.view.tsx        a whole page body, rendered by the route file
    components/             parts used only by this feature ("use client" only where needed)
    server/load-*.ts        server-side data loading for the views (sign-in redirects, notFound)
    actions.ts              server actions ("use server")
    hooks/ lib/ constants.ts  feature hooks, pure helpers (unit tested), labels
  services/                 backend layer, one folder per service
    http/                   fetchJson (timeouts, errors) and createApiClient (base URL + bearer token)
    <service>/*.model.ts    response and request types
    <service>/*.service.ts  createXService(client): one function per endpoint
    backend.ts              createBackend(config, { token }): every service client for one request
    platform/               cross-service calls (readiness, ops events, demo reset)
  components/
    ui/                     design-system primitives (badge, button, callout, table-wrap, pagination)
    layout/                 app shell, header, footer, nav link, page header
    shared/                 AGESOA concepts used by several features (evidence badge, SIMULASI band, ...)
  configs/                  env.config.ts (environment), routes.config.ts (every URL), site.config.ts (nav)
  hooks/                    shared client hooks (use-*.hook.ts)
  lib/                      framework-free helpers (format, page props, form data, safe links, cn)
```

Rules:

- Links and redirects use `ROUTES` from `configs/routes.config.ts`; no hard-coded paths in features. The planned
  move to the UI/UX paths is listed there and only changes that file, the route folders and redirects.
- Only `services/` calls the backend. Public data (decision log, read model) never gets the session token.
- Domain wording stays generic: domain-pack specifics come from the backend, not from portal code.
- No barrel files; import a module by its path.

## Configuration

Server-side environment variables only, validated in `src/configs/env.config.ts`. Values are read at request time,
so changing them needs a restart, not a rebuild.

| Variable | Default | Notes |
|---|---|---|
| `APP_ENV` | `local` | `local`, `demo`, `staging` or `prod` |
| `DEMO_MODE` | `false` | `true` shows the SIMULASI band. **Refused with `APP_ENV=prod`**: the config module throws, pages return 500 and `/api/healthz` reports the error. |
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
