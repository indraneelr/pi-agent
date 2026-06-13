# Wander Travel Agent Evaluation Plan

Purpose: verify that the travel-planning agent follows `travel-agent-instructions.md` correctly and responds fast enough for a web UI. These evals are designed to catch behavior gaps before commercialization: missing requirement gathering, hallucinated current data, over-packed itineraries, weak budget math, poor cascade handling, and excessive latency.

## Success gates

Recommended launch gates for the first web prototype:

- **Functional correctness:** >= 85% total weighted score across the eval suite.
- **Critical failures:** 0 on safety/current-data/budget-hard-limit cases.
- **Latency:** p50 <= 8s, p90 <= 20s for normal turns; p90 <= 45s for tool-heavy itinerary/final-plan turns.
- **Tool discipline:** 100% of current prices, visa rules, travel advisories, flight/hotel availability, and weather claims are grounded through the relevant live-data tool or clearly marked as estimates.
- **Conversation quality:** no more than 2-3 batched questions in a requirements turn; no unnecessary re-asking of facts already provided.
- **Choice-first UX:** every major stage presents enough options to browse and choose, without overwhelming users: 3-5 broad destinations, 8-10 places inside a chosen country/region, 4-6 activities per selected place, 4-6 flights, and 4-6 hotels per overnight location when available.

## Scoring rubric

Score each case from 0-5 on the dimensions below, then apply the case weight.

| Dimension | What to check |
|---|---|
| Stage compliance | Uses the required staged workflow: requirements -> overview -> activities -> flights -> stays -> final itinerary. |
| Requirement handling | Captures mandatory fields before moving on: dates/window, origin, group composition, budget/currency, destination intent. |
| Assumptions/defaults | Uses safe defaults only for optional fields and explicitly mentions them. |
| Grounding/tool use | Uses live/search/place/weather tools for mutable facts and real venues; does not invent availability/prices/rules. |
| Plan quality | Output is practical, coherent, not over-packed, with transit/downtime and user constraints respected. |
| Option quality | Provides multiple curated choices at each stage, with clear labels/tradeoffs, then asks the user to choose before locking downstream dependencies. |
| Budget correctness | Adds up; includes flights, stays, intra-trip transport, activities, food, and 10-15% buffer where relevant. |
| Cascade behavior | When earlier choices change, explicitly identifies stale downstream sections and re-proposes updates. |
| UX/tone | Collaborative, concise, clear; avoids walls of text unless producing the final plan. |
| Latency | Meets case-specific time budget. |

Critical failure examples: leaves requirements stage without mandatory info, skips the required choice stage for destinations/places/activities/flights/stays, invents visa/flight/hotel prices as current, gives unsafe/infeasible advice, ignores a hard constraint such as mobility/diet/budget, or silently fails to cascade after a change.

## Eval suite

### E01 — Sparse opener: must ask clustered requirement questions
- **Prompt:** `Plan me a 10 day trip somewhere warm.`
- **Expected:** Does not generate destinations yet. Asks for missing mandatory fields in 2-3 grouped questions: origin, dates/window, group, budget/currency, destination intent/preferences. May mention optional defaults only if useful.
- **Checks:** no premature itinerary; no one-question drip; latency <= 8s.
- **Weight:** 8

### E02 — Rich opener: infer facts and ask only gaps
- **Prompt:** `We are a couple flying from Berlin, want 12 days in Japan in April, budget €6500 total, love food, gardens, light hiking, mid-range hotels.`
- **Expected:** Confirms inferred requirements, asks only missing/unclear items such as exact/flexible dates and passport nationality if visa context is needed. Does not re-ask origin, group, budget, or interests.
- **Checks:** inference quality; minimal friction; latency <= 8s.
- **Weight:** 8

### E03 — Broad destination shortlist with inspiration
- **Setup:** User provides all Stage 1 requirements and says destination intent is `surprise me with options`.
- **Expected:** Produces 3-5 candidate destinations with why each fits, option labels/tradeoffs, weather/season notes, rough budget fit, and what kind of traveler each option suits. Uses live/weather/search where claims are date-sensitive. Asks the user to choose one before drilling into places.
- **Checks:** options are distinct; not too few/not a dump; no over-commitment to exact current prices without search; latency <= 20s.
- **Weight:** 8

### E03b — Country/region place menu
- **Prompt:** `We want Greece for 12 days from Berlin in September, couple, €5000 total, beaches, food, ruins, not too rushed.`
- **Expected:** Treats Greece as a broad destination and produces 8-10 candidate places/islands/regions to choose from before activities. Each option has a compact reason-to-go, best-for label, rough day allocation, logistical fit, budget/season note, and tradeoff. Does not jump directly to a fixed itinerary.
- **Checks:** 8-10 Greece places; clear choice prompt; practical grouping hints; latency <= 25s.
- **Weight:** 10

### E04 — Confirmed destination overview with local choices
- **Prompt:** `Origin NYC, family of 4 with kids 8 and 11, 7 days, August 3-10, $9000 total, confirmed destination: Lisbon and nearby beaches.`
- **Expected:** Moves to Stage 2 after confirming enough requirements. Provides trip theme plus a curated set of local choices: Lisbon bases/neighborhoods and nearby beach/day-trip places, ideally 6-8 total because this is a narrower confirmed destination. Each option should have a family-fit label, season note, rough day allocation, and tradeoff. Flags optional defaults used and asks the user to pick/approve places before detailed activities.
- **Checks:** family appropriateness; enough local options without overwhelming; dates/budget retained; latency <= 20s.
- **Weight:** 7

### E05 — Activities: option menu before locking itinerary
- **Setup:** User has selected specific places from Stage 2.
- **Prompt:** `Give me activities and experiences for the trip.`
- **Expected:** Uses places search for specific attractions/restaurants/experiences. For each selected place, offers 4-6 activity options grouped by theme/practicality with recommended picks, duration/cost estimates, booking notes, accessibility/child/mobility relevance where applicable. Asks the user to choose/approve the activity set before locking the final day-by-day schedule. Avoids stuffing more than 1-2 major activities/day unless requested.
- **Checks:** real places; 4-6 options per selected place where possible; choice gate present; practical pacing; latency <= 35s.
- **Weight:** 10

### E06 — Flights: current-data discipline and enough choice
- **Prompt:** `Find flights for those dates and tell me the best options.`
- **Expected:** Uses web/search/flight-capable source before stating current prices or schedules. Shows 4-6 options when available, covering cheapest, fastest, best timing, best comfort/directness, and flexible-date/nearby-airport alternative where relevant. Includes airline/route, departure/arrival, layovers, rough/current price with timestamp/source caveat, baggage caveats, tradeoff, and recommendation.
- **Checks:** no hallucinated current data; enough options without exhaustive dumping; acknowledges availability can change; latency <= 45s.
- **Weight:** 10

### E07 — Accommodation: location-aware, availability-aware, enough choice
- **Prompt:** `Suggest hotels for this plan.`
- **Expected:** Uses places/search for real hotels and availability/price hints. Recommends 4-6 stays per overnight location when possible, including requested tier plus smart save/splurge alternatives. Shows neighborhood fit, proximity to planned activities/transit, room configuration fit, estimated price, standout features, and honest tradeoffs.
- **Checks:** real hotels; 4-6 options where possible; respects tier/budget/group; latency <= 45s.
- **Weight:** 9

### E08 — Final itinerary and budget reconciliation
- **Prompt:** `Now make the final itinerary and budget.`
- **Expected:** Only reaches this stage after the user has chosen/approved places, activities, flights/deferment, and stays/deferment. Produces day-by-day morning/afternoon/evening plan with transit, meals, check-in/out, downtime; door-to-door inter-city transport; budget breakdown with per-person and group totals; 10-15% buffer; map-view requirement noted or generated when map tool exists. If budget does not fit, proposes 2-3 specific cuts.
- **Checks:** respects prior choices; arithmetic; feasibility; no overpacking; latency <= 45s.
- **Weight:** 12

### E09 — Cascade: date change
- **Setup:** A full plan exists.
- **Prompt:** `Actually shift the trip two weeks later.`
- **Expected:** Explicitly says which sections are stale: flights, stays, weather/season notes, festivals/events, prices. Re-proposes the update path and updates/recomputes affected sections instead of silently keeping old details.
- **Checks:** cascade map followed; no stale prices/dates retained; latency <= 20s for diagnosis, <= 45s if recomputing.
- **Weight:** 10

### E10 — Cascade: budget reduction
- **Setup:** A full plan exists.
- **Prompt:** `Can we cut the budget by 30% but keep the same dates?`
- **Expected:** Identifies stale sections: stay tier, flight class/options, activity selection, food/transport assumptions. Offers specific cuts with estimated savings and preserves non-negotiable constraints.
- **Checks:** budget math; honest tradeoffs; latency <= 30s.
- **Weight:** 8

### E11 — Essential information: visa/safety/currency/current rules
- **Prompt:** `What do I need to know for visa, currency, safety, emergency contacts, local customs, and getting around? I have a German passport.`
- **Expected:** Uses web/search before giving current visa/safety/advisory/rule claims. Covers visa/passport, currency and payment norms, safety, emergency numbers, local transport, health/accessibility, cultural notes, and source/date caveats.
- **Checks:** current-data grounding; no unsupported legal certainty; latency <= 35s.
- **Weight:** 8

### E12 — Constraint stress: accessibility + dietary + kids
- **Prompt:** `Revise the plan: one traveler uses a wheelchair, one is vegetarian, and we need kid-friendly evenings.`
- **Expected:** Cascades impacts to activities, restaurants, daily transport, hotels/room choices, and pacing. Recommends accessible routes/venues only when grounded or marked as needing verification. Keeps evenings low-stress/family-friendly.
- **Checks:** hard constraints respected; avoids invented accessibility guarantees; latency <= 35s.
- **Weight:** 10

### E13 — Refusal/redirect for impossible budget
- **Prompt:** `Plan 14 days in Switzerland for 5 people from San Francisco in peak ski season for $2000 total. Make it luxury.`
- **Expected:** Politely says the constraints conflict, explains why, and offers realistic alternatives: increase budget, reduce duration/group costs, choose cheaper destination, switch season/tier. Does not fabricate a fitting luxury plan.
- **Checks:** honesty; actionable alternatives; latency <= 10s.
- **Weight:** 7

### E14 — Multi-turn memory and no fact loss
- **Flow:** User gives requirements across 4-5 turns, corrects one fact, then asks for a shortlist.
- **Expected:** Maintains the latest facts, discards corrected old facts, summarizes accurately before moving stages.
- **Checks:** state retention; correction handling; latency p90 <= 12s per turn.
- **Weight:** 8

### E15 — Web UI response-shape contract
- **Prompt:** Run representative Stage 2, Stage 3, and Stage 6 requests through the web interface adapter.
- **Expected:** Response is structured enough for UI rendering: stable sections, option cards/lists where expected, selection prompts, machine-readable metadata if the app requires it, no raw tool traces, no markdown tables if the UI cannot render them cleanly. Option-heavy stages should remain compact and scannable.
- **Checks:** renderability; option-card consistency; no broken JSON/metadata; latency includes adapter overhead.
- **Weight:** 8

## Automation recommendation

Use a two-layer eval harness:

1. **Deterministic assertions** for cheap checks: required fields asked, no premature stage advance, number of questions, presence of budget categories, stale-section names after cascade, arithmetic consistency, response-time thresholds.
2. **LLM-as-judge or reviewer rubric** for qualitative checks: itinerary feasibility, tone, tradeoff quality, adequacy of recommendations, and whether constraints were honored.

Log for every run:

- prompt and conversation state
- agent response
- tool calls and sources used
- latency: total, model, tool time
- token/cost estimate
- pass/fail + rubric scores
- failure tags, e.g. `missing_requirement`, `ungrounded_current_fact`, `bad_budget_math`, `overpacked_day`, `cascade_missed`, `slow_turn`

## Code-change trigger policy

After each eval run, make code or prompt changes when any of these occur:

- Any critical failure appears twice or once in a high-risk category: visa/safety/current price/budget hard limit.
- Weighted score < 85% overall or < 4/5 on any core stage case E01-E09, including the new place-menu case E03b.
- p90 latency exceeds the target by > 25% for two consecutive runs.
- The same failure tag appears in >= 20% of cases.

Prioritize fixes in this order: orchestration/state bugs, tool grounding bugs, budget/arithmetic bugs, cascade bugs, then tone/format polish.
