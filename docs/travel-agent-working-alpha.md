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
