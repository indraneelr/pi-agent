# Activity Research Eval Report — Stage 3 Live Runs

Generated: 2026-06-15T12:16:22.598Z
Model: ollama/kimi-k2.6
Search: deterministic eval search stub via live web_search tool calls

## Executive summary

- Activity research runs passing: 3/3
- scoreActivityResearchQuality passing: 3/3
- Scope: Stage 3 selected-place activity research after destination selection.
- Checks: selected-place coverage, 4-6 options per selected place, user theme/preference fit, duration/cost realism, practical tips, and contextual caveats/tradeoffs.

## Results

| Run | Eval | Activities | Counts by place | Status | Duration | Tool calls |
|---|---|---:|---|---|---:|---:|
| act-greece-family-1781525299915 | Stage 3 Greece family activities | 10 | Athens: 5, Naxos: 5 | PASS | 135.9s | 2 |
| act-japan-couple-1781525299915 | Stage 3 Japan couple activities | 10 | Tokyo: 5, Kyoto: 5 | PASS | 142.6s | 2 |
| act-portugal-friends-1781525299915 | Stage 3 Portugal friends activities | 10 | Lisbon: 5, Porto: 5 | PASS | 204.2s | 3 |

## act-greece-family-1781525299915

- Eval: Stage 3 Greece family activities
- Status: PASS
- Active phase after run: research_experiences
- Activities persisted: 10
- Selected places: Athens, Naxos
- Relevant quality axes: destination, beaches, culture, food, logistics, kids, budget, season, trip length, duration, practical tips

### Coverage by axis

| Axis | Activities addressing |
|---|---:|
| destination | 10 |
| beaches | 6 |
| culture | 7 |
| food | 5 |
| logistics | 9 |
| kids | 10 |
| budget | 10 |
| season | 10 |
| trip length | 9 |
| duration | 10 |
| practical tips | 10 |

### Activity scores

- Acropolis Early-Entry Guided Tour + Acropolis Museum Combo (Athens; matched: Athens) — fit 82%, caveat severity medium, axes budget
- Ancient Agora, Hadrian's Library & Plaka Stroll with Café Stops (Athens; matched: Athens) — fit 82%, caveat severity low, axes kids
- National Archaeological Museum (Indoor Visit) (Athens; matched: Athens) — fit 82%, caveat severity medium, axes season
- Evening Family Food Tour in Monastiraki & Psyrri (Athens; matched: Athens) — fit 82%, caveat severity medium, axes food, kids, tripLength
- Flisvos Marina & Edem Beach (Athens Riviera) (Athens; matched: Athens) — fit 82%, caveat severity high, axes season
- Portara Sunset & Kastro (Castle) Quarter Evening Walk (Naxos; matched: Naxos) — fit 91%, caveat severity medium, axes beaches, logistics, kids, season, tripLength
- Agios Prokopios Beach Day with Shallow-Water Swim (Naxos; matched: Naxos) — fit 82%, caveat severity medium, axes logistics, kids, budget, season
- Apiranthos Mountain Village & Taverna Lunch (Naxos; matched: Naxos) — fit 100%, caveat severity high, axes beaches
- Temple of Demeter (Sangri) & Eggares Olive Press Museum (Naxos; matched: Naxos) — fit 100%, caveat severity medium, axes beaches, season, tripLength
- Agia Anna Seafood Dinner & Evening Paddle (Naxos; matched: Naxos) — fit 91%, caveat severity medium, axes logistics, season, tripLength

### Failures: none

## act-japan-couple-1781525299915

- Eval: Stage 3 Japan couple activities
- Status: PASS
- Active phase after run: research_experiences
- Activities persisted: 10
- Selected places: Tokyo, Kyoto
- Relevant quality axes: destination, culture, food, logistics, budget, season, trip length, duration, practical tips

### Coverage by axis

| Axis | Activities addressing |
|---|---:|
| destination | 10 |
| culture | 10 |
| food | 4 |
| logistics | 9 |
| budget | 10 |
| season | 10 |
| trip length | 6 |
| duration | 10 |
| practical tips | 10 |

### Activity scores

- Early Morning Senso-ji Temple & Asakusa Heritage Walk (Tokyo; matched: Tokyo) — fit 78%, caveat severity high, axes culture, logistics, season
- Tsukiji Outer Market Food Tour (Tokyo; matched: Tokyo) — fit 100%, caveat severity medium, axes food, logistics, season
- Meiji Shrine Forest Walk & Yoyogi Park Hanami (Tokyo; matched: Tokyo) — fit 78%, caveat severity medium, axes culture, season
- Tokyo National Museum & Ueno Park Sakura Circuit (Tokyo; matched: Tokyo) — fit 78%, caveat severity medium, axes culture, season
- Shinjuku Golden Gai Izakaya Evening (Tokyo; matched: Tokyo) — fit 100%, caveat severity medium, axes food, logistics, budget, season, tripLength
- Fushimi Inari Taisha Sunrise Torii Gate Hike (Kyoto; matched: Kyoto) — fit 89%, caveat severity high, axes season, tripLength
- Kinkaku-ji (Golden Pavilion) & Ryoan-ji Rock Garden (Kyoto; matched: Kyoto) — fit 89%, caveat severity medium, axes culture, logistics, season, tripLength
- Gion Heritage Walk & Traditional Tea Ceremony (Kyoto; matched: Kyoto) — fit 89%, caveat severity medium, axes logistics, season
- Arashiyama Bamboo Grove & Tenryu-ji Zen Garden (Kyoto; matched: Kyoto) — fit 78%, caveat severity medium, axes culture, logistics, season
- Nishiki Market Food Walk & Nijo Castle (Kyoto; matched: Kyoto) — fit 100%, caveat severity medium, axes food, season

### Failures: none

## act-portugal-friends-1781525299915

- Eval: Stage 3 Portugal friends activities
- Status: PASS
- Active phase after run: research_experiences
- Activities persisted: 10
- Selected places: Lisbon, Porto
- Relevant quality axes: destination, beaches, food, logistics, budget, season, trip length, duration, practical tips

### Coverage by axis

| Axis | Activities addressing |
|---|---:|
| destination | 10 |
| beaches | 3 |
| food | 6 |
| logistics | 8 |
| budget | 10 |
| season | 5 |
| trip length | 8 |
| duration | 10 |
| practical tips | 10 |

### Activity scores

- Alfama Miradouros & Evening Fado Walk (Lisbon; matched: Lisbon) — fit 78%, caveat severity high, axes logistics
- LX Factory Street Art & Time Out Market Food Crawl (Lisbon; matched: Lisbon) — fit 67%, caveat severity medium, axes food, budget, tripLength
- Cascais Beach Day via CP Train (Lisbon; matched: Lisbon) — fit 78%, caveat severity medium, axes logistics, tripLength
- Bairro Alto & Pink Street Nightlife Crawl (Lisbon; matched: Lisbon) — fit 78%, caveat severity medium, axes food, logistics, budget
- Belém Monuments & Pastéis de Belém (Lisbon; matched: Lisbon) — fit 78%, caveat severity medium, axes season
- Ribeira Walk & Dom Luís I Bridge Sunset (Porto; matched: Porto) — fit 89%, caveat severity medium, axes logistics, season
- Vila Nova de Gaia Port Wine Cellar Tasting (Porto; matched: Porto) — fit 67%, caveat severity medium, axes food, budget, tripLength
- Bolhão Market Brunch & Livraria Lello (Porto; matched: Porto) — fit 89%, caveat severity medium, axes budget, season
- Foz do Douro Seaside & Beach Stroll (Porto; matched: Porto) — fit 78%, caveat severity low, axes beaches, logistics, tripLength
- Galerias de Paris Nightlife Strip (Porto; matched: Porto) — fit 78%, caveat severity medium, axes logistics, budget, tripLength

### Failures: none
