# Real-key local journey: 2026-10-11

Resolves [#4](https://github.com/indraneelr/pi-agent/issues/4). Branch `feat/travel-agent-production-mvp` at `930ca092`, built with `scripts/prepare-travel.mjs`, server run with `.env` (`AUTH_REQUIRED=false`, server Gemini key, `TRAVEL_AGENT_MODEL=gemini-2.5-flash`, `USE_STAGEHAND=0`, local SearXNG container on `:8888`). The web UI was driven in headless Chrome as a user.

Scenario: Japan, Jakarta origin, 2 adults, 2027-04-12 to 2027-04-17, USD 3000 mid-range, food/temples/nature, moderate pace. Greece and Portugal were not run: the activity-stage blocker below is not destination-specific, so they would stop at the same point.

## Result

Blocked at activity research. Preferences and shortlist work; activities never save, so itinerary and download are unreachable. Retrying fails the same way.

| Stage | Outcome | Wall time |
|---|---|---|
| Preferences (2 turns + confirm) | Works | 5 s, 6 s |
| Place shortlist | Works: 8 cards, 7 with validated photos (0 broken), Miyajima none | 126 s |
| "More places" | New places only in chat text; no cards saved | 36 s |
| Select Kyoto, Nara | Works, instant (no LLM) | <1 s |
| Explore activities | **Fails**: nothing saved, "Retry activity research" | 183 s |
| Retry activity research | **Fails** identically | 90 s |
| Itinerary, download | Not reachable | - |

Usage for this incomplete trip: 30 model calls, 1,506,900 input tokens, 68,742 output tokens, recorded cost $0.62. Late calls carry ~100k input tokens each. The budget plan's target is ~$0.06 per complete trip.

Key access: the key served `gemini-2.5-flash` and `gemini-3.5-flash-lite`, both with Google Search grounding returning grounding chunks.

## Breakages

### Blockers

1. **Activity search budget is the shortlist's budget.** Selecting places is an instant action and does not advance the checklist phase. The activities planner action runs while the phase is still the shortlist, whose search budget the shortlist already spent, so the first activity `web_search` returns "Shortlist research search budget exhausted for this phase". Activity research then runs with no sources (`sources: []`).
2. **Activity quality validator blocks saving indefinitely.** `update_travel_state(activities_research)` rejected 7 consecutive attempts across two runs. The keyword-based axis check rejects reasonable content, for example a Nara deer activity whose tradeoff names "moderate and relaxed pace" fails "tradeoff/caveat does not map to a relevant preference axis", plus "No activity addresses duration/time realism" while each item has a duration. Validation is a hard gate with no bound, so the run ends with nothing saved.

### Major

3. **"More places" does not produce selectable cards.** The button sends "Show me more place options — the current ones don't quite fit." The model calls `go_back_to_phase` to the current phase (tool error), hits the exhausted search budget, fetches images for 8 new places, and then lists them only in chat without calling `save_destination_shortlist`. The prompt also asserts dissatisfaction the user never expressed.
4. **Token growth.** Context grows to ~100k input tokens per call by the activity stage (full transcript replay plus large tool results such as `get_images` JSON). This is the main cost driver.
5. **Failures are opaque in logs.** The stream failure logs `errorCode: "unexpected"` with `err` redacted by the logger config, so the cause is only recoverable from the session transcript.
6. **Photo licensing.** Validated photos came from Pinterest, YouTube thumbnails, Alamy and blogs via SearXNG/Bing. Expected until the Wikimedia-primary provider lands.

### Minor

7. The assistant leaks internal names to the user: `group_type`, "search budget for this phase", `update_travel_state`.
8. Partial preferences from the first message are not shown in the preferences panel until all are confirmed.
9. An extra "ready to move on?" confirmation turn between preferences and shortlist.
10. Phase chips overlap at 1366 px: the "NOW" badge covers "Select Places"; "Flights" runs into step 7. The "Research Accommodation & Flights" phase is listed though booking is out of alpha scope.
11. "Explore activities" is offered before any place is selected.
12. The chat repeats every card's full text (fit, tradeoff, season) already rendered in the plan panel.
13. Empty assistant messages at the end of failed runs (`stop` with no text).
14. Browser console: one 404 (`/favicon.ico`).

## Reproduce

Start SearXNG, run `node scripts/prepare-travel.mjs`, then `node --env-file=.env packages/travel-agent-server/dist/index.js`, open `http://127.0.0.1:3001`, and follow the scenario above. The transcript for this run is in the local `travel-data/sessions/` directory (session `a7924cba-ee25-4251-bc54-98ac67f481d3`, not committed).
