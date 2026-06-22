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
- `TRAVEL_AGENT_PROVIDER=ollama` unless changed
- `TRAVEL_AGENT_MODEL=kimi-k2.6` unless changed
- `OLLAMA_API_KEY=<server fallback key>` only if fallback allowlist is approved
- `CORS_ORIGINS=<web origin>`

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

## Release blockers

Do not launch alpha if any are true:

- `/ready` returns non-200
- Google sign-in fails in staging
- credential API returns plaintext key material
- cross-user session/credential isolation tests fail
- rendered images are not backed by validation evidence
- SearXNG is unavailable and no approved fallback exists
