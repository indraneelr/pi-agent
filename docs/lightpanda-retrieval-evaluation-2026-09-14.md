# Standalone Lightpanda retrieval evaluation

Tested 2026-09-14, approximately 10:32–10:43 Jakarta time. **No Gemini calls, no Stagehand calls, no app integration or saved-trip changes.**

## Outcome

Lightpanda successfully reads ordinary travel pages and can retrieve real Google Maps review previews from a supplied listing. It is **not yet a reliable end-to-end replacement for search and reviews**: direct search was blocked, Maps content varied between loads, and Tripadvisor denied access in both browsers.

The previous documentation-based recommendation in [browser-search-design.md](browser-search-design.md) is now qualified by these observed failures. Keep browser reading separate from search discovery and require a usable-content check before accepting a fetch.

## Exact query strings

These were rendered without model rewriting from [search-templates.json](../packages/travel-agent/search-templates.json). No Gemini retrieval instruction was involved.

| Template selection | Executed query |
| --- | --- |
| `find_google_listing.domain` | `site:google.com/maps Hoi An Ancient Town Vietnam` |
| `find_tripadvisor_listing.listing` | `site:tripadvisor.com Hoi An Ancient Town Vietnam` |
| `discover_destinations.by_interest` | `Vietnam beaches places to visit` |

Each was requested through Google in Lightpanda, then DuckDuckGo HTML after Google produced no usable results. The same strings were then sent through local SearxNG with `engines=google,bing,duckduckgo`, `language=en`, `safesearch=1`, `format=json`. Actual returned results were attributed to Bing; DuckDuckGo reported CAPTCHA. No Google-attributed results were returned.

## Search quality and timing

| Search path | Maps query | Tripadvisor query | Beach query | Quality assessment |
| --- | ---: | ---: | ---: | --- |
| Google via Lightpanda | 1.95 s | 1.70 s | 2.24 s | 0 usable result sets out of 3. Two unusual-traffic pages; one JavaScript retry/incomplete page. |
| DuckDuckGo via Lightpanda | 1.86 s | 1.59 s | 1.65 s | 0 usable result sets out of 3. All returned HTTP 202 bot challenges. |
| SearxNG | 0.65 s | 0.29 s | 0.28 s | Returned 10 rows each, but both provider queries had 0/10 matching provider URLs and 0/10 results relevant to Hoi An. |

The two provider queries returned the same unrelated list, including Hearts of Iron and dictionary definitions of “hoi”. This is an observed query-fidelity/relevance failure; the test does not establish where the query was weakened. SearxNG echoed the complete submitted query. Do not infer that the template itself is the only cause.

For the beach query, 2/10 results directly supported travel planning (official Vietnam tourism and a places-to-visit guide). No top-ten title/snippet explicitly answered the beach-specific question. Other results were mainly encyclopedic country/history pages. These counts are manual judgments against the stated task, not a model score or a general search benchmark.

Chrome also received Google's unusual-traffic page for the exact Tripadvisor query (2.64 s). This means that failure was not unique to Lightpanda in this environment.

## Source-page reading and correctness

| Page/action | Lightpanda navigation | Lightpanda total | Observation |
| --- | ---: | ---: | --- |
| Vietnam Wikipedia page returned by SearxNG | 0.62 s | 2.33 s | Readable country information; weak answer to the requested beach question. |
| Official Vietnam tourism homepage returned by SearxNG | 3.17 s | 4.74 s | Readable text and links, including beach articles. |
| Mui Ne beach article linked from that homepage | 2.47 s | 3.99 s | Correct article title and five sampled content anchors matched Chrome. Markdown retained headings and article content, but also menus/footer. |
| Google Maps search for Hoi An Ancient Town | 1.13 s | 2.75 s | Limited results view, multiple distinct similarly named listings and ratings. Useful for candidate discovery, not a verified entity match. |
| First Maps candidate, “Phố Cổ Hội An” | 1.77 s | 3.32 s | 4.7/5, 631 reviews, and three review previews. Rating, count, and sampled text from all three previews matched Chrome. |
| Same candidate, second load and Reviews-tab attempt | 1.51 s | 8.05 s | Limited view this time; rating remained, review count/previews/tab absent. Tab lookup timed out after 5 s. No successful pagination or expansion. |
| Exact Tripadvisor attraction listing | 0.71 s | 2.23 s | HTTP 403/challenge; no usable reviews or verified rating/count. Chrome also returned 403 (2.67 s total). |

Maps and Tripadvisor seed URLs were supplied by an independent web lookup after browser/SearxNG discovery failed. They are **page-reader tests, not successful end-to-end discoveries**. The Mui Ne article was reached from a link actually extracted from the SearxNG tourism homepage.

Maps candidate ID: `ChIJE3yuYgAPQjERnAMwgxxwoN4`. This identifies the tested Google listing only. The test did not establish equivalence to the requested whole city or Tripadvisor's attraction entity. The 631 count is Google's displayed total, not the number of reviews downloaded. Previews were localized into Indonesian and marked as Google translations. No full review corpus was collected.

Chrome confirmed the candidate at 4.7/5 and 631 reviews; its screenshot was visually inspected. The article verification checks content extraction, not the truth of every travel claim. Native Markdown conversion also worked on challenge pages, so a successful conversion is not a sufficient success condition. Naive `body.textContent` included script text in the incomplete Google page; clean DOM/Markdown evidence must be inspected instead of relying on byte counts.

## Method and limits

- Sequential, fresh browser contexts; no user profile or login cookies. Lightpanda ran locally over CDP with default sub-resource settings and telemetry disabled. No CAPTCHA solving, proxies or stealth changes.
- Lightpanda binary: `1.0.0-nightly.9427+5163c6d38`; SHA-256 `5af749db6e036ff199c5c16cdd544de4853d9ce19d9d56448c5fae151a778c7c`. Its CDP-advertised compatibility version was `124.0.6367.29`; this is not the Lightpanda build version. Chrome was `152.0.7977.83`.
- 21 recorded operations: 13 Lightpanda page loads, 5 Chrome control loads, 3 SearxNG queries. One earlier SearxNG diagnostic probe is separately saved without timing; two independent web lookups supplied control URLs.
- Navigation limit 20 s; fixed settling delay 1.5 s. Totals include context setup, navigation, settling, extraction/artifact writing and cleanup. Chrome totals also include screenshots. The failed tab attempt adds 5 s. These are single-run diagnostic timings, not a statistically valid browser-speed comparison.
- Partial, challenge and wrong-entity pages count as failures for reviews even when HTTP status is 200. Full Google reviews, Tripadvisor access, provider identity resolution, production traffic and authenticated sessions remain unverified.

## Evidence and replay

Local artifacts are under [travel-data/retrieval-evals/2026-09-14-lightpanda](../travel-data/retrieval-evals/2026-09-14-lightpanda/):

- [report.json](../travel-data/retrieval-evals/2026-09-14-lightpanda/report.json): exact queries/URLs, timestamps, navigation/extraction/total durations, status codes, result rows, redirects and errors.
- [assessment.json](../travel-data/retrieval-evals/2026-09-14-lightpanda/assessment.json): relevance counts and cross-browser content checks.
- Per-page HTML, text, Markdown, links, JSON-LD and Chrome screenshots, including [the Maps rating screenshot](../travel-data/retrieval-evals/2026-09-14-lightpanda/chrome-maps-candidate.png).
- `eval.mjs` and `assess.mjs`: standalone scripts used for the evaluation. No agent or provider module is invoked. Artifacts and the downloaded browser are local ignored files, not included in the commit.

For a fresh replay, set `RETRIEVAL_EVAL_DIR` to a new absolute directory, start `travel-data/bin/lightpanda serve --host 127.0.0.1 --port 9223` with `LIGHTPANDA_DISABLE_TELEMETRY=true`, and run the saved `eval.mjs` with no mode flag first. Subsequent modes `--searxng`, `--sources`, `--control`, `--maps-detail`, `--maps-reviews`, and `--control --maps-detail` append to that directory's report. The script uses this workspace's Playwright installation and local Chrome path. The assessment script records this run's manual judgments and paths; reassess new results rather than copying those scores to another run.

## Decision

Do not wire this into the app as a reliable reviews replacement yet. The useful component is deterministic page reading, which worked without Gemini or Stagehand. Next work should address search result relevance and source discovery, exact listing identity, and explicit detection of limited/challenge responses. Keep the successfully observed Google previews as evidence that page retrieval is feasible, not as proof that reviews are consistently available.
