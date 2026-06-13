# Travel Agent Eval Report — Saved Greece Plans

Source files: `packages/travel-agent/travel-data/{5e68423c...,8959f4f0...,e1944d9c...}.json`. These records only contain saved state through Stage 2; later-stage evals are marked not evidenced rather than failed.

## Executive summary

- All 3 runs correctly gathered the core trip preferences and entered the destination-shortlist stage.
- The new choice-first behavior is partially present: each run produced 8-10 Greece place options.
- The outputs are not yet rich enough for the updated Stage 2 eval: they miss rough day allocations, budget/season notes, explicit tradeoffs, image/map evidence, and a visible choose-next prompt in saved output.
- One run has a serious quality bug: duplicate Naxos and an incorrect Naxos description copied from Corfu.
- No saved output reaches activities, flights, hotels, final itinerary, cascade handling, or essential-info stages, so those evals cannot be assessed from these records.

## Scores by saved trip

| Saved trip | Places count | Requirement capture | E03b country/place menu | Main issues |
|---|---:|---:|---:|---|
| 5e68423c | 10 (10 unique) | 7/7 core fields | 3.1/5 | no day allocation; no budget note; no season note; no explicit tradeoffs |
| 8959f4f0 | 9 (9 unique) | 7/7 core fields | 3.9/5 | no budget note; no season note |
| e1944d9c | 8 (7 unique) | 7/7 core fields | 3.0/5 | duplicate place; no day allocation; no budget note; no season note; Naxos text appears copied from Corfu |

## Eval coverage matrix

| Eval | Status from saved outputs | Notes |
|---|---|---|
| E01 Sparse opener | Not evidenced | Saved state starts after preferences are gathered; no question transcript. |
| E02 Rich opener | Partial pass | Core facts are captured, but saved output cannot show whether the agent avoided re-asking. |
| E03 Broad destination shortlist | Not applicable | User already supplied Greece, so E03b is the matching eval. |
| E03b Country/region place menu | Partial fail | Counts are right: 10, 9, 8. Content lacks day allocations, logistics, season/budget notes, explicit tradeoffs, and choose prompt in persisted output. |
| E04 Confirmed destination overview | Not applicable | These are Greece broad-country cases, not a narrow confirmed city/beach case. |
| E05 Activities | Not reached | `activitiesResearch` is null in all 3 records. |
| E06 Flights | Not reached | `flightResearch` is null in all 3 records. |
| E07 Accommodation | Not reached | `accommodationResearch` is null in all 3 records. |
| E08 Final itinerary/budget | Not reached | `itineraryResearch` is null in all 3 records. |
| E09-E10 Cascade | Not evidenced | No change/cascade transcript in these files. |
| E11 Essential info | Not evidenced | No visa/safety/currency section persisted. |
| E12 Constraint stress | Not evidenced | Family/kid info is used lightly, but no stress revision. |
| E13 Impossible budget | Not applicable | Budget is plausible. |
| E14 Multi-turn memory | Not evidenced | No transcript/correction flow. |
| E15 Web UI shape | Partial fail | Data is structured JSON, but option cards are too thin and lack selection metadata/tradeoffs. |

## Recommended fixes

1. Upgrade Stage 2 destination objects to a strict card schema: `name`, `bestFor`, `why`, `highlights`, `roughDays`, `logisticsFit`, `budgetFit`, `seasonNote`, `tradeoff`, `imageQuery`, `selected=false`.
2. Add validation before saving: 8-10 unique places for broad country/region; reject duplicate names and suspicious copied descriptions.
3. Persist a `nextUserAction` field like `choose 3-4 places to continue`, so the web UI can render the stage gate.
4. Include budget and season notes using live/search/weather where needed, or mark as estimates.
5. Add automated regression tests using these three files as fixtures, with E03b assertions.
