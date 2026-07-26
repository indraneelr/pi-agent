# Travel Agent Railway Alpha Runbook

Status: alpha staging/production checklist

## Railway services

Use Railway as the primary alpha target.

Recommended services:

1. `travel-agent-server` Node service
2. `travel-agent-web` static/Vite service or bundled frontend service, depending on final Railway layout
3. Railway Postgres plugin for app/session/credential persistence when DB migration is added
4. SearXNG service or externally hosted SearXNG endpoint

## Required environment variables

Server:

- `NODE_ENV=production`
- `RAILWAY_ENVIRONMENT=staging` or `production`
- `AUTH_REQUIRED=true`
- `AUTH_SESSION_SECRET=<strong random secret>`
- `AUTH_COOKIE_SECURE=true`
- `GOOGLE_CLIENT_ID=<google oauth client id>`
- `GOOGLE_CLIENT_SECRET=<google oauth client secret>`
- `GOOGLE_REDIRECT_URI=https://<railway-domain>/api/auth/callback`
- `CREDENTIAL_ENCRYPTION_SECRET=<strong random encryption secret>`
- `SEARXNG_BASE_URL=<https://searxng endpoint>`
- `SERVER_KEY_FALLBACK_ALLOWLIST=<comma-separated user ids/emails>` only for approved fallback users
- `TRAVEL_AGENT_PROVIDER=google` (Gemini is the standard BYOK stack; `ollama`/`kimi-k2.6` is the server fallback)
- `TRAVEL_AGENT_MODEL=gemini-2.5-flash` unless changed
- `GEMINI_API_KEY=<server fallback grounding key>` optional; web search uses the user's BYOK Gemini key (grounding) first
- `OLLAMA_API_KEY=<server fallback key>` only if fallback allowlist is approved
- `SEARCH_TIMEOUT_MS=12000` per-provider web-search failover timeout (ADR 0002)
- `IMAGE_TIMEOUT_MS=15000` per-provider image-search failover timeout (ADR 0002)
- `USE_STAGEHAND=0` optional; disable the slow agentic-browser search so Gemini grounding is primary
- `CORS_ORIGINS=<web origin>`

## Build reproducibility — RELEASE BLOCKER

The published `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, and
`@mariozechner/pi-tui` tarballs currently ship **without a `dist/` folder** and
have **no install-time build step**. A clean `npm install` on CI/Railway therefore
produces packages with no compiled output, and the server/web build fails. This
was worked around locally by building those packages in place; that does **not**
reproduce on a fresh checkout.

Before any Railway deploy, do one of:

1. Publish those packages with their `dist/` included (fix their `files`/build), or
2. Vendor them as workspace packages in this monorepo, or
3. Add a `postinstall` that builds them (`tsgo -p tsconfig.build.json`, with a
   `tsconfig.base.json` resolvable at `node_modules/tsconfig.base.json`).

Until this is resolved, staging deploys are blocked.

Dev/debug override:

- `AUTH_REQUIRED=false` is allowed only for local/dev/debug deployments.

## Health and readiness

- `/health` returns a lightweight liveness response.
- `/ready` is the alpha release gate. It checks:
  - storage path readable/writable
  - credential encryption secret configured
  - SearXNG base URL configured
  - Google OAuth config present when auth is required

Railway should use `/health` for basic liveness and `/ready` for release/smoke validation.

## Alpha smoke commands

Run before launch:

```bash
cd packages/travel-agent
npm run smoke:alpha

cd ../travel-agent-server
npm run check
npm test

cd ../travel-agent-web
npm run check
npm test
```

From repo root:

```bash
npm run check
```

## No-backup alpha policy

For alpha, we are not doing a backup/restore rehearsal. Alpha users should be told:

- data may be reset during alpha
- do not rely on alpha as permanent trip storage
- user LLM keys can be deleted/rotated from the app

Before beta/GA, replace this with a real backup/restore and deletion rehearsal.

## Rollback

Railway rollback should use the previous successful deployment. After rollback:

1. Check `/health`.
2. Check `/ready`.
3. Run the alpha smoke flow.
4. Verify Google sign-in and credential listing with a test user.

## Data deletion

Alpha minimum:

- credential delete endpoint removes stored encrypted key records
- trip/session deletion endpoint is still pending and must be added before broader beta

## Launch gate (M7)

Before launch, in addition to the blockers below:

- **Build reproducibility** resolved (see the release-blocker section above).
- Deterministic + integration tests green (`npm test` in each package; offline, no keys).
- Golden-path smoke green (`npm run smoke:alpha` in `packages/travel-agent`).
- Manual dogfood of the Greece/Japan/Portugal matrix, mobile included.
- **Observability:** `runId`/`sessionId` in logs (done); error alerting (e.g. Sentry log drain) wired — *operational, not yet configured*.
- **Security:** run `/security-review` over auth/creds/isolation/CORS/cookies; resolve findings — *operational, not yet run*.
- **Capacity:** session rehydrate-on-restart verified (integration test); pick a concurrent-user target and size the Railway service.

## Release blockers

Do not launch alpha if any are true:

- Build reproducibility is unresolved (pi-* packages ship no `dist`)
- `/ready` returns non-200
- Google sign-in fails in staging
- credential API returns plaintext key material
- cross-user session/credential isolation tests fail
- rendered images are not backed by validation evidence
- SearXNG is unavailable and no approved fallback exists
