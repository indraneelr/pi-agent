# Fresh Travel Agent Eval Report — Post-fix Live Runs

Generated: 2026-06-14T12:44:27.441Z
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
| fresh-greece-family-1781440790394 | E03b country/region place menu | 10 | 10 | 8-10 | PASS | 92.7s | 6 |
| fresh-surprise-couple-1781440790394 | E03 broad surprise shortlist | 4 | 4 | 3-5 | PASS | 40.5s | 4 |
| fresh-long-greece-1781440790394 | E03b long country/region place menu | 12 | 12 | 8-12 | PASS | 143.8s | 9 |

## fresh-greece-family-1781440790394

- Eval: E03b country/region place menu
- Status: PASS
- Active phase after run: shortlist_destinations
- Cards: 10; unique: 10; expected: 8-10
- Next user action: Choose 2–4 places to form your 10-night itinerary (for example: Athens + one island, or a direct-flight island only). Let me know your picks and I’ll research detailed activities next.
- Names: Athens, Naxos, Paros, Crete — Chania & Rethymno region, Corfu, Rhodes, Milos, Pelion Peninsula, Sifnos, Thessaloniki
- Preference fit:
  - Theme coverage: beaches, culture, food, kids
  - Relevant axes: beaches, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length
  - Menu coverage (cards/axis): beaches=9, culture/history=8, food=10, easy logistics=10, family/kids=8, budget=10, season/dates=10, trip length=10
  - Tradeoff severity: high=2, medium=6, low=2
  - - Athens: fit 88% [culture/history, food, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→culture/history, easy logistics, family/kids, budget (high)]
  - - Naxos: fit 100% [beaches, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→easy logistics (medium)]
  - - Paros: fit 88% [beaches, food, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, family/kids, season/dates (medium)]
  - - Crete — Chania & Rethymno region: fit 100% [beaches, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→easy logistics, family/kids (medium)]
  - - Corfu: fit 100% [beaches, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→easy logistics (medium)]
  - - Rhodes: fit 100% [beaches, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, easy logistics, family/kids (high)]
  - - Milos: fit 100% [beaches, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, family/kids, trip length (low)]
  - - Pelion Peninsula: fit 75% [beaches, food, easy logistics, budget, season/dates, trip length] [tradeoff→beaches, easy logistics, season/dates (low)]
  - - Sifnos: fit 100% [beaches, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, family/kids (medium)]
  - - Thessaloniki: fit 88% [beaches, culture/history, food, easy logistics, budget, season/dates, trip length] [tradeoff→beaches, easy logistics, trip length (medium)]
- Failures: none

## fresh-surprise-couple-1781440790394

- Eval: E03 broad surprise shortlist
- Status: PASS
- Active phase after run: shortlist_destinations
- Cards: 4; unique: 4; expected: 3-5
- Next user action: Choose 1 destination to continue with detailed activity research and itinerary planning.
- Names: Portugal – Lisbon & the Algarve Coast, Croatia – Dalmatian Coast (Split, Hvar & Makarska), Sicily, Italy – Taormina, Siracusa & the Noto Coast, Greece – Athens & the Cyclades (Naxos or Paros)
- Preference fit:
  - Theme coverage: beaches, culture, food
  - Relevant axes: beaches, culture/history, food, easy logistics, budget, season/dates, trip length
  - Menu coverage (cards/axis): beaches=4, culture/history=4, food=4, easy logistics=4, budget=4, season/dates=4, trip length=4
  - Tradeoff severity: high=0, medium=4, low=0
  - - Portugal – Lisbon & the Algarve Coast: fit 100% [beaches, culture/history, food, easy logistics, budget, season/dates, trip length] [tradeoff→easy logistics, trip length (medium)]
  - - Croatia – Dalmatian Coast (Split, Hvar & Makarska): fit 100% [beaches, culture/history, food, easy logistics, budget, season/dates, trip length] [tradeoff→beaches, easy logistics, trip length (medium)]
  - - Sicily, Italy – Taormina, Siracusa & the Noto Coast: fit 100% [beaches, culture/history, food, easy logistics, budget, season/dates, trip length] [tradeoff→beaches, easy logistics (medium)]
  - - Greece – Athens & the Cyclades (Naxos or Paros): fit 100% [beaches, culture/history, food, easy logistics, budget, season/dates, trip length] [tradeoff→easy logistics, budget, season/dates, trip length (medium)]
- Failures: none

## fresh-long-greece-1781440790394

- Eval: E03b long country/region place menu
- Status: PASS
- Active phase after run: shortlist_destinations
- Cards: 12; unique: 12; expected: 8-12
- Next user action: Choose 3–5 places to continue. With 17 nights, a practical route is 1 mainland stop + 3–4 islands, or 1 open/close in Athens plus 3 islands. Tell me which places catch your eye.
- Names: Athens, Naxos, Paros, Crete — Chania & West Coast, Rhodes, Corfu, Kefalonia, Milos, Sifnos, Syros, Pelion Peninsula, Zakynthos
- Preference fit:
  - Theme coverage: beaches, culture, kids
  - Relevant axes: beaches, culture/history, easy logistics, family/kids, budget, season/dates, trip length
  - Menu coverage (cards/axis): beaches=12, culture/history=6, easy logistics=12, family/kids=11, budget=12, season/dates=12, trip length=12
  - Tradeoff severity: high=4, medium=6, low=2
  - - Athens: fit 100% [beaches, culture/history, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→culture/history, easy logistics, family/kids, season/dates (medium)]
  - - Naxos: fit 100% [beaches, culture/history, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, family/kids, season/dates (low)]
  - - Paros: fit 86% [beaches, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, easy logistics, family/kids, season/dates (low)]
  - - Crete — Chania & West Coast: fit 100% [beaches, culture/history, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, easy logistics, family/kids (medium)]
  - - Rhodes: fit 100% [beaches, culture/history, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→easy logistics, family/kids, budget (high)]
  - - Corfu: fit 100% [beaches, culture/history, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, easy logistics (high)]
  - - Kefalonia: fit 86% [beaches, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→easy logistics, family/kids, budget (high)]
  - - Milos: fit 86% [beaches, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, easy logistics, family/kids (medium)]
  - - Sifnos: fit 86% [beaches, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, easy logistics, family/kids (medium)]
  - - Syros: fit 86% [beaches, culture/history, easy logistics, budget, season/dates, trip length] [tradeoff→beaches, family/kids (medium)]
  - - Pelion Peninsula: fit 86% [beaches, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches (medium)]
  - - Zakynthos: fit 86% [beaches, easy logistics, family/kids, budget, season/dates, trip length] [tradeoff→beaches, family/kids, trip length (high)]
- Failures: none
