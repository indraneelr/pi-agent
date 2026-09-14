# Travel content within a $100 monthly budget

Wander can plausibly serve 100–500 newly planned trips per month within a $100 total service budget. The recommended design combines a small collection of reusable, licensed destination guides, free affiliate activity content, and selective live lookups. Expected cash expenditure is approximately $39 at 100 trips and $68 at 500 trips, before the contingency reserve. These are engineering targets, not demonstrated production costs.

The largest necessary change is reducing repeated model context and tool loops. Cheap retrieval alone will not make the current debugging-session usage fit the upper end of the volume target. Start with a well-covered region, measure complete-trip costs, and expand coverage as demand arrives.

## Recommended content sources

| Need | Launch source | User experience | Persistent reuse |
|---|---|---|---|
| Destination descriptions, trade-offs, general logistics | Wikivoyage plus original editorial material | Source-linked guides tailored to the trip | Yes, with the applicable attribution and share-alike obligations |
| Place identity and geographic relationships | Wikidata structured data | Correct city, region, country and entity matching | CC0 structured data |
| Destination gallery | Wikimedia Commons and directly licensed partner photos | Up to eight distinct, relevant photographs | Only under each asset's actual license |
| Bookable tours and experiences | Viator Basic affiliate API | Supplier cards, ratings and booking links | Follow endpoint and account rules; no assumed bulk-ingestion entitlement |
| Current information and coverage gaps | Brave Search API, followed by permitted source access | Concise evidence with source links | Do not retain search results without the necessary storage rights |
| Google ratings and review excerpts | Google Places API, on explicit review-panel opening | Separate Google Maps attribution and provider content | Store place IDs; no general review-content cache |
| Original traveler observations | Opt-in contributions and licensed local writers | Dated firsthand observations, clearly distinguished from editorial advice | Under an explicit contribution license |

Wikivoyage currently uses CC BY-SA 4.0. Adapted guide text needs attribution and the corresponding share-alike treatment. Wikidata's structured main-namespace data is CC0. Commons is an asset collection with individual licenses, not a blanket permission for every photograph. Record authorship, license, source URL and revision or file identity at ingestion.[^1][^2][^3]

Seed approximately 20–30 destinations, initially focused on the regions receiving actual demand. An initial Vietnam-focused collection would fit the existing product journey. Reusable records should contain general descriptions, suitable activities, seasonal considerations and evidence links. Personal dates, budgets, family information and conversations remain in private trip records.

Eight suitable photos will not exist for every entity. Return the number of distinct, licensed images available, rather than padding the gallery. Deduplicate canonical asset IDs and normalized image URLs, with visual similarity checking for reuploads where useful. Gallery navigation and repeat views should not invoke an LLM or a new search.

## The strongest immediately actionable partnership

Viator advertises free affiliate access, immediate Basic API availability after signup, and no charge for additional API access. Basic access includes product information, images and review ratings/counts. Full written reviews, traveler photographs and bulk update feeds require higher access. Account creation and successful API responses still need verification before launch.[^4][^5]

Use Basic product search for the chosen destination and retrieve individual product detail when a user opens an experience. Viator's guidance does not permit using repeated individual product requests as a substitute for its approved bulk-ingestion interface. Keep supplier descriptions and ratings in attributed booking cards, link to Viator, and follow the partner agreement's restrictions on changing supplied material.[^6][^7]

This provides an inexpensive commercial activity catalog. It does not replace neutral destination research, free things to do, or a collection of independent reviews. Label a Viator rating as Viator; it is not automatically a Tripadvisor rating. Rank options by suitability and include non-bookable activities alongside commercial choices.

Viator's affiliate-link offering advertises 8% commission and a 30-day attribution window. Ten eligible completed bookings at $100 each would yield $80 before any applicable adjustments. That is an illustration, not a revenue forecast; the operating budget assumes zero commissions and allows for cancellations and payout delays.[^8]

GetYourGuide is less suitable as the first API integration: its published Basic requirements include at least 100,000 monthly website visits or 50,000 app downloads. Affiliate links may be useful separately, but API approval should not block this launch.[^9]

## Ratings and reviews

Google's global pricing table currently includes 1,000 monthly free Place Details Enterprise + Atmosphere requests, then $25 per 1,000. This is the tier containing reviews. Rating-only fields have different SKU treatment. Use narrow field masks and the IDs-only search route when possible; avoid unintentionally requesting more expensive search fields.[^10][^11]

Set an application cap of 950 review-bearing detail requests per billing month, including retries and every app sharing the billing account. At 500 trips that allows roughly 1.9 detail lookups per trip on average. This supports selective user-requested reviews, not reviews automatically loaded for every suggested place. Beyond the allowance, offer the provider's direct page or consume a deliberately budgeted paid allowance.

Render Google content directly with Google Maps and author attribution, source links and the required presentation. Do not place these reviews in the shared destination index or assume permission to rewrite them through Gemini. A Google-supplied review summary, where available, has its own display requirements.[^12]

A city such as Hanoi is not equivalent to an individually rated hotel, attraction or tour. Match the exact entity before showing a provider rating. Do not combine multiple businesses into an invented city score. Editorial pros and cons should be labeled travel considerations unless they actually summarize appropriately licensed review evidence.

Tripadvisor remains an optional integration pending clarification. Its older Content API page advertises 5,000 free calls every month; its newer Terra page advertises the first 1,000 calls free without stating that this renews monthly. The newer documentation describes tiered access and usage rights. The recurring allowance and applicable contract must be confirmed for the account actually offered.[^13][^14][^15]

The published Content API master terms require a separate agreement for consumer-facing commercial AI use, and contain restrictions on combining its material with other user-generated content. Do not assume that a free API key permits the planned Google-plus-Tripadvisor comparison panel or commercial review summarization. The newer Terra contract may differ; verify it explicitly. There is no Tripadvisor subscription or free allowance in the baseline budget.[^16]

## Search, browsing and the reusable collection

Brave is the practical initial live-search choice because the repository already has an adapter. Its Search plan is $5 per 1,000 requests with $5 of recurring monthly credit. Four searches per trip at 500 trips means 2,000 requests and approximately $5 monthly search spend. Persistent storage of search results requires a plan that explicitly grants those rights; access to third-party pages remains a separate issue.[^17]

Use search only after the destination collection fails to answer a specific question. Search results identify evidence; they do not establish that the complete source page was read or verified. Fetch permitted pages with ordinary HTTP first. Use Lightpanda only where rendering is necessary and access is allowed. Stagehand or Browser Use should be added only for interactions that actually need them, not for basic search-result extraction.

Keep SearxNG and browser experiments available during evaluation, but do not make an interactive production request depend on repeated attempts against blocked engines. A browser does not create content-reuse rights, resolve missing API entitlements, or guarantee access from a production server. A paid browser pool and broad crawler are unnecessary at this volume.

Gemini's Google grounding looks cheap at this scale, but its terms explicitly prohibit extracting returned links to build an index or discover pages for crawling. It also has specific grounded-result and search-suggestion display requirements. It could support a separately implemented live-answer experience, but should not supply the shared destination database.[^18]

The current Gemini search adapter uses `gemini-2.5-flash`, assigns the same initial answer fragment to every returned source, and does not retain the detailed evidence-to-claim mapping. That loses source specificity. Changing providers alone will not fix evidence quality; the application must distinguish search snippets, retrieved source passages, provider-owned display content and model-generated conclusions.

The reusable collection should accept only open-licensed material, original editorial contributions, or content covered by an explicit partner license. Public tourism-board and travel-blog pages are not automatically reusable. Store provenance and permitted uses with each record. A small full-text index in the existing database, or SQLite FTS5 if appropriate, is sufficient initially; there is no need for a separate vector database subscription.

Refresh popular general guides weekly and less-used ones monthly, detecting source changes before paying for another extraction. Recheck volatile facts when they matter to a trip: opening times, closures and booking prices should not inherit a month-old guide's apparent freshness. Record both source publication/revision date and retrieval date. Follow Wikimedia's API identification, caching and request-rate guidance.[^19]

## Monthly cost model

The conservative hosting allowance is $30: a $24 VPS plus $6 for backups, storage and domain allocation. DigitalOcean lists a 4 GB, two-vCPU basic server at $24/month. This is a sizing proposal, not a load-tested capacity claim. External APIs do the model work; continuous browser workers are excluded.[^20]

Hetzner's Germany/Finland CX33 price is $9.99/month before applicable extras and taxes. If stock, latency and operational requirements are acceptable, this could reduce the estimates below by roughly $13–14/month after an allowance for IPv4. That is the cheaper cash option, but capacity availability and region suitability must be checked at purchase.[^21] Cloudflare R2's current free allocation can accommodate a modest licensed-image collection; it is not necessary to buy a separate large storage service at launch.[^22]

The existing deployment plan selects Railway. Retaining it may cost less engineering time than moving to a VPS. Its bill is usage-based, so profile actual memory/CPU first and retain it if the all-in infrastructure bill stays within $30. No deployment choice is changed by this proposal.[^23]

For Gemini 2.5 Flash, paid text input is $0.30/million tokens and output, including thinking, is $2.50/million. A target of 100,000 input tokens plus 12,000 output tokens **across an entire trip, including all model and nested-tool calls**, costs $0.06. This is an optimization target, not a per-request allowance. Paid-tier treatment also avoids relying on the free tier's product-improvement data usage.[^24]

| Cost | 100 trips/month | 300 trips/month | 500 trips/month |
|---|---:|---:|---:|
| Hosting, backups, storage and domain allowance | $30 | $30 | $30 |
| Trip generation at $0.06/trip | $6 | $18 | $30 |
| Scheduled content enrichment allowance | $3 | $3 | $3 |
| Brave at four searches/trip, after monthly credit | $0 | $1 | $5 |
| Google review lookups within the capped free allowance | $0 | $0 | $0 |
| Viator Basic API | $0 | $0 | $0 |
| **Expected operating expenditure** | **$39** | **$52** | **$68** |

These figures exclude engineering labor, assume modest traffic and no separate paid mapping service, and include no affiliate-income offset. Domain fees may be paid annually rather than monthly. Actual taxes, exchange rates and checkout charges must be deducted from the reserve before activating the final spending limits.

Allocate at most $80 to planned operations: $30 infrastructure, $35 models and enrichment, $10 search and $5 optional review overages. Hold $20 for taxes, billing differences and exceptional usage. With eight searches per trip instead of four, the 500-trip estimate becomes $78. With twice the model tokens, it becomes $98 before contingency. The latter is not a comfortable fit for a strict $100 ceiling.

For comparison, Tavily includes 1,000 free credits, with pay-as-you-go at $0.008/credit; request types consume different numbers of credits. Serper advertises $50 for 50,000 credits, expiring after six months. At this low volume, Brave's recurring credit and existing implementation are preferable to that prepayment. These are price comparisons, not a measured ranking of retrieval quality.[^25][^26]

## Current application cost evidence

The two locally recorded debugging sessions show substantially higher main-agent usage than the proposed target:

| Session | Main-agent input tokens | Output tokens | Recorded token cost |
|---|---:|---:|---:|
| `9ffe21df-7f5d-4a10-bef4-498b68010d83` | 468,163 | 19,792 | $0.189929 |
| `61107148-0962-4fd4-b47d-0c144b05cf8f` | 741,110 | 48,481 | $0.343536 |

Neither is a representative completed-trip benchmark. Nested Gemini search usage is absent from these main-agent totals. Multiplying them by 500 gives approximately $95–172 before hosting or nested search, illustrating why current behavior cannot establish budget feasibility. The aggregate evidence is retained locally at `travel-data/retrieval-evals/2026-09-14-budget-research/historical-usage.json`.

Replace repeated transcript replay with structured trip state and a small evidence bundle for the active phase. Make selection, gallery paging and provider-review display deterministic application operations. Bound repair attempts and prevent repeated research of unchanged entities. Reserve tokens for completing the itinerary before permitting optional elaboration.

Add an application-wide spending ledger with atomic reservations for concurrent requests, including maximum output, nested calls, retries and scheduled refreshes. Reconcile estimates against provider usage. Provider budget alerts alone are insufficient as a stop mechanism. At the spending ceiling, preserve saved plans and editing, explain that extra live research is unavailable, and stop issuing billable requests. Optional paid extensions or BYOK can fund unusually heavy usage later.

## Partnerships that build an original content advantage

| Partner | Concrete offer | Requested contribution | Initial dependency |
|---|---|---|---|
| Three to five small hotels, hostels or local operators | Attribution, useful referrals and a tracked enquiry link | Original local recommendations, owned photos and monthly corrections | Optional; start with one destination |
| Two or three specialist travel writers | Byline, source links and a negotiated share of attributed revenue | A small licensed collection of practical local tips and excerpts | Optional; no guaranteed cash commitment |
| Tourism-board press offices | Credited presentation and links to official visitor information | Licensed media kits and current event/closure feeds | Optional; public availability alone is insufficient |
| Returning travelers | A useful trip recap and visible contributor credit | Dated firsthand observations and original photos, with explicit reuse consent | Gradual quality improvement |

Use a short written, non-exclusive agreement covering commercial display, storage, adaptation, attribution, correction and removal. Require contributors to own the material they supply; copying reviews or photographs from another platform does not solve the rights problem. Do not reuse private trip conversations as public content. Keep partner claims identifiable and independently check important factual recommendations.

The distinctive asset would be practical destination knowledge: stroller access, realistic visit duration, transport friction, quiet times and family suitability. Accumulate this around actual demand rather than attempting a global travel-site index. Partnerships are proposed opportunities; none are secured, and no revenue or free content delivery is assumed.

## Implementation and validation

Allow an estimated six to ten focused engineering days for the initial version: one to two days for accounting/context control, two to three for the licensed collection and galleries, one to two for provider integrations, and two to three for end-to-end evaluation and fixes. Partner response time is additional. Budget two to four hours per month for initial-region curation; broader coverage or heavy user feedback can increase this. These are planning estimates.

Before rollout, evaluate 30 retrieval cases spanning six destinations and five needs: general guidance, family suitability, current attraction information, bookable activities and exact-place reviews. Include ambiguous names, missing data, duplicates, closed venues and exhausted quotas. Compare source correctness and useful coverage, not just whether requests return HTTP 200.

Then run five bounded, complete Gemini journeys, with an explicit aggregate test cap of $2 and at most 60 model requests. Report every provider call, input/output tokens, cash cost, wall-clock duration, source relevance and factual errors. Five trips give an initial regression check, not statistical proof of the 500-trip forecast.

Release criteria should include correct place identity and rating attribution; no duplicate gallery entries; visible completion or failure for every action; source-backed claims; successful trip completion inside the target budget; and verified behavior under provider failure, timeout and exhausted allowance. Source pages being reachable is not sufficient evidence that an itinerary is correct.

## Sources

Public sources below were checked on 14 September 2026. Pricing and account-specific entitlements must be reconfirmed before purchase. Where publication dates are absent, the verification date is the reference date.

[^1]: Wikivoyage, [Copyleft](https://en.wikivoyage.org/wiki/Wikivoyage:Copyleft), current guide-text license.
[^2]: Wikidata, [Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing), structured-data licensing.
[^3]: Wikimedia Commons, [Reusing content outside Wikimedia](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia), asset-level permissions.
[^4]: Viator, [Affiliate API](https://partnerresources.viator.com/travel-commerce/affiliate/), access costs and onboarding.
[^5]: Viator, [Levels of access](https://partnerresources.viator.com/travel-commerce/levels-of-access/), Basic versus higher-tier capabilities.
[^6]: Viator, [Managing product and availability data](https://partnerresources.viator.com/travel-commerce/managing-product-availability-data/), endpoint and ingestion guidance.
[^7]: Viator, [Partner Program Terms](https://partners.viator.com/static/docs/Viator-Partner-Program-Terms-en_EN.pdf), content and promotional-use restrictions.
[^8]: Viator, [Affiliate links](https://partnerresources.viator.com/travel-content/links/), commission and attribution window.
[^9]: GetYourGuide, [API integration and requirements](https://partner.getyourguide.support/hc/en-us/articles/13981133907613-API-integration-and-requirements), updated 4 September 2026.
[^10]: Google Maps Platform, [Global pricing](https://developers.google.com/maps/billing-and-pricing/pricing), Places monthly caps and prices.
[^11]: Google Maps Platform, [Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details), field masks and SKU selection.
[^12]: Google Maps Platform, [Places policies and attributions](https://developers.google.com/maps/documentation/places/web-service/policies), updated 10 September 2026.
[^13]: Tripadvisor, [Content API](https://www.tripadvisor.com/business/solutions/hotels/content-api), older monthly-free-call offer.
[^14]: Tripadvisor, [Terra API](https://www.tripadvisor.com/business/solutions/hotels/terra-content-api-top), newer free-call offer.
[^15]: Tripadvisor, [Terra platform overview](https://docs.terra.tripadvisor.com/docs/overview), tiered content and usage access.
[^16]: Tripadvisor, [Content API Master Terms](https://tripadvisor-content-api.readme.io/reference/api-master-terms-new), particularly sections 3.1, 3.4 and 3.5.
[^17]: Brave, [Search API](https://brave.com/search/api/), prices, recurring credit and storage-rights requirements.
[^18]: Google, [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms), Grounding with Google Search restrictions.
[^19]: Wikimedia Foundation, [API Usage Guidelines](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines).
[^20]: DigitalOcean, [Droplet pricing](https://www.digitalocean.com/pricing/droplets).
[^21]: Hetzner, [Price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/), Germany/Finland prices effective 15 June 2026; [cost-optimized cloud](https://www.hetzner.com/cloud/cost-optimized/), availability caveat.
[^22]: Cloudflare, [R2 pricing](https://developers.cloudflare.com/r2/pricing/).
[^23]: Railway, [Pricing](https://docs.railway.com/pricing), usage-based infrastructure charges.
[^24]: Google, [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing), Gemini 2.5 Flash token pricing and data treatment.
[^25]: Tavily, [Pricing](https://www.tavily.com/pricing).
[^26]: Serper, [Pricing](https://serper.dev/).
