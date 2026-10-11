# Default Gemini model for the BYOK alpha (research, 2026-10-11)

Question (issue #3): is `google/gemini-2.5-flash` still the right default chat model (`TRAVEL_AGENT_MODEL`) and Google Search grounding model for the Wander BYOK alpha, where users bring their own (often free-tier) Google AI Studio key?

Short answer: no. Gemini 2.5 Flash is not deprecated, but since 2026-09-18 Google limits it to users who used it before, so new AI Studio keys cannot be assumed to reach it. Switch the default to `gemini-3.5-flash-lite` for both chat and grounding. The catalog does not contain that model yet, the grounding adapter is out of compliance with the display terms, and a free-tier key gets no grounding at all on Gemini 3.x models. Those three issues block a plain config flip.

## 1. Current state in the repo

- Committed `packages/travel-agent-server/src/config.ts` defaults to `ollama` / `kimi-k2.6`. The uncommitted BYOK work in the main checkout changes the default to `TRAVEL_AGENT_PROVIDER ?? "google"` and `gemini-2.5-flash` (`config.ts:88,95`). `.env.example` sets `TRAVEL_AGENT_MODEL=gemini-2.5-flash`, and `docs/travel-agent-railway-alpha.md:21` says "The default model is `google/gemini-2.5-flash`".
- `packages/travel-agent/src/core/search/google-gemini.ts:14` hardcodes `models/gemini-2.5-flash:generateContent?key=...` with `tools: [{ googleSearch: {} }]`.
- The adapter's `GeminiResponse` type declares `searchEntryPoint.renderedContent` but `mapGeminiResults` drops it. It also assigns the same `textContent.slice(0, 200)` snippet to every grounding chunk and ignores `groundingSupports`.
- `credentials.ts:76` validates a user's key by calling `completeSimple` on the configured model. If that model is access-restricted for the user's project, a valid key gets reported as invalid.

## 2. Availability and deprecation of gemini-2.5-flash

| Fact | Source |
|---|---|
| `gemini-2.5-flash` was released 2025-06-17. Shutdown: "No shutdown date announced." | [Deprecations](https://ai.google.dev/gemini-api/docs/deprecations) (updated 2026-10-09) |
| "we are limiting access to the 2.5 models to users who have actively used them in the past." "These models are not deprecated and will continue to be served until further notice through the API." | [Changelog, 2026-09-18](https://ai.google.dev/gemini-api/docs/changelog); [Models](https://ai.google.dev/gemini-api/docs/models) |
| "For any new projects, use our latest models: 3.5 Flash-Lite or 3.8 Flash." | [Models](https://ai.google.dev/gemini-api/docs/models); [Deprecations](https://ai.google.dev/gemini-api/docs/deprecations) |
| Listed shutdown dates are "the earliest possible dates". | [Deprecations](https://ai.google.dev/gemini-api/docs/deprecations) |

Implication: a new BYOK user creating a fresh AI Studio key is the case most likely to hit the access restriction. Google does not say whether access is checked per project, per account or per key. Treat 2.5 Flash as unavailable for new users.

## 3. Newer Flash / Flash-Lite models

Status and dates come from [Models](https://ai.google.dev/gemini-api/docs/models), [Deprecations](https://ai.google.dev/gemini-api/docs/deprecations) and [Changelog](https://ai.google.dev/gemini-api/docs/changelog). Prices are paid tier, per 1M text tokens, from [Pricing](https://ai.google.dev/gemini-api/docs/pricing). Grounding support is from [Grounding with Google Search](https://ai.google.dev/gemini-api/docs/google-search).

| Model | Status | Shutdown | Input / output | Grounding supported | Grounding, free tier | Grounding, paid tier |
|---|---|---|---|---|---|---|
| `gemini-2.5-flash` | Stable, access limited | none announced | $0.30 / $2.50 | yes | free, up to 500 RPD (shared with Flash-Lite) | 1,500 RPD free, then $35 / 1,000 grounded prompts |
| `gemini-2.5-flash-lite` | Stable, access limited | none announced | $0.10 / $0.40 | yes | same shared 500 RPD | same as 2.5 Flash |
| `gemini-3.8-flash` | Stable (2026-09-02) | none announced | $0.75 / $3.75 through 2026-12-31; $1.50 / $7.50 from 2027-01-01 | yes | "Not available" (testable in AI Studio) | 5,000 free search requests/month shared across Gemini 3+, then $14 / 1,000 |
| `gemini-3.6-flash` | Stable (2026-07-21) | none announced | same as 3.8 Flash | yes | Not available | same as 3.8 Flash |
| `gemini-3.5-flash-lite` | Stable (2026-07-21) | none announced | $0.30 / $2.50 | yes | Not available ("Can be tested in Google AI Studio") | same as 3.8 Flash |
| `gemini-3.1-flash-lite` | Stable (2026-05-07) | **2027-05-07** (replacement `gemini-3.5-flash-lite`) | $0.25 / $1.50 | not listed in the grounding table | Not available | same as 3.8 Flash |
| `gemini-3-flash-preview` | Preview | none announced (replacement `gemini-3.6-flash`) | $0.50 / $3.00 | yes | Not available | same as 3.8 Flash |
| `gemini-3.5-flash`, `gemini-3.7-flash` | Deprecated 2026-10-08, auto-routed to 3.6 / 3.8 Flash | - | - | - | - | - |

More details:
- Gemini 3 and newer bill grounding "for **each** search query that the model decides to execute". Gemini 2.5 and older bill "per prompt" ([Grounding](https://ai.google.dev/gemini-api/docs/google-search)). One grounded call on 3.x can therefore count as several billable searches.
- `gemini-flash-latest` "will get hot-swapped with every new release", with a 2-week email notice for breaking changes ([Models](https://ai.google.dev/gemini-api/docs/models)). It pointed at 3.5 Flash from 2026-05-19 ([Changelog](https://ai.google.dev/gemini-api/docs/changelog)). Google advises that "Most production apps should use a specific stable model." Do not default to the alias.
- Free-tier data use: free-tier content is "used to improve our products" (Yes on free, No on paid, [Pricing](https://ai.google.dev/gemini-api/docs/pricing)). Unpaid Services: "Do not submit sensitive, confidential, or personal information" ([Terms](https://ai.google.dev/gemini-api/terms)).
- Latency: I found no primary-source latency figures. Google describes 3.5 Flash-Lite as "a low-latency, highly cost-effective subagent option designed for high-volume automation" ([Changelog, 2026-07-21](https://ai.google.dev/gemini-api/docs/changelog)). Measure it in the bounded journey eval (section 8).

## 4. Does a free-tier key survive one full trip?

Rate limits: Google does not publish a free-tier limits table. The [rate limits page](https://ai.google.dev/gemini-api/docs/rate-limits) says limits "can be viewed in Google AI Studio" (behind login), that "Rate limits are applied per project, not per API key", and that "Requests per day (RPD) quotas reset at midnight Pacific time". The only model-specific numbers I found are user-reported. A [developer forum post (2026-09-03)](https://discuss.ai.google.dev/t/gemini-3-8-flash-free-tier-20-rpd-is-too-limited-for-practical-evaluation/180609) gives Gemini 3.8 Flash free tier as **20 RPD** and Flash-Lite as **500 RPD**. No Google reply confirms either figure. Treat both as unverified until you check the AI Studio quota page.

Local evidence comes from `docs/travel-content-under-100-plan.md` and `travel-data/retrieval-evals/2026-09-14-budget-research/historical-usage.json`. Both sessions are debug sessions, not complete trips, and both ran on `gemini-2.5-flash`.

| Session | Main-agent model requests | Input tokens | Output tokens | Avg input / request | Nested `web_search` calls |
|---|---:|---:|---:|---:|---:|
| `9ffe21df` | 29 | 468,163 | 19,792 | ~16k | 3 |
| `61107148` | 20 | 741,110 | 48,481 | ~37k | 4 |

Nested search-provider calls are not included in the main-agent totals. The token counts reflect transcript replay with no cache reads (`cacheRead: 0`).

Assessment:
- **3.8 Flash on a free key**: fails. One partial debug session already used 20-29 main-agent requests, above the reported 20 RPD. A full trip, likely 2-3x a partial session, cannot fit.
- **3.5 Flash-Lite on a free key**: the request count plausibly fits under a ~500 RPD limit. TPM is unknown, and replayed 16k-37k-token prompts could hit a per-minute token cap during tool loops. Grounding is not available on the free tier for any 3.x model, so web search must come from another provider.
- **2.5 Flash on a free key**: only works for projects that already have 2.5 access. Grounding is free up to 500 RPD for those projects.
- **Paid-tier key on 3.5 Flash-Lite**: a session like `61107148` costs about 0.741 x $0.30 + 0.048 x $2.50 = **~$0.34**, the same as 2.5 Flash since the token prices are identical. On 3.8 Flash the same session costs ~$0.74 now and ~$1.47 from 2027-01-01. Grounding at 4 calls/trip stays inside the 5,000 free monthly searches up to roughly 1,000+ trips/month per user project.

Conclusion: a free-tier key plausibly survives one trip on 3.5 Flash-Lite, but only without Gemini grounding and only if TPM allows. It does not survive on 3.8 Flash. Tell users in the UI that live Google-grounded search needs a paid-tier (billing-enabled) key.

## 5. Grounding display and use requirements the UI must honor

These come from the [Gemini API Additional Terms, Grounding with Google Search](https://ai.google.dev/gemini-api/terms) and the [GenerateContent API reference](https://ai.google.dev/api/generate-content).

1. Use only "in an application that is owned and operated by you".
2. Display "the Grounded Results with the associated Search Suggestion(s) to the end user who submitted the prompt". The suggestion HTML is `groundingMetadata.searchEntryPoint.renderedContent`, a "Web content snippet that can be embedded in a web page or an app webview". The current adapter discards it.
3. Do "not modify, or intersperse any other content with, the Grounded Results or Search Suggestions". Do not "cache, frame, syndicate, resell, analyze, train on, or otherwise learn from" them. The current design feeds grounded text into the main agent, which rewrites it into itinerary content and saves it to session state. That conflicts with this clause. Either render grounded answers verbatim as a distinct, attributed block, or use grounding only for a separate live-answer surface and not as raw input to the agent's research store. The budget plan reached the same conclusion for the destination index (`travel-content-under-100-plan.md:59`).
4. You may "copy and store, for up to two (2) years, the text of the Grounded Result(s)". Show at most 5 Search Suggestions with a final result.
5. No "click tracking, Link-tracking or other monitoring". No "interstitial content between any Link or Search Suggestions and the associated destination page". No redirecting users away from destination pages.
6. Do not use links "to build an index" or "to identify destination pages for crawling or scraping". This rules out feeding grounding chunk URLs into the image or retrieval crawlers.
7. Users must be 18+ ("You must be 18 years of age or older to use the APIs"). For users in the EEA, Switzerland or UK, "You may use only Paid Services". A free-tier BYOK key is therefore not allowed for those users.
8. Google stores grounding prompts and output for 30 days for debugging. Disclose this in the alpha notice.

## 6. Candidate models in `packages/ai/src/models.generated.ts`

The `google` provider block contains `gemini-2.5-flash` (0.30/2.50), `gemini-2.5-flash-lite` (0.10/0.40), `gemini-3-flash-preview` (0.50/3.00), `gemini-3.1-flash-lite` (0.25/1.50), `gemini-3.1-flash-lite-preview` (shut down 2026-05-25), and `gemini-flash-latest` / `gemini-flash-lite-latest`. The alias entries carry stale 2.5-era prices (0.30/2.50 and 0.10/0.40).

**Missing:** `gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gemini-3.8-flash`. Also listed but already shut down: `gemini-2.5-flash-preview-09-2025`, `gemini-2.5-flash-lite-preview-09-2025`, `gemini-3-pro-preview` and others. The catalog is generated from models.dev (`packages/ai/scripts/generate-models.ts:383`). The server resolves `TRAVEL_AGENT_MODEL` through this catalog and throws `Unknown model` for missing ids (`session-manager.ts:679`).

## 7. Recommendation

- **Default chat model: `gemini-3.5-flash-lite`.** It is stable with no shutdown date, it is one of the two models Google names for new projects, and its price equals 2.5 Flash ($0.30 / $2.50). A free key has the best chance of lasting a session on it (reported ~500 RPD vs 20 RPD on 3.8 Flash). Offer `gemini-3.8-flash` as an opt-in "higher quality" choice for paid keys, and say in the UI that it costs 2.5x now and 5x from 2027.
- **Grounding model: `gemini-3.5-flash-lite`**, paid-tier keys only. On a free-tier key, or on 400/403/429 from grounding, fall back to Brave or SearXNG. Do not use `gemini-3.1-flash-lite`: it is missing from the grounding support table and shuts down 2027-05-07. Do not use 2.5 Flash for new users.
- Before switching, run the five bounded Gemini journeys proposed in `travel-content-under-100-plan.md:127` on 3.5 Flash-Lite. Flash-Lite quality on long tool loops is unverified.

## 8. Exact changes needed

1. **Catalog**: in `packages/ai`, run `npm run generate-models` once models.dev lists `gemini-3.5-flash-lite` and `gemini-3.8-flash`. If it does not, add explicit entries in `packages/ai/scripts/generate-models.ts`, next to the existing "Add missing Gemini 3.1 Flash Lite Preview" block (~line 1280), with the prices above: 3.5 Flash-Lite 0.30/2.50; 3.8 Flash 0.75/3.75, to be updated to 1.50/7.50 on 2027-01-01. Do not edit `models.generated.ts` by hand.
2. **`packages/travel-agent-server/src/config.ts`**: `modelId: env.TRAVEL_AGENT_MODEL ?? (provider === "google" ? "gemini-3.5-flash-lite" : "kimi-k2.6")`, and add `groundingModelId: env.TRAVEL_AGENT_GROUNDING_MODEL ?? "gemini-3.5-flash-lite"`.
3. **`.env.example`** and **`docs/travel-agent-railway-alpha.md`** (lines 21 and 57): `TRAVEL_AGENT_MODEL=gemini-3.5-flash-lite`, document `TRAVEL_AGENT_GROUNDING_MODEL`, and state that Google-grounded search needs a billing-enabled key.
4. **`packages/travel-agent/src/core/search/google-gemini.ts`**:
   - `createGoogleGeminiSearchProvider(apiKey, model)` builds `.../models/${model}:generateContent`.
   - Send the key in the `x-goog-api-key` header, not the `?key=` query string, so it stays out of URL logs.
   - Return `searchEntryPoint.renderedContent` and the full grounded text. Map `groundingSupports` segments to chunk indices so each source gets its own supported text instead of a shared 200-char prefix.
   - Throw a typed error on 400/403/429 so callers can fall back.
5. **`packages/travel-agent/src/core/search/index.ts`** and the session-manager wiring: pass the grounding model through, and fall back to Brave/SearXNG when Gemini grounding is unavailable for the key.
6. **Web UI**: render grounded answers as a verbatim block with the `renderedContent` suggestion chip unmodified (max 5 suggestions), with direct links, no click tracking and no interstitials. Do not persist grounding chunk URLs into crawl or image pipelines. Add the 18+ notice, the paid-only notice for EEA/UK/CH, and the 30-day grounding retention notice to the alpha notice.
7. **`credentials.ts` key validation**: report "model not available for this key" separately from "invalid key", because restricted 2.5 access or quota errors would otherwise appear as an invalid key.
8. **`docs/travel-content-under-100-plan.md:75`**: the 2.5 Flash cost model still holds for 3.5 Flash-Lite at identical prices. Update the grounding cost line to per-query billing ($14 / 1,000 after 5,000 free per month).

## Sources

- Google, [Gemini models](https://ai.google.dev/gemini-api/docs/models)
- Google, [Gemini deprecations](https://ai.google.dev/gemini-api/docs/deprecations) (last updated 2026-10-09)
- Google, [Gemini API changelog](https://ai.google.dev/gemini-api/docs/changelog)
- Google, [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- Google, [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- Google, [Grounding with Google Search](https://ai.google.dev/gemini-api/docs/google-search)
- Google, [GenerateContent API reference](https://ai.google.dev/api/generate-content) (`Tool.googleSearch`, `GroundingMetadata`)
- Google, [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms) (Grounding with Google Search, Unpaid Services, regional restrictions)
- Google AI Developers Forum, [Gemini 3.8 Flash Free Tier 20 RPD Is Too Limited](https://discuss.ai.google.dev/t/gemini-3-8-flash-free-tier-20-rpd-is-too-limited-for-practical-evaluation/180609) (user report, unverified)
- Local: `docs/travel-content-under-100-plan.md`, `travel-data/retrieval-evals/2026-09-14-budget-research/historical-usage.json`, `packages/ai/src/models.generated.ts`, `packages/travel-agent/src/core/search/google-gemini.ts`
