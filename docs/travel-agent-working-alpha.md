# Working alpha: implementation and verification

Date: 2026-09-12

## Scope

Make the existing planner usable from sign-in to a downloaded itinerary. Keep
capacity changes (eviction, queues, browser pools, async persistence) out of scope.
Use the existing React UI, Fastify server, pi harness, Google BYOK and search tools.

## Changes

1. Make authentication and credentials usable: browser sign-in/key management,
   actual provider validation, key rotation applied to subsequent runs, expiring
   cookies, safe errors and production configuration checks.
2. Make generation recoverable: bounded SSE runs, proper disconnect detection,
   explicit stop, heartbeat, incomplete-stream errors, refresh during a run, and
   preserve completed state on cancellation or failure.
3. Make planning controls reliable: serialize selections, keep research responses
   visible, show appropriate next steps and all itinerary activities, export the
   canonical itinerary, and verify desktop/mobile layouts. Keep existing optional
   booking functionality; do not show empty booking tabs.
4. Provide a single-origin production entry point, explicit configuration, durable
   data directory, reproducible packaging and an honest release checklist.

## Verification

- Targeted offline regressions for auth, credentials, streams, state and export.
- Required root `npm run check` and travel server/web type checks.
- Browser journey with an injected fake session for deterministic UX coverage.
- Real-provider trip through preferences, places, activities and itinerary when
  existing operator credentials are available; record limitations otherwise.
- Never call fake-provider success a live AI or staging deployment pass.

## Release boundary

Private alpha only. Production deployment needs the operator's Google OAuth
configuration, encryption secrets, search endpoint and durable volume. Capacity
qualification and public-launch legal review remain outside this change.

## Verified result — 2026-09-12

- Clean `npm ci --ignore-scripts` followed by `node scripts/prepare-travel.mjs` passed.
- Root `npm run check` and the server/web TypeScript checks passed.
- 133 targeted tests passed: 76 core/browser, 45 server and 12 frontend.
- Real agent harness tested with the faux provider: tool calls, state updates,
  persisted transcripts, provider-error propagation and transcript deletion.
- Real HTTP SSE regression passed. Browser verification covered consent/legal,
  invalid/valid key onboarding, places, activities, itinerary, complete download,
  reload, phone navigation and cancellation. Desktop and 390px phone screenshots
  were inspected; chat scrolling was corrected.
- Live Gemini grounding, SearXNG, real Google sign-in and a hosted deployment have
  not been verified. No provider credentials were available in this checkout or
  current environment. `/ready` remains a configuration check, not a live-provider
  test. The Docker definition is prepared; it was not built/run in Docker here.
- Vite packaging succeeds with a size warning for the existing Markdown vendor
  bundle. No capacity changes were included.
