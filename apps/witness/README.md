# apps/witness

AGESOA Witness: the anonymous citizen reporting app. A reporter records evidence (photo, voice note or typed
text, approximate location shown as a district, an optional social post link or screenshot), reviews the draft
proposed by Agen Intake, corrects it and submits. There is no sign-up and no login: the device keeps a random id and
the services only store a pseudonym of it.

Vite + React + TypeScript, shipped as a PWA (Android APK via Capacitor comes later). Skeleton generated with
scaffold-cli (`react-vite` template); screens and modules written for AGESOA.

## Screens

| Screen | File | What |
|---|---|---|
| SCR-001 Record evidence | `src/screens/Capture.tsx` | in-app camera or gallery, voice note (MediaRecorder, audio/webm), text, location → district or manual district pick |
| SCR-002 Permission explainer | `src/screens/PermissionExplainer.tsx` | shown before the camera / microphone / location prompt; a refusal never blocks the flow |
| SCR-003 Social post | `src/screens/SharedPost.tsx` | paste a post link (stored without the poster's username), upload screenshots |
| SCR-004 Review draft | `src/screens/DraftReview.tsx` | review neutral incident fields: narrative, issue type, location, time, impact and people affected |
| SCR-005 Submitted | `src/screens/Submitted.tsx` | report code, SHA-256 of each stored evidence file, evidence deadline and tips |
| SCR-006 Audit questions | `src/screens/Questions.tsx` | the questions Agen Audit puts to this device's reporter (case-audit `GET /v1/witness/questions`), answered in text; offered by a banner on every screen while a question waits, answers are labelled `alleged` and never raise an evidence status |

UI text is Indonesian and comes from the design repository's microcopy (`src/copy.ts`, keyed by text id); the
end-to-end tests expect the same text. Categories, fields, rules and tips come from the domain pack served by the
ingestion service (`GET /v1/domain-packs/general`). Public reporting always uses the general incident schema.
There is no domain-pack selector in the citizen flow. Legacy deployment presets cannot replace the public
fields with a specialised schema. Unknown incident details may be left blank.

Privacy: photos go to the ingestion service, which removes EXIF/GPS before storing them and hashes the stored
bytes. The approximate position is sent once to `POST /v1/regions/resolve` and never with the report; only the
district is kept.

## Run locally

Needs the ingestion service on port 8001 (its `CORS_ORIGINS` includes `http://localhost:5173`). With
`DEMO_MODE=true` the service loads the fictional Kabupaten Sukamaju districts.

```sh
cp .env.example .env.local      # VITE_APP_ENV, VITE_DEMO_MODE, VITE_INGESTION_URL, VITE_CASE_AUDIT_URL
bun install                     # from the repository root (workspace)
bun run dev                     # http://localhost:5173
bun run test                    # unit tests (bun test)
bun run build                   # typecheck + production build in dist/
```

Camera, microphone and location need a secure context: `localhost` works; on a phone in the same network use the
production build behind HTTPS.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `VITE_APP_ENV` | `local` | `local` uses the services' development token; other environments need Firebase anonymous sign-in (issue #23) and fail loudly until then |
| `VITE_DEMO_MODE` | `false` | shows the "SIMULASI" band; refused with `prod` |
| `VITE_INGESTION_URL` | `http://localhost:8001` | |
| `VITE_CASE_AUDIT_URL` | `http://localhost:8002` | audit questions (SCR-006); its `CORS_ORIGINS` must include the Witness origin; unreachable = no banner, reporting is not blocked |

`VITE_DOMAIN` is a legacy variable and is ignored. Witness always creates reports with `domain=general`.

Not done yet: answering by voice (SCR-006 is text only), service worker (offline queue of drafts), Capacitor Android build (native camera plugin, share
target SCR-007), Firebase anonymous sign-in.
