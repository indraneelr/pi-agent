# Fresh Travel Agent Eval Report — Post-fix Live Runs

Generated: 2026-06-14T02:17:27.265Z
Model: ollama/kimi-k2.6
Search: deterministic eval search stub

## Executive summary

- Fresh live runs passing: 3/3
- Preference-fit layer passing: 3/3 (cards scored against actual run preferences, not just schema)
- Scope: Stage 2 choice-first destination/place menu guardrails. Later itinerary, flights, activities, and hotels require additional multi-turn evals after selecting places.
- These runs use the current code and fresh session IDs, not the old saved Greece fixtures.

## Results

| Run | Eval | Cards | Unique | Expected | Status | Duration | Tool calls |
|---|---|---:|---:|---|---|---:|---:|
| fresh-greece-family-1781403302559 | E03b country/region place menu | 9 | 9 | 8-10 | PASS | 50.6s | 5 |
| fresh-surprise-couple-1781403302559 | E03 broad surprise shortlist | 4 | 4 | 3-5 | PASS | 30.0s | 3 |
| fresh-long-greece-1781403302559 | E03b long country/region place menu | 12 | 12 | 8-12 | PASS | 64.1s | 3 |

## fresh-greece-family-1781403302559

- Eval: E03b country/region place menu
- Status: PASS
- Active phase after run: shortlist_destinations
- Cards: 9; unique: 9; expected: 8-10
- Next user action: Choose 2–3 places to build your 10-night family itinerary around. If you want a mainland-island mix, pick an easy-access pair like Athens + Corfu/Rhodes/Crete, or select a multi-island Cyclades route with Naxos as your base.
- Names: Athens & Riviera, Naxos (Cyclades), Paros (Cyclades), Crete: Chania & Rethymno region, Corfu (Ionian), Rhodes (Dodecanese), Peloponnese: Nafplio & Costa Navarino, Santorini (Cyclades), Syros (Cyclades)
- Preference fit:
  - Theme coverage: beaches, culture, food, kids
  - Relevant axes: beaches, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length
  - Menu coverage (cards/axis): beaches=9, culture/history=8, food=8, easy logistics=9, family/kids=9, budget=9, season/dates=9, trip length=9
  - Tradeoff severity: high=2, medium=7, low=0
  - - Athens & Riviera: fit 100% [beaches, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches (medium)]
  - - Naxos (Cyclades): fit 100% [beaches, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, easy logistics, season/dates (medium)]
  - - Paros (Cyclades): fit 88% [beaches, food, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, easy logistics (medium)]
  - - Crete: Chania & Rethymno region: fit 100% [beaches, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, easy logistics, trip length (medium)]
  - - Corfu (Ionian): fit 100% [beaches, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, season/dates (medium)]
  - - Rhodes (Dodecanese): fit 88% [beaches, culture/history, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→culture/history, food, season/dates (high)]
  - - Peloponnese: Nafplio & Costa Navarino: fit 100% [beaches, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, easy logistics (medium)]
  - - Santorini (Cyclades): fit 100% [beaches, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, easy logistics, family/kids, budget (high)]
  - - Syros (Cyclades): fit 100% [beaches, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches (medium)]
- Failures: none

## fresh-surprise-couple-1781403302559

- Eval: E03 broad surprise shortlist
- Status: PASS
- Active phase after run: shortlist_destinations
- Cards: 4; unique: 4; expected: 3-5
- Next user action: Choose ONE destination to explore in detail for your 7-night trip.
- Names: Portugal – Lisbon & The Algarve, Sicily – Catania, Syracuse & Taormina, Croatia – Split & The Dalmatian Islands, Southern Spain – Andalusia
- Preference fit:
  - Theme coverage: beaches, culture, food
  - Relevant axes: beaches, culture/history, food, easy logistics, budget, season/dates, trip length
  - Menu coverage (cards/axis): beaches=4, culture/history=4, food=4, easy logistics=4, budget=4, season/dates=4, trip length=4
  - Tradeoff severity: high=0, medium=3, low=1
  - - Portugal – Lisbon & The Algarve: fit 100% [beaches, culture/history, food, easy logistics, budget, season/dates, trip length] [tradeoff→easy logistics, trip length (medium)]
  - - Sicily – Catania, Syracuse & Taormina: fit 100% [beaches, culture/history, food, easy logistics, budget, season/dates, trip length] [tradeoff→beaches, easy logistics, season/dates, trip length (medium)]
  - - Croatia – Split & The Dalmatian Islands: fit 100% [beaches, culture/history, food, easy logistics, budget, season/dates, trip length] [tradeoff→beaches, easy logistics, season/dates (low)]
  - - Southern Spain – Andalusia: fit 100% [beaches, culture/history, food, easy logistics, budget, season/dates, trip length] [tradeoff→beaches, culture/history, easy logistics, trip length (medium)]
- Failures: none

## fresh-long-greece-1781403302559

- Eval: E03b long country/region place menu
- Status: PASS
- Active phase after run: shortlist_destinations
- Cards: 12; unique: 12; expected: 8-12
- Next user action: Choose 3–5 places to build your 17-night itinerary around. A mix of 4–5 bases with short ferry hops or flights works best for families.
- Names: Athens & Riviera, Naxos (Naxos Town & St. George Beach), Paros (Naoussa & Kolymbithres), Crete – Chania & Western Coast, Crete – Heraklion & Rethymno, Santorini (Oia, Fira & Perissa), Milos (Adamantas & Pollonia), Sifnos (Apollonia & Kamares), Hydra (Hydra Town), Corfu (Corfu Town & Paleokastritsa), Rhodes (Rhodes Town & Lindos), Kefalonia (Argostoli & Fiskardo)
- Preference fit:
  - Theme coverage: beaches, culture, kids
  - Relevant axes: beaches, culture/history, easy logistics, family/kids, budget, season/dates, trip length
  - Menu coverage (cards/axis): beaches=12, culture/history=7, easy logistics=12, family/kids=12, budget=12, season/dates=12, trip length=12
  - Tradeoff severity: high=4, medium=7, low=1
  - - Athens & Riviera: fit 100% [beaches, culture/history, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, easy logistics, family/kids (medium)]
  - - Naxos (Naxos Town & St. George Beach): fit 86% [beaches, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→family/kids, season/dates (medium)]
  - - Paros (Naoussa & Kolymbithres): fit 86% [beaches, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, easy logistics, family/kids, season/dates (low)]
  - - Crete – Chania & Western Coast: fit 100% [beaches, culture/history, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, easy logistics, family/kids (medium)]
  - - Crete – Heraklion & Rethymno: fit 100% [beaches, culture/history, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→culture/history, easy logistics, family/kids, season/dates (medium)]
  - - Santorini (Oia, Fira & Perissa): fit 100% [beaches, culture/history, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→easy logistics, family/kids, budget, season/dates (high)]
  - - Milos (Adamantas & Pollonia): fit 86% [beaches, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→easy logistics, family/kids (medium)]
  - - Sifnos (Apollonia & Kamares): fit 86% [beaches, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→easy logistics, family/kids (medium)]
  - - Hydra (Hydra Town): fit 100% [beaches, culture/history, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, easy logistics, family/kids (medium)]
  - - Corfu (Corfu Town & Paleokastritsa): fit 100% [beaches, culture/history, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, easy logistics, family/kids (high)]
  - - Rhodes (Rhodes Town & Lindos): fit 100% [beaches, culture/history, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→easy logistics, family/kids, season/dates (high)]
  - - Kefalonia (Argostoli & Fiskardo): fit 86% [beaches, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, easy logistics, family/kids (high)]
- Failures: none
