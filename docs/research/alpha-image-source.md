# Alpha image source: which provider gives relevant, validated, attributable photos?

Resolves wayfinder issue [#2](https://github.com/indraneelr/pi-agent/issues/2). Researched 2026-10-11.

Scope: destination, place, and activity photos for a private BYOK alpha (a handful of allowlisted users) deployed on Railway. No paid APIs or keys were used. Wikimedia was sampled live, unauthenticated. Brave and Google Places were assessed from official docs, pricing pages, and terms only.

## Recommendation

**Wikimedia Commons as the primary provider, fed by a Wikipedia lead image for hero shots. Keep SearXNG as an attributed, hotlink-only fallback. Do not adopt Google Places photos for the alpha. Keep Brave image search in reserve as a paid swap-in for SearXNG.**

Fallback order for `get_images` in `auto` mode:

1. **`wikimedia`** (new `ImageSearchProvider`). Hero image from the Wikipedia `pageimages` lead image, then Commons file search (`filetype:bitmap`) with `extmetadata` for license and author.
2. **`searxng`** (existing). Hotlink only, never store. Show the source domain and link, per ADR 0005.
3. **`stagehand`** (existing). Last resort, with the same attribution posture as SearXNG.
4. **No image.** Render no image rather than one that cannot be validated or attributed. The tool already says "Never invent image URLs" ([get-images.ts:61-62](../../packages/travel-agent/src/core/tools/get-images.ts)).

Brave Search API is an option if self-hosted SearXNG turns out to be unreliable on Railway. Its licensing posture is the same as SearXNG's: no license data, and the third-party rights stay with the publisher. Its no-storage clause also conflicts with persisting `imageLinks` (details below).

Why: Wikimedia is the only candidate that returns machine-readable license and author data for every result. In the live sample it was 100% on-topic for the three test places. It costs nothing, needs no Railway service, and already matches ADR 0005's pre-public-launch target ("flip to Wikimedia-primary"). Making it primary now moves the hard gate forward instead of adding a migration later.

## Comparison

| | Wikimedia Commons (+ Wikipedia lead image) | SearXNG on Railway | Brave Image Search API | Google Places photos (New) |
|---|---|---|---|---|
| Relevance for real place names | Live sample: 30/30 top results showed the queried place. About 26/30 were usable as travel imagery (details below). | Prior eval: 0/10 relevant for "Hoi An Ancient Town" queries on web search. DuckDuckGo hit a CAPTCHA and Google returned nothing [E1]. Image engines were not separately sampled. | Not sampled (needs a key). Results come from the open web, like SearXNG's upstream engines. | Not sampled (needs a billed key). Photos are tied to a resolved place entity, so on-topic by construction when the entity is right. The prior eval found several similarly named Hoi An listings [E1]. |
| License / attribution data | Per file: `LicenseShortName`, `Artist`, `AttributionRequired`, `UsageTerms`, `Credit` via `iiprop=extmetadata` [W1][W2]. All 60 sampled files returned a license. | None. The `wikicommons.images` engine itself drops license data: it only asks for `iiprop=url\|size\|mime` [S4]. Other engines return only a source page URL. | None. The docs list image URL, thumbnail, source page, dimensions, and publisher, with no license or author [B2]. Terms: third-party content stays "subject to the intellectual property rights" of its owners [B3 §9(d)(ii)]. | `authorAttributions[]` (name, URI, photo) per photo. "Always present, but might be empty" [G1]. You must credit the author and show the Google logo when displayed without a Google map [G3]. |
| Hotlinking / storage | Hotlinking is "possible but not recommended" [W3]. Files are CC or public domain, so copying and caching is allowed with attribution [W3][W4]. Browser hotlinks returned `access-control-allow-origin: *` (live HEAD). | ADR 0005: hotlink only, never store, credit the source, provide a takedown path [A1]. Underlying images are unlicensed third-party content. | Must not "store, cache, or create a database of Search Results", except transient operational storage [B3 §3(b)(i)]. Storage rights need a separate plan [B1]. | "You cannot cache a photo name. Also, the name can expire" [G1]. No pre-fetching, caching, or storing of Places content except place IDs [G3]. |
| Cost / quota | Free. Unauthenticated Action API: concurrency 1, under 5 req/s. Media from upload.wikimedia.org: concurrency at most 2, at most 25 Mbps [W5]. Requires a descriptive User-Agent, otherwise 403 or block [W6]. | Free software. You pay Railway compute (below). | $5 per 1,000 requests, with $5 of free credit per month (about 1,000 requests), 50 qps [B1]. | Text Search Pro (needed for `places.photos`) is $32 per 1,000 with 5,000 free per month. Place Details Photos is $7 per 1,000 with 1,000 free per month [G4][G2]. |
| Railway hosting burden | None. Outbound HTTPS from the existing server. | Extra service: the `searxng/searxng` image plus `settings.yml` (JSON format must be enabled, since the default is `html` only) [S2][S3]. Valkey only if the limiter is used [S1][S2]. On Hobby, $10 per GB-month RAM and $20 per vCPU-month, with $5 included [R1]. Upstream engines CAPTCHA or block SearXNG traffic [S1]. | None. Needs a server-held API key, which breaks the pure-BYOK model unless users bring a Brave key. | None to host. Needs a Google Cloud billing account and key. Display requires the Google logo [G3]. |
| Fit with `image-search/` seam | Strong: new provider returns `ImageCandidate` with API-supplied width and height, so the dimension probe is skipped. Needs new license fields (below). | Already implemented ([searxng.ts](../../packages/travel-agent/src/core/image-search/searxng.ts)). | Easy to add as a provider, but cannot fill license fields. Persisting URLs into `TravelState` conflicts with the no-storage clause. | Poor: `get_images` persists URLs into destination `imageLinks` and saves state ([get-images.ts:85-87](../../packages/travel-agent/src/core/tools/get-images.ts)). Places forbids storing photo names, and `photoUri` lifetime is undocumented [G1][G3]. Needs entity resolution first. |

## Live Wikimedia relevance sample

Method: Commons Action API, `generator=search&gsrnamespace=6&gsrlimit=10`, `prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=1280`. User-Agent: `WanderResearch/0.1 (https://github.com/indraneelr/pi-agent; research sample)`. Run 2026-10-11, sequential, unauthenticated. Relevance and usability are manual judgments.

| Query | Latency | On-topic | Usable as travel imagery | Notes |
|---|---:|---:|---:|---|
| `Naxos` | 1.8 s | 10/10 | ~6/10 | Beaches, Chora, port, city view. Also a cat, used books, an airplane, an emery mine. |
| `Kyoto` | 1.1 s | 10/10 | 9/10 | Arashiyama bamboo, Yasaka-dori, Higashiyama, Katsura river. #1 was an office building facade. |
| `Hoi An Ancient Town` | 0.7 s | 10/10 | 10/10 | All from one photographer's 2020 series: on-topic but low variety. |
| `Naxos Portara filetype:bitmap` | 1.1 s | 10/10 | 10/10 | Portara / Temple of Apollo from several authors. |
| `Kyoto Fushimi Inari filetype:bitmap` | 0.7 s | 10/10 | 10/10 | Torii paths, gates, Tamayama Inarisha. |
| `Hoi An Ancient Town filetype:bitmap` | 0.7 s | 10/10 | 10/10 | Same series as above. |
| Activities: `Naxos beach`, `Kyoto tea ceremony`, `Hoi An lantern night` (top 5 each) | n/a | 15/15 | 15/15 | e.g. "Agios Prokopios Beach at sunset", "Tea ceremony in Kyoto", "Hoi An lanterns at night". |

- **Licenses:** all 60 files from the six metadata queries carried `LicenseShortName`: mostly CC BY-SA 4.0, some CC BY-SA 3.0/2.5/2.0 and CC BY 4.0/3.0, one public domain, and one generic "Attribution". `AttributionRequired` was `true` on 58. It was `false` on the public-domain file and missing on the "Attribution" file, so the provider should default to rendering a credit line when the field is absent.
- **Size:** most originals are over 3000 px tall or wide. They pass the default `min_height: 720` ([get-images.ts:70](../../packages/travel-agent/src/core/tools/get-images.ts)) using API dimensions alone.
- **Hero images:** the Wikipedia `pageimages` lead image (`prop=pageimages&piprop=original`) gave strong heroes:
  - Naxos: Chora/Grotta beaches.
  - Kyoto: a city view.
  - Fushimi Inari-taisha: the torii path.
  - Hoi An: `Hoi An Ancient Town` redirects to `Hội An Old Town`, which has a lead image. The bare `Hội An` page had none, so fall back to Commons search.
- **Depicts search** (`haswbstatement:P180=Q34600`, Kyoto) did not beat plain search: it returned the same office building first. Structured-data filtering is not worth it for the alpha.
- **Validation:** a 1280 px thumbnail URL from `iiurlwidth` returned HTTP 200 `image/jpeg` on HEAD. That host's CORS header `access-control-allow-origin: *` allows direct browser hotlinking.

Weak spots and mitigations:
- **Generic one-word queries pull in off-topic files** (Naxos cat, Kyoto office). Use the lead image for the hero slot. Query Commons with the place plus the activity or landmark the agent already sends as `query` ("Dolomites Italy mountains landscape" style, [get-images.ts:16](../../packages/travel-agent/src/core/tools/get-images.ts)).
- **Low variety when one photographer dominates.** Dedupe by `Artist` when picking the top N.
- **Small or obscure places may have thin coverage.** This is why the SearXNG fallback stays.

## Per-source notes

### Wikimedia Commons

- **Existing code.** [image-validation.ts:217-248](../../packages/travel-agent/src/core/image-validation.ts) already queries Commons (`fetchImageUrlsFromQuery`). It is only a refetch fallback inside `cleanDestinationImageLinks` ([sdk.ts:120](../../packages/travel-agent/src/core/sdk.ts)), not an `ImageSearchProvider`, and it discards everything except the URL. It requests `iiprop=url|mime`, so no license and no dimensions. ADR 0005's statement that Wikimedia is "already wired" [A1] is only partly true.
- **Attribution.** Required elements are author, title, source, and license with a link. Reusers choose the format [W4]. The API exposes `Credit` and `AttributionRequired` for this [W2][W4]. A minimal credit line: `<Artist> / Wikimedia Commons / <LicenseShortName>`, linked to the file page and the license URL.
- **Cost of metadata.** `extmetadata` is "costly" and should be fetched for only a few results at a time [W2]. Use `iiextmetadatafilter=LicenseShortName|LicenseUrl|Artist|AttributionRequired|Credit` and `gsrlimit` of 10 or less.
- **Thumbnail sizes.** The returned thumbnail width may be a pregenerated size at or above the requested width [W2]. Media fetches should use standard thumbnail sizes [W5].
- **Rate etiquette.** No hard read limit, but requests should be serial [W7]. Unauthenticated Action API: concurrency 1, under 5 req/s [W5]. Alpha volume (a few users, a few cards per trip) is far below this.
- **Two fixes needed in existing code:**
  - The User-Agent in [image-validation.ts:52,199](../../packages/travel-agent/src/core/image-validation.ts) names `https://github.com/oraios` as contact. Policy requires real contact information or the client "may be blocked without notice" [W6]. Point it at the project URL or a contact address.
  - `validateImageUrls` defaults to concurrency 5 ([image-validation.ts:106](../../packages/travel-agent/src/core/image-validation.ts)). The upload.wikimedia.org limit is total concurrency 2 [W5]. Pass `concurrency: 2` for the Wikimedia provider. Or skip the per-URL probe for API-returned URLs: they are authoritative, and dimensions come from `imageinfo`. A light HEAD on the chosen N images is still worthwhile to catch drift.

### SearXNG with tuned image engines

- **Engine defaults.** Default image engines include `wikicommons.images`, `bing images`, `brave.images`, and `duckduckgo images`. `google images`, `flickr`, and `openverse` are disabled by default [S5].
- **Blocking.** Upstream engines respond to SearXNG traffic with "a CAPTCHA or [it] is blocked by the search engine" [S1]. The 2026-09-14 local run reproduced this: DuckDuckGo reported a CAPTCHA, Google returned no results, and Bing was the only engine answering [E1]. A Railway datacenter egress IP will likely fare no better than a residential one (inference, not tested).
- **SearXNG's `brave.images` engine scrapes `https://search.brave.com/`.** It does not use the Brave API (`base_url` in [S6]), so it is exposed to the same blocking.
- **Tuning to `wikicommons.images` only** turns SearXNG into a slower Wikimedia proxy that drops license metadata [S4]. Calling the Commons API directly is strictly better.
- **Openverse** (CC-licensed aggregator, disabled by default [S5]) is the one tuning that could add license-bearing results. Not evaluated here; worth a follow-up only if Wikimedia coverage proves thin.
- **Hosting.** One more Railway service, plus Valkey if the limiter is enabled [S1][S2]. JSON output must be enabled explicitly [S3]. The runbook already lists it as a Railway service ([travel-agent-railway-alpha.md](../travel-agent-railway-alpha.md)). A small container at about 0.25 GB RAM is about $2.50 a month on Hobby pricing [R1] (estimate).

### Brave Image Search API

- **Endpoint.** `GET https://api.search.brave.com/res/v1/images/search`, `count` up to 200. Results include the original image URL in `properties.url`, a 500 px proxied thumbnail, and width and height that are "not always available" [B2].
- **Pricing.** Image search is included in the Search plan: $5 per 1,000 requests, $5 a month of free credit, 50 qps [B1].
- **Terms:**
  - No storing, caching, or databases of results beyond transient operational storage [B3 §3(b)(i)].
  - No redistribution [B3 §3(b)(xii)].
  - Attribution to Brave is optional; if shown, it must be "POWERED BY BRAVE" plus the logo [B3 §4(d)].
  - The API "does not grant rights to third-party webpage content" [B1][B3 §9(d)].
- **Assessment.** Removes the hosting and CAPTCHA risk of SearXNG, but not the licensing risk. Persisting result URLs into saved trips is in tension with §3(b)(i). It also adds a server-held key to a BYOK product.

### Google Places photos (New)

- **Flow.** Text Search with `places.photos` (Text Search Pro SKU [G5]) returns photo resource names. Each `GET .../{name}/media?maxWidthPx=` (1-4800) is a Place Details Photos event [G1].
- **Cost.** $32 per 1,000 Text Search Pro and $7 per 1,000 photos. Free caps are 5,000 and 1,000 events a month [G2][G4]. A handful of users would likely stay inside the free caps. It still needs a billing account and a server-held key.
- **Attribution.** Author attribution is mandatory wherever the image is displayed [G1][G3]. Without a Google map, the Google logo is required [G3].
- **Storage.** Photo names cannot be cached and expire [G1]. Places content must not be cached beyond place IDs [G3]. Each render needs a fresh lookup, which breaks the current persist-URLs-in-state model and the validation-evidence model.
- **Relevance.** Strong once the entity is right, since photos belong to the listing. Entity resolution is its own problem: the prior eval saw multiple similarly named Hoi An listings [E1].

## Fit with the image-search seam

Changes needed for a Wikimedia provider, all inside the existing seam:

- [types.ts](../../packages/travel-agent/src/core/image-search/types.ts):
  - Add `"wikimedia"` to `ImageSearchProviderName`.
  - Add optional attribution fields to `ImageCandidate` and `ValidImageResult`: `license`, `licenseUrl`, `author`, `attributionRequired`, and `sourcePage` (file page URL). ADR 0005 requires these fields for either path [A1].
  - SearXNG and Stagehand fill only `sourcePage`/`source`.
- New `image-search/wikimedia.ts`:
  - Lead-image lookup, then Commons search with `filetype:bitmap` and `extmetadata`.
  - Map `imageinfo.width/height` into the candidate so the [validate.ts](../../packages/travel-agent/src/core/image-search/validate.ts) dimension probe (lines 52-58) is skipped.
  - Strip HTML from `Artist`. extmetadata values are HTML [W2].
  - Pass `validate: { concurrency: 2 }`.
- [validate.ts](../../packages/travel-agent/src/core/image-search/validate.ts) line 73 copies only `url, width, height, title, source` into the result. It must carry the new attribution fields through.
- [get-images.ts](../../packages/travel-agent/src/core/tools/get-images.ts):
  - `resolveProviders` (lines 109-115) becomes `[wikimedia, searxng, stagehand]`.
  - Add `"wikimedia"` to the `provider` schema union (lines 21-25).
  - Destination `imageLinks` is `string[]`. Attribution needs a parallel structured field so the web UI can render a credit line.
- Retire `fetchImageUrlsFromQuery` in favour of the provider, or have `cleanDestinationImageLinks` call it, so there is one Commons client.

## Sources

Code (this repo):
- [packages/travel-agent/src/core/image-search/types.ts](../../packages/travel-agent/src/core/image-search/types.ts)
- [packages/travel-agent/src/core/image-search/searxng.ts](../../packages/travel-agent/src/core/image-search/searxng.ts)
- [packages/travel-agent/src/core/image-search/validate.ts](../../packages/travel-agent/src/core/image-search/validate.ts)
- [packages/travel-agent/src/core/image-validation.ts](../../packages/travel-agent/src/core/image-validation.ts)
- [packages/travel-agent/src/core/tools/get-images.ts](../../packages/travel-agent/src/core/tools/get-images.ts)
- [packages/travel-agent/src/core/sdk.ts](../../packages/travel-agent/src/core/sdk.ts)
- [docs/travel-agent-railway-alpha.md](../travel-agent-railway-alpha.md)

Project decisions and evals (on `main`):
- [A1] `docs/adr/0005-content-licensing-disclaimers-privacy.md`: image licensing posture, alpha hotlink-only, Wikimedia-primary before public launch.
- [E1] `docs/lightpanda-retrieval-evaluation-2026-09-14.md`: SearXNG relevance 0/10 for Hoi An provider queries, DuckDuckGo CAPTCHA, multiple Maps listings.

Wikimedia:
- [W1] MediaWiki API:Imageinfo: https://www.mediawiki.org/wiki/API:Imageinfo
- [W2] Same page: extmetadata is HTML-formatted and "costly"; `iiextmetadatafilter`; thumbnail width may be larger than requested.
- [W3] Commons:Reusing content outside Wikimedia: https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia
- [W4] Commons:Credit line: https://commons.wikimedia.org/wiki/Commons:Credit_line
- [W5] Wikimedia Robot policy: https://wikitech.wikimedia.org/wiki/Robot_policy
- [W6] Wikimedia Foundation User-Agent Policy: https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy
- [W7] MediaWiki API:Etiquette: https://www.mediawiki.org/wiki/API:Etiquette
- Live API responses: `https://commons.wikimedia.org/w/api.php` and `https://en.wikipedia.org/w/api.php`, queried 2026-10-11.

SearXNG:
- [S1] Limiter: https://docs.searxng.org/admin/searx.limiter.html
- [S2] Docker installation: https://docs.searxng.org/admin/installation-docker.html
- [S3] `search.formats` setting: https://docs.searxng.org/admin/settings/settings_search.html
- [S4] `wikicommons` engine source (`iiprop: url|size|mime`): https://github.com/searxng/searxng/blob/master/searx/engines/wikicommons.py
- [S5] Configured engines (images): https://docs.searxng.org/user/configured_engines.html
- [S6] `brave` engine source (`base_url = "https://search.brave.com/"`): https://github.com/searxng/searxng/blob/master/searx/engines/brave.py

Brave:
- [B1] Brave Search API plans and pricing: https://brave.com/search/api/
- [B2] Image search docs: https://api-dashboard.search.brave.com/app/documentation/image-search/get-started
- [B3] Brave Search API Terms of Service: https://api-dashboard.search.brave.com/terms-of-service

Google Maps Platform:
- [G1] Place Photos (New): https://developers.google.com/maps/documentation/places/web-service/place-photos
- [G2] Pricing: https://developers.google.com/maps/billing-and-pricing/pricing
- [G3] Places API policies: https://developers.google.com/maps/documentation/places/web-service/policies
- [G4] Same pricing page, per-SKU free monthly caps.
- [G5] Text Search (New) field-to-SKU mapping: https://developers.google.com/maps/documentation/places/web-service/text-search

Railway:
- [R1] Plans and pricing: https://docs.railway.com/reference/pricing/plans
