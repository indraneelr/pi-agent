# Accommodation & Flight Eval Report — Stage 5 Live Runs

Generated: 2026-06-15T13:23:12.247Z
Model: ollama/kimi-k2.6
Search: deterministic eval search stub via live web_search tool calls

## Executive summary

- Accommodation/flight runs passing: 1/3
- scoreAccommodationFlightResearchQuality passing: 1/3
- Scope: Stage 5 accommodation and flight research after an approved itinerary.
- Checks: overnight-city accommodation coverage, 4-6 lodging areas per city, rates/transport/safety/booking/source evidence, flight option counts, dates, fares, links, caveats, and confidence.

## Results

| Run | Eval | Accommodation counts | Flight options | Status | Duration | Tool calls |
|---|---|---|---:|---|---:|---:|
| af-greece-family-1781528912701 | Stage 5 Greece family accommodation/flights | Athens: 6, Naxos: 6 | 6 | FAIL | 360.0s | 5 |
| af-japan-couple-1781528912701 | Stage 5 Japan couple accommodation/flights | Tokyo: 5, Kyoto: 5 | 6 | PASS | 159.5s | 4 |
| af-portugal-friends-1781528912701 | Stage 5 Portugal friends accommodation/flights | Lisbon: 5, Porto: 5 | 6 | FAIL | 360.0s | 4 |

## af-greece-family-1781528912701

- Eval: Stage 5 Greece family accommodation/flights
- Status: FAIL
- Active phase after run: research_accommodation_flights
- Overnight cities: Athens, Naxos
- Flight options persisted: 6

### Accommodation counts

- Athens: 6
- Naxos: 6

### Failures

- run timed out after 360s
- Flight research is missing caveats/live-data assumptions.

## af-japan-couple-1781528912701

- Eval: Stage 5 Japan couple accommodation/flights
- Status: PASS
- Active phase after run: research_accommodation_flights
- Overnight cities: Tokyo, Kyoto
- Flight options persisted: 6

### Accommodation counts

- Tokyo: 5
- Kyoto: 5

### Failures: none

## af-portugal-friends-1781528912701

- Eval: Stage 5 Portugal friends accommodation/flights
- Status: FAIL
- Active phase after run: research_accommodation_flights
- Overnight cities: Lisbon, Porto
- Flight options persisted: 6

### Accommodation counts

- Lisbon: 5
- Porto: 5

### Failures

- run timed out after 360s
- Flight research is missing caveats/live-data assumptions.
