# Travel planner verification — 2026-09-13

The failed Vietnam shortlist was caused by a tool contract mismatch: Gemini supplied numeric `roughDays`, while validation required strings. The tool exposed untyped option cards and returned an error without describing the accepted format. Eight consecutive save attempts failed in the captured session.

## Fixes

- Describe required destination card fields in the tool schema. Accept positive numeric day counts and strings; store numeric values as display text.
- Let valid short durations such as `1 day` pass the checklist transition.
- Normalize Google Maps and Tripadvisor provider labels, including uppercase variants. Keep sourced review themes when optional ratings cannot be verified; omit those ratings and disclose their unavailability.

## Verification

324 distinct automated tests passed across all 30 travel-agent, server, and web test files. Coverage includes save/advance contracts, choices, reviews, image validation and failover, preferences, activities, itinerary and accommodation checks, auth, streaming, cancellation, persistence, export, and the desktop/mobile browser journey. Root `npm run check` passed.

Live verification used an isolated copy of the trip preferences and exactly **12 Gemini HTTP requests**, including grounding calls. A fetch-level cap blocked further requests. No API keys were printed or written into test artifacts.

| Check | Result |
| --- | --- |
| Exact failed shortlist payload, replayed offline | Eight cards saved successfully |
| Fresh Gemini shortlist | Eight cards saved; checklist advanced to selection |
| Real SearxNG image call | Eight validated images returned |
| Live Gemini review research | Revealed provider-name validation failure; exhausted remaining call budget |
| Exact captured review calls after the fix, replayed offline | Reviews saved, invalid ratings omitted, persisted cards reloaded |
| Activities and itinerary with Gemini | Not verified live: request cap reached before these stages |
| Activities, itinerary, export, reload, cancellation, and mobile navigation | Passed with scripted providers in browser/server tests |
| Recovered user trip | Restored its original eight generated cards, advanced to place selection, and verified all eight Select place buttons in the running UI |

Live evidence and request ledger are in `/tmp/wander-live-20260913`; browser screenshots are in `/tmp/wander-qa-20260913`. The initial live reload assertion compared JSON against in-memory `undefined` properties; a corrected JSON-normalized comparison passed. This was a test assertion issue, not a persistence defect.

This establishes the observed fixes and listed checks; it does not establish a fully live Gemini journey through final itinerary or production deployment readiness.
