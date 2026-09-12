# Wander deployment and verification

Updated: 2026-09-12. The application is packaged for a private alpha. Live provider,
Google sign-in and hosted deployment verification still require operator credentials.
Capacity work is outside this change.

## Run locally

Use Node 22.12 or newer. From the repository root:

```sh
npm ci --ignore-scripts
node scripts/prepare-travel.mjs
cp .env.example .env
node --env-file=.env packages/travel-agent-server/dist/index.js
```

Open http://127.0.0.1:3001. Accept the alpha notice and enter a Gemini API key in
the app. The key check makes a small provider request. Invalid keys stay on the
setup screen; keys are encrypted server-side and can be replaced or deleted in
**API key & account**. The default model is `google/gemini-2.5-flash`.

Web search uses Gemini grounding with the user's key. Set `SEARXNG_BASE_URL` to a
reachable SearXNG instance with JSON image search enabled for photos. Without a
working image provider, the planner can return text but must not invent photos.
`USE_STAGEHAND=0` avoids requiring a local browser or a second provider key.

The web bundle and API share one origin. The preparation script compiles the
checked-in model catalog and required workspace packages, then bundles the web
app. It does not run online model discovery. Vite reports a large vendor chunk
from the existing Markdown renderer; packaging succeeds.

## Deploy to Railway

Configure one service using `Dockerfile.travel` (set
`RAILWAY_DOCKERFILE_PATH=Dockerfile.travel` if needed). Mount a persistent volume
at `/data`. Use the service's HTTPS domain for both UI and API. Do not run multiple
replicas against these file stores. A database migration is not required for this
private alpha.

Set these environment variables before starting production:

```text
NODE_ENV=production
HOST=0.0.0.0
AUTH_REQUIRED=true
AUTH_COOKIE_SECURE=true
AUTH_SESSION_SECRET=<unique random secret, at least 32 characters>
CREDENTIAL_ENCRYPTION_SECRET=<different random secret, at least 32 characters>
GOOGLE_CLIENT_ID=<Google OAuth web client>
GOOGLE_CLIENT_SECRET=<Google OAuth secret>
GOOGLE_REDIRECT_URI=https://<app-domain>/api/auth/callback
CORS_ORIGINS=https://<app-domain>
ALPHA_USER_ALLOWLIST=<comma-separated invited Google emails or user IDs>
TRAVEL_AGENT_DATA_DIR=/data
TRAVEL_AGENT_PROVIDER=google
TRAVEL_AGENT_MODEL=gemini-2.5-flash
USE_STAGEHAND=0
SEARXNG_BASE_URL=<image search endpoint>
TRAVEL_AGENT_MESSAGE_TIMEOUT_MS=360000
SEARCH_TIMEOUT_MS=12000
IMAGE_TIMEOUT_MS=15000
```

Register the exact callback URI in the Google OAuth client and invite the alpha
users in its consent configuration. Keep encryption secrets stable across releases
so saved keys remain decryptable. Server-funded keys are optional; for that path
set `GEMINI_API_KEY` and put approved Google **user IDs** in
`SERVER_KEY_FALLBACK_ALLOWLIST`.

The server refuses unsafe production authentication, cookies, missing Google
configuration, default/short secrets, wildcard CORS and an empty alpha allowlist.
`/health` is liveness. `/ready` checks local storage access and required configuration;
it does **not** prove external provider access. Use `/health` as the host health
check and verify `/ready` plus the real journey before admitting users.

## Verification

From the repository root:

```sh
npm run check
```

From `packages/travel-agent-server`:

```sh
npm run check
npx tsx ../../node_modules/vitest/dist/cli.js --run test/server.test.ts test/working-alpha.test.ts test/session-integration.test.ts test/ui-blocks.test.ts test/events.test.ts
```

From `packages/travel-agent-web`:

```sh
npm run check
npx tsx ../../node_modules/vitest/dist/cli.js --run test/api.test.ts test/render-safety.test.ts test/plan-export.test.ts
```

From `packages/travel-agent`, after preparing the web bundle:

```sh
npx tsx ../../node_modules/vitest/dist/cli.js --run test/e2e-session.test.ts test/get-images.test.ts test/image-validation.test.ts test/failover.test.ts test/state.test.ts test/tools.test.ts test/instant-actions.test.ts test/eval-guardrails.test.ts
npx tsx ../../node_modules/vitest/dist/cli.js --run test/web-journey.test.ts
```

The browser test needs Playwright Chromium. Alternatively set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed Chrome executable. Set
`TRAVEL_TEST_ARTIFACTS` to retain screenshots. It uses a deterministic session
fixture and mocked credential probes; the SDK test separately exercises the real
agent harness with the faux provider. Neither establishes live AI quality.

Before inviting users, perform this journey with real credentials on HTTPS:

1. Google sign-in; reject an uninvited account.
2. Add a Gemini key and verify it; check a rejected key and a rotated key.
3. Plan a trip, choose places, explore activities, choose experiences, build the
   itinerary and download it. Check citations, dates, estimates and all activities.
4. Repeat on a phone, interrupt a run, reload and continue; verify the saved trip
   also survives a server restart.
5. Delete the trip and key, then verify a second user cannot access either.
6. Verify photos come from stored validation evidence and the SearXNG endpoint works.

## Data and rollback

Trips save their state, ownership and harness conversation beneath `/data`.
The delete-trip action removes all three. Encrypted credentials are separate and
have their own delete action. Keep the volume and secrets when rolling back to a
previous successful deployment. Recheck health, readiness, login and a real trip.
Alpha users should download important itineraries; a backup/restore rehearsal
has not been performed. Hotel/flight booking is outside the current alpha UI.
