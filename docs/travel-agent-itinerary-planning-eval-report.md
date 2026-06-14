# Itinerary Planning Eval Report — Stage 4 Live Runs

Generated: 2026-06-14T03:14:47.661Z
Model: ollama/kimi-k2.6
Search: deterministic eval search stub via live web_search tool calls

## Executive summary

- Itinerary planning runs passing: 3/3
- scoreItineraryResearchQuality passing: 3/3
- Scope: Stage 4 day-by-day itinerary planning after selected places and approved activities.
- Checks: selected-place coverage, approved activity usage, date sequence, daily load, logistics, budget, season/date caveats, and trip-length realism.

## Results

| Run | Eval | Days | Selected places | Status | Duration | Tool calls |
|---|---|---:|---|---|---:|---:|
| itin-greece-family-1781406563957 | Stage 4 Greece family itinerary | 11 | Athens + Naxos | PASS | 105.4s | 2 |
| itin-japan-couple-1781406563957 | Stage 4 Japan couple itinerary | 10 | Tokyo + Kyoto | PASS | 90.1s | 2 |
| itin-portugal-friends-1781406563957 | Stage 4 Portugal friends itinerary | 8 | Lisbon + Porto | PASS | 128.1s | 2 |

## itin-greece-family-1781406563957

- Eval: Stage 4 Greece family itinerary
- Status: PASS
- Active phase after run: plan_itinerary
- Days persisted: 11
- Selected places: Athens, Naxos
- Relevant quality axes: date sequence, selected places, approved activities, daily load, easy logistics, budget, season/dates, trip length, beaches, food, culture/history, family/kids
- Approved activities matched: 6

### Coverage by axis

| Axis | Days addressing |
|---|---:|
| date sequence | 11 |
| selected places | 11 |
| approved activities | 5 |
| daily load | 11 |
| easy logistics | 11 |
| budget | 3 |
| season/dates | 11 |
| trip length | 11 |
| beaches | 6 |
| food | 9 |
| culture/history | 4 |
| family/kids | 7 |

### Day scores

1. 2026-06-20 — Athens: 2 activities, 4h; selected places: Athens; approved activities: 0
2. 2026-06-21 — Athens: 3 activities, 7h; selected places: Athens; approved activities: 2
3. 2026-06-22 — Athens: 3 activities, 7h; selected places: Athens; approved activities: 1
4. 2026-06-23 — Naxos: 3 activities, 8h; selected places: Naxos; approved activities: 0
5. 2026-06-24 — Naxos: 3 activities, 7.5h; selected places: Naxos; approved activities: 1
6. 2026-06-25 — Naxos: 3 activities, 7h; selected places: Naxos; approved activities: 1
7. 2026-06-26 — Naxos: 3 activities, 6h; selected places: Naxos; approved activities: 1
8. 2026-06-27 — Naxos: 2 activities, 5.5h; selected places: Naxos; approved activities: 0
9. 2026-06-28 — Athens: 3 activities, 8h; selected places: Athens, Naxos; approved activities: 0
10. 2026-06-29 — Athens: 3 activities, 7h; selected places: Athens; approved activities: 0
11. 2026-06-30 — Athens: 1 activities, 3h; selected places: Athens; approved activities: 0

### Failures: none

## itin-japan-couple-1781406563957

- Eval: Stage 4 Japan couple itinerary
- Status: PASS
- Active phase after run: plan_itinerary
- Days persisted: 10
- Selected places: Tokyo, Kyoto
- Relevant quality axes: date sequence, selected places, approved activities, daily load, easy logistics, budget, season/dates, trip length, food, culture/history
- Approved activities matched: 6

### Coverage by axis

| Axis | Days addressing |
|---|---:|
| date sequence | 10 |
| selected places | 10 |
| approved activities | 4 |
| daily load | 10 |
| easy logistics | 10 |
| budget | 10 |
| season/dates | 9 |
| trip length | 9 |
| food | 8 |
| culture/history | 7 |

### Day scores

1. 2026-04-05 — Tokyo: 2 activities, 5h; selected places: Tokyo; approved activities: 0
2. 2026-04-06 — Tokyo: 3 activities, 7h; selected places: Tokyo; approved activities: 1
3. 2026-04-07 — Tokyo: 3 activities, 7h; selected places: Tokyo; approved activities: 2
4. 2026-04-08 — Tokyo: 2 activities, 6h; selected places: Tokyo, Kyoto; approved activities: 0
5. 2026-04-09 — Tokyo → Kyoto: 3 activities, 7h; selected places: Tokyo, Kyoto; approved activities: 0
6. 2026-04-10 — Kyoto: 3 activities, 7h; selected places: Kyoto; approved activities: 2
7. 2026-04-11 — Kyoto: 3 activities, 7h; selected places: Kyoto; approved activities: 1
8. 2026-04-12 — Kyoto: 3 activities, 8h; selected places: Kyoto; approved activities: 0
9. 2026-04-13 — Kyoto: 2 activities, 7h; selected places: Kyoto; approved activities: 0
10. 2026-04-14 — Kyoto / Departure: 1 activities, 4h; selected places: Tokyo, Kyoto; approved activities: 0

### Failures: none

## itin-portugal-friends-1781406563957

- Eval: Stage 4 Portugal friends itinerary
- Status: PASS
- Active phase after run: plan_itinerary
- Days persisted: 8
- Selected places: Lisbon, Porto
- Relevant quality axes: date sequence, selected places, approved activities, daily load, easy logistics, budget, season/dates, trip length, beaches, food
- Approved activities matched: 6

### Coverage by axis

| Axis | Days addressing |
|---|---:|
| date sequence | 8 |
| selected places | 8 |
| approved activities | 5 |
| daily load | 8 |
| easy logistics | 8 |
| budget | 6 |
| season/dates | 8 |
| trip length | 8 |
| beaches | 2 |
| food | 7 |

### Day scores

1. 2026-09-10 — Lisbon: 2 activities, 0h; selected places: Lisbon, Porto; approved activities: 0
2. 2026-09-11 — Lisbon: 2 activities, 0h; selected places: Lisbon; approved activities: 1
3. 2026-09-12 — Lisbon / Cascais: 2 activities, 0h; selected places: Lisbon; approved activities: 1
4. 2026-09-13 — Lisbon: 2 activities, 0h; selected places: Lisbon, Porto; approved activities: 1
5. 2026-09-14 — Lisbon → Porto: 2 activities, 0h; selected places: Lisbon, Porto; approved activities: 0
6. 2026-09-15 — Porto: 3 activities, 0h; selected places: Porto; approved activities: 2
7. 2026-09-16 — Porto / Matosinhos: 3 activities, 0h; selected places: Porto; approved activities: 1
8. 2026-09-17 — Porto: 1 activities, 0h; selected places: Lisbon, Porto; approved activities: 0

### Failures: none
