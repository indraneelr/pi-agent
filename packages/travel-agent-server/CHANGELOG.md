# Changelog

## [Unreleased]

### Added
- Serve the production web bundle from the API origin; validate private-alpha production configuration at startup.
- Expiring auth sessions, verified-email allowlisting, origin checks and real provider key validation.

### Fixed
- Show actionable provider failures in the planner and log their safe error categories instead of hiding them as unexpected errors.
- Keep SSE connections open after request-body completion; bound generation, support cancellation and retain the run lock until work settles.
- Apply key changes to subsequent runs and remove transcripts when deleting a trip.
- Forward image-validation evidence and every itinerary activity to the browser.
