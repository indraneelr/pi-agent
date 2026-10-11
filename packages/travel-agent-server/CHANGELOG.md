# Changelog

## [Unreleased]

### Added
- Serve the production web bundle from the API origin; validate private-alpha production configuration at startup.
- Expiring auth sessions, verified-email allowlisting, origin checks and real provider key validation.

### Fixed
- Use source IDs for review citations and request eight photos when expanding destination galleries.
- Execute photo requests directly and require activity/review actions to save card data; retry acknowledgements once and report incomplete research explicitly.
- Show actionable provider failures in the planner and log their safe error categories instead of hiding them as unexpected errors.
- Keep SSE connections open after request-body completion; bound generation, support cancellation and retain the run lock until work settles.
- Apply key changes to subsequent runs and remove transcripts when deleting a trip.
- Forward image-validation evidence and every itinerary activity to the browser.
- Authorize travel and credential APIs by matched route so percent-encoded paths can no longer skip sign-in, the allowlist and rate limits ([#6](https://github.com/indraneelr/pi-agent/issues/6)).
- Upgrade fastify to 5.12.5 and @fastify/cors to 11.3.1, and pin patched find-my-way and fast-uri, to clear known router and URL-parsing advisories ([#6](https://github.com/indraneelr/pi-agent/issues/6)).
