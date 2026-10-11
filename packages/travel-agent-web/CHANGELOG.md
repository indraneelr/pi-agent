# Changelog

## [Unreleased]

### Added
- Google sign-in entry, provider key onboarding, validation, rotation and deletion.
- Stop/retry controls, saved-trip deletion, mobile Chat/My plan navigation and canonical itinerary downloads.

### Fixed
- Suppress repeated final image URLs in destination galleries.
- Add destination photo carousels and expandable sourced reviews; keep activity actions visible while scrolling and show research progress, completion and retries.
- Preserve research messages, serialize selections, recover interrupted runs, render all itinerary activities and keep the chat at the latest response.
- Render photos only from server-owned validation evidence and make legal details available before consent.
- Use the Vite 8 compatible React plugin and the API server's local port.
- Sanitize raw HTML in assistant Markdown so model output cannot inject scripts, iframes, styles or forms ([#6](https://github.com/indraneelr/pi-agent/issues/6)).
