# Activity Research Eval Report — Stage 3 Live Runs

Generated: 2026-06-14T02:43:06.627Z
Model: ollama/kimi-k2.6
Search: deterministic eval search stub

## Executive summary

- Activity research runs passing: 3/3
- scoreActivityResearchQuality passing: 3/3 (activities scored against actual preferences, selected destinations, and contextual tradeoffs)
- Scope: Stage 3 selected-place activity/experience research. Verifies persisted activitiesResearch quality, not just schema shape.
- Checks: wrong destinations, low preference fit, missing logistics/time/budget/season caveats, non-contextual tradeoffs, thin/generic cards.

## Results

| Run | Eval | Activities | Selected places | Status | Duration | Tool calls |
|---|---|---:|---|---|---:|---:|
| act-greece-family-1781404777006 | Stage 3 Greece family activities | 12 | Athens + Naxos | PASS | 56.9s | 4 |
| act-japan-couple-1781404777006 | Stage 3 Japan couple activities | 12 | Tokyo + Kyoto | PASS | 73.6s | 5 |
| act-portugal-friends-1781404777006 | Stage 3 Portugal friends activities | 12 | Lisbon + Porto | PASS | 79.1s | 5 |

## act-greece-family-1781404777006

- Eval: Stage 3 Greece family activities
- Status: PASS
- Active phase after run: research_experiences
- Activities persisted: 12
- Selected places: Athens, Naxos
- Relevant quality axes: selected destination, beaches, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length, duration/time realism, practical tips/caveats

### Per-activity scores

1. **Acropolis & Parthenon Early-Entry Family Visit** — Acropolis Hill, Athens → matched: Athens
   - Fit: 73% [addressed: selected destination, culture/history, easy logistics, family/kids, budget, season/dates, duration/time realism, practical tips/caveats]
   - Missing axes: beaches, food, trip length
   - Tradeoff: medium → family/kids, season/dates | "If your children are sensitive to heat or crowds, note that even early slots can involve sun exposure with limited shade…"
2. **Acropolis Museum Family Discovery Tour** — Acropolis Museum, Dionysiou Areopagitou 15, Athens → matched: Athens
   - Fit: 82% [addressed: selected destination, culture/history, easy logistics, family/kids, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: beaches, food
   - Tradeoff: medium → season/dates | "However, weekends in June can see school groups, so weekday mornings offer calmer exploration"
3. **Athens Riviera Beach Afternoon at Vouliagmeni** — Vouliagmeni Beach, Athens Riviera (approx 20 km from city center) → matched: Athens
   - Fit: 100% [addressed: selected destination, beaches, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: none
   - Tradeoff: medium → easy logistics, budget, trip length | "Public buses run regularly but take 45–60 min each way with transfers—factor this logistics cost against limited Athens …"
4. **Plaka & Anafiotika Evening Food & Myth Walk** — Plaka & Anafiotika, central Athens → matched: Athens
   - Fit: 91% [addressed: selected destination, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: beaches
   - Tradeoff: medium → easy logistics, budget | "Self-guiding this walk keeps costs low and pacing flexible for an 8-year-old’s energy, but you miss storytelling context"
5. **Cape Sounion & Temple of Poseidon Sunset Trip** — Cape Sounion, Temple of Poseidon (approx 70 km from Athens center) → matched: Athens
   - Fit: 91% [addressed: selected destination, beaches, culture/history, easy logistics, family/kids, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: food
   - Tradeoff: high → easy logistics | "This is a significant logistics tradeoff: the drive is 1"
6. **National Gardens Play & Zappeion Stroll** — National Gardens, Leoforos Amalias, central Athens → matched: Athens
   - Fit: 82% [addressed: selected destination, culture/history, easy logistics, family/kids, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: beaches, food
   - Tradeoff: medium → culture/history, family/kids, budget, trip length | "The easiest zero-cost buffer in your Athens schedule, but it offers limited cultural depth—trade this in only if your ki…"
7. **Agios Prokopios & Agia Anna Beach Day** — Agios Prokopios Beach, Naxos (5 km from Naxos Town/Chora) → matched: Naxos
   - Fit: 100% [addressed: selected destination, beaches, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: none
   - Tradeoff: medium → culture/history, trip length | "With 10 nights total and likely 5-6 nights on Naxos, dedicating a full day to the beach is sensible, but it means tradin…"
8. **Naxos Old Town (Chora) Castle & Port Walk** — Naxos Chora (Naxos Town) → matched: Naxos
   - Fit: 91% [addressed: selected destination, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: beaches
   - Tradeoff: medium → easy logistics, family/kids, season/dates | "The Portara sunset is iconic but draws Instagram crowds in June evenings—go at 09:00 for peaceful family photos and easi…"
9. **Temple of Demeter & Sangri Countryside Visit** — Sangri, Naxos interior (approx 10 km from Chora) → matched: Athens
   - Fit: 91% [addressed: selected destination, beaches, culture/history, easy logistics, family/kids, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: food
   - Tradeoff: medium → beaches, culture/history, easy logistics, family/kids, budget, season/dates, trip length | "Public buses to Sangri are infrequent (2-3 daily in June), so you will need a rental car or taxi, adding daily logistics…"
10. **Hands-On Greek Cooking Class in a Village Home** — Village location near Naxos Chora (e.g., Galini or Eggares) → matched: Naxos
   - Fit: 100% [addressed: selected destination, beaches, culture/history, food, easy logistics, family/kids, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: none
   - Tradeoff: low → food, budget, trip length | "For a mid-range 10-night budget, one splurge activity is manageable, but booking two cooking classes would strain funds"
11. **Apeiranthos Village & Mount Zas Base Walk** — Apeiranthos & Mount Zas base, Naxos interior (approx 25 km from Chora) → matched: Naxos
   - Fit: 82% [addressed: selected destination, culture/history, easy logistics, family/kids, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: beaches, food
   - Tradeoff: medium → trip length | "The mountain road from Chora to Apeiranthos is winding and takes 40-45 minutes—factor this against limited Naxos nights …"
12. **Koufonisia Day Boat Excursion** — Koufonisia islands (depart from Naxos Port / Chora) → matched: Naxos
   - Fit: 91% [addressed: selected destination, beaches, food, easy logistics, family/kids, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: culture/history
   - Tradeoff: high → budget, trip length | "This is the most expensive single day of your 10-night trip, so consider it a splurge against your EUR 6,500 mid-range t…"

### Coverage by axis

| Axis | Activities addressing |
|---|---:|
| selected destination | 12 |
| beaches | 6 |
| culture/history | 11 |
| food | 6 |
| easy logistics | 12 |
| family/kids | 12 |
| budget | 12 |
| season/dates | 12 |
| trip length | 11 |
| duration/time realism | 12 |
| practical tips/caveats | 12 |

### Tradeoff severity summary

- High: 2, Medium: 9, Low: 1

### Failures: none

## act-japan-couple-1781404777006

- Eval: Stage 3 Japan couple activities
- Status: PASS
- Active phase after run: research_experiences
- Activities persisted: 12
- Selected places: Tokyo, Kyoto
- Relevant quality axes: selected destination, culture/history, food, easy logistics, budget, season/dates, trip length, duration/time realism, practical tips/caveats

### Per-activity scores

1. **Tsukiji Outer Market Food Walk & Sushi Breakfast** — Tsukiji, Chuo City, Tokyo → matched: Tokyo
   - Fit: 100% [addressed: selected destination, culture/history, food, easy logistics, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: none
   - Tradeoff: medium → food, budget | "Budget tradeoff: the market is free to enter, but tastings add up quickly against a mid-range budget—set a cash limit be…"
2. **Senso-ji Temple & Nakamise-dori Morning Visit** — Asakusa, Taito City, Tokyo → matched: Tokyo
   - Fit: 78% [addressed: selected destination, culture/history, easy logistics, budget, season/dates, duration/time realism, practical tips/caveats]
   - Missing axes: food, trip length
   - Tradeoff: high → easy logistics, season/dates | "Season/dates caveat: visit at dawn (around 6:00–7:00 AM) to avoid tour-bus queues that swell after 9:00 AM in April"
3. **Shibuya Crossing to Harajuku Culture Walk** — Shibuya to Harajuku, Tokyo → matched: Tokyo
   - Fit: 89% [addressed: selected destination, culture/history, easy logistics, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: food
   - Tradeoff: medium → culture/history, easy logistics, budget, trip length | "Trip-length caveat: the route covers roughly 3 km across two distinct wards; budget at least 4 hours or you will rush pa…"
4. **teamLab Planets TOKYO Digital Art Experience** — Toyosu, Koto City, Tokyo → matched: Tokyo
   - Fit: 67% [addressed: selected destination, culture/history, budget, season/dates, duration/time realism, practical tips/caveats]
   - Missing axes: food, easy logistics, trip length
   - Tradeoff: medium → budget | "Budget tradeoff: at ~$30 per person, this is a mid-range splurge compared with free shrines and parks"
5. **Meiji Shrine & Yoyogi Park Spring Stroll** — Shibuya / Harajuku, Tokyo → matched: Tokyo
   - Fit: 89% [addressed: selected destination, culture/history, easy logistics, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: food
   - Tradeoff: medium → easy logistics, season/dates, trip length | "go on a weekday morning to preserve logistics time for afternoon activities"
6. **Izakaya Hopping & Ramen Masterclass in Shinjuku** — Shinjuku, Tokyo → matched: Tokyo
   - Fit: 89% [addressed: selected destination, culture/history, food, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: easy logistics
   - Tradeoff: medium → budget | "The price is a mid-range stretch—one alternative is to self-guide izakaya hopping for a fraction of the cost and skip th…"
7. **Fushimi Inari Shrine Dawn Summit Hike** — Fushimi Ward, Kyoto → matched: Kyoto
   - Fit: 78% [addressed: selected destination, culture/history, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: food, easy logistics
   - Tradeoff: medium → trip length | "Factor the early alarm against your limited 9-night schedule"
8. **Kinkaku-ji & Ryoan-ji Temple Morning Circuit** — Kita Ward, Kyoto → matched: Kyoto
   - Fit: 89% [addressed: selected destination, culture/history, easy logistics, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: food
   - Tradeoff: medium → culture/history, budget, trip length | "The entry fees are modest, but the transit time eats into a packed culture-heavy day—pairing these two already demands a…"
9. **Gion District Evening Walk & Kaiseki Dinner** — Higashiyama Ward, Kyoto → matched: Kyoto
   - Fit: 89% [addressed: selected destination, culture/history, food, easy logistics, budget, season/dates, duration/time realism, practical tips/caveats]
   - Missing axes: trip length
   - Tradeoff: medium → budget | "Budget tradeoff: a full kaiseki dinner runs $120–$160 per person, which consumes a large share of your daily mid-range b…"
10. **Arashiyama Bamboo Grove & Tenryu-ji Temple** — Arashiyama, Ukyo Ward, Kyoto → matched: Kyoto
   - Fit: 89% [addressed: selected destination, culture/history, easy logistics, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: food
   - Tradeoff: medium → easy logistics, budget, season/dates | "Logistics + trip-length + season/dates caveat: the bamboo path is free but claustrophobically crowded in April"
11. **Nishiki Market 'Kyoto's Kitchen' Food Tour** — Nakagyo Ward, Kyoto → matched: Kyoto
   - Fit: 78% [addressed: selected destination, culture/history, food, budget, season/dates, duration/time realism, practical tips/caveats]
   - Missing axes: easy logistics, trip length
   - Tradeoff: medium → budget, season/dates | "Budget + season/dates caveat: free to enter, but samples of yuba, pickles, and matcha treats accumulate to $20–$35 per p…"
12. **Traditional Tea Ceremony in a Machiya Townhouse** — Central / Higashiyama area, Kyoto → matched: Kyoto
   - Fit: 100% [addressed: selected destination, culture/history, food, easy logistics, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: none
   - Tradeoff: medium → budget, season/dates, trip length | "Trip-length + budget + season/dates caveat: a formal session lasts roughly 45 minutes, but with travel to a machiya town…"

### Coverage by axis

| Axis | Activities addressing |
|---|---:|
| selected destination | 12 |
| culture/history | 12 |
| food | 5 |
| easy logistics | 8 |
| budget | 12 |
| season/dates | 12 |
| trip length | 8 |
| duration/time realism | 12 |
| practical tips/caveats | 12 |

### Tradeoff severity summary

- High: 1, Medium: 11, Low: 0

### Failures: none

## act-portugal-friends-1781404777006

- Eval: Stage 3 Portugal friends activities
- Status: PASS
- Active phase after run: research_experiences
- Activities persisted: 12
- Selected places: Lisbon, Porto
- Relevant quality axes: selected destination, beaches, food, easy logistics, budget, season/dates, trip length, duration/time realism, practical tips/caveats

### Per-activity scores

1. **Alfama & Mouraria Evening Food Crawl** — Alfama and Mouraria districts, Lisbon → matched: Lisbon
   - Fit: 89% [addressed: selected destination, food, easy logistics, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: beaches
   - Tradeoff: medium → food, budget | "At €55 per person it covers most tastings, which fits your food theme and budget, but it replaces a full sit-down dinner"
2. **Belém Historic Walk & Pastéis de Belém** — Belém, Lisbon → matched: Lisbon
   - Fit: 100% [addressed: selected destination, beaches, food, easy logistics, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: none
   - Tradeoff: high → season/dates | "September mornings are warm but lighter in crowds than July—arrive before 09:30 to avoid queues that could stretch your …"
3. **Cascais Beach Day via Coastal Train** — Cascais, Lisbon coast → matched: Lisbon
   - Fit: 100% [addressed: selected destination, beaches, food, easy logistics, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: none
   - Tradeoff: medium → beaches, easy logistics, season/dates, trip length | "Your group wants beach time, but the 40-minute train each way and a full afternoon on the sand consumes an entire day of…"
4. **Bairro Alto & Cais do Sodré Pub Crawl** — Bairro Alto and Cais do Sodré, Lisbon → matched: Lisbon
   - Fit: 78% [addressed: selected destination, food, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: beaches, easy logistics
   - Tradeoff: medium → budget | "Stick to local tascas instead of tourist cocktail bars—drinks at the latter can cost €12–15 each and strain your €1,000/…"
5. **LX Factory Sunday Market & Craft Beer Evening** — LX Factory, Alcântara, Lisbon → matched: Lisbon
   - Fit: 78% [addressed: selected destination, food, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: beaches, easy logistics
   - Tradeoff: medium → food, budget | "The market is great for food and indie nightlife, but stalls here charge €15–25 per meal versus €8–12 at traditional tas…"
6. **Sunset Fado Performance with Dinner in Mouraria** — Mouraria, Lisbon → matched: Lisbon
   - Fit: 78% [addressed: selected destination, food, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: beaches, easy logistics
   - Tradeoff: medium → budget | "Fado dinners are a culture highlight but cost €65–85 per person—one of the pricier meals of your week"
7. **Port Wine Cellar Tasting in Vila Nova de Gaia** — Vila Nova de Gaia, Porto → matched: Porto
   - Fit: 78% [addressed: selected destination, food, easy logistics, budget, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: beaches, season/dates
   - Tradeoff: medium → food | "This delivers your food-and-culture theme, but Gaia is across the river from Porto center"
8. **Ribeira District Walking Tour & Francesinha Dinner** — Ribeira, Porto → matched: Porto
   - Fit: 89% [addressed: selected destination, food, easy logistics, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: beaches
   - Tradeoff: medium → food, season/dates | "The tour covers Porto culture and iconic food, but Ribeira gets crowded in September evenings"
9. **Matosinhos Beach Evening & Seafood Grill** — Matosinhos, Porto coast → matched: Porto
   - Fit: 100% [addressed: selected destination, beaches, food, easy logistics, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: none
   - Tradeoff: medium → food, easy logistics, trip length | "This gives you beach time plus food, but Matosinhos is 30 minutes by tram from central Porto"
10. **Galerias de Paris Street Nightlife Crawl** — Galerias de Paris, Porto → matched: Porto
   - Fit: 89% [addressed: selected destination, food, easy logistics, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: beaches
   - Tradeoff: medium → budget | "Porto nightlife is energetic but drinks on Galerias de Paris cost 20–30% more than neighborhood tascas, so your bar tab …"
11. **Douro River Sunset Rabelo Boat Cruise** — Douro River, departing Ribeira, Porto → matched: Porto
   - Fit: 100% [addressed: selected destination, beaches, food, easy logistics, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: none
   - Tradeoff: medium → budget, season/dates | "The cruise is affordable at €20–30 per person, but the 18:30 sunset departure clashes with typical Portuguese dinner tim…"
12. **Bolhão Market Morning Food Tour & Tastings** — Bolhão Market, Porto → matched: Porto
   - Fit: 89% [addressed: selected destination, food, easy logistics, budget, season/dates, trip length, duration/time realism, practical tips/caveats]
   - Missing axes: beaches
   - Tradeoff: medium → food, season/dates, trip length | "Morning is best for food freshness, but a 09:00 start conflicts with recovery after a Porto nightlife evening—on a short…"

### Coverage by axis

| Axis | Activities addressing |
|---|---:|
| selected destination | 12 |
| beaches | 4 |
| food | 12 |
| easy logistics | 9 |
| budget | 12 |
| season/dates | 11 |
| trip length | 12 |
| duration/time realism | 12 |
| practical tips/caveats | 12 |

### Tradeoff severity summary

- High: 1, Medium: 11, Low: 0

### Failures: none
