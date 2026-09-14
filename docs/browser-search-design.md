# Browser search choice and editable templates

Assessment date: 2026-09-14. Scope: choose a browser for retrieving search results and reading source pages; create the template catalogue. No browser migration or runtime query changes in this change.

Update: the [standalone live evaluation](lightpanda-retrieval-evaluation-2026-09-14.md) found successful article reading and partial Google Maps review retrieval, but blocked search/Tripadvisor access and inconsistent Maps responses. Read those findings before choosing a production backend.

## Editable catalogue

Edit [search-templates.json](../packages/travel-agent/search-templates.json). It contains six purpose IDs, descriptions, named query alternatives and a shared placeholder glossary. All query wording is draft for user editing. The running agent does not load this file yet.

Intended selection: choose a purpose, choose one query ID, substitute literal values, then URL-encode the complete query. For example, `find_tripadvisor_listing.listing` with `exact_place=Hoi An Ancient Town` and `location=Vietnam`. Keep query IDs stable while editing wording. Reject missing variables and unresolved placeholders when implementing the loader. Escape search operators in values separately from URL encoding so place names cannot introduce unintended query syntax.

Keep search terms separate from model instructions. A provider-specific search finds candidate listings; opening the result, resolving redirects and matching the requested entity establishes whether it can support a rating. A city summary and an attraction rating need separate labels.

## Recommendation

Use **Lightpanda with direct Playwright/CDP operations** as the first candidate for the new page reader, with Chromium as a compatibility fallback. This is a documentation-based engineering recommendation, not a measured claim that Lightpanda retrieves more Google or Tripadvisor reviews.

The deciding feature for this task is Lightpanda's native post-JavaScript Markdown and accessibility-tree extraction. It supplies readable page evidence without adding a model call to every page. Its [content extraction guide](https://lightpanda.io/docs/guides/markdown-axtree) documents CLI, CDP and MCP access; the [Playwright guide](https://lightpanda.io/docs/usage/cdp/playwright) documents direct connections and page operations.

Obscura remains a viable alternative, especially for the smallest change to this repository. It supports JavaScript, DOM extraction, a fetch CLI and CDP automation. The [upstream README](https://github.com/h4ckf0r0day/obscura) also describes its evolving independent engine and compatibility differences from Chromium. Its advertised performance and stealth are not evidence of success on our target sites.

| Criterion | Lightpanda | Obscura |
| --- | --- | --- |
| Extract known search-result fields | Direct DOM selectors through CDP | Direct DOM selectors through CLI or CDP; repo adapter already does this |
| Read source pages | Native Markdown and accessibility-tree extraction, plus DOM access | Text/HTML extraction and DOM access |
| Existing local integration | New backend required | Existing DuckDuckGo results adapter; page-reading workflow still missing |
| Stagehand required | No | No |
| Fit for this task | Preferred candidate for structured page reading | Lower initial integration effort |
| Google/Tripadvisor success | Must be tested on actual listings | Must be tested on actual listings |

Both have direct automation routes. Stagehand is an optional layer for model-directed actions and extraction, not a browser requirement. Lightpanda documents a separate [Stagehand integration](https://lightpanda.io/docs/guides/use-stagehand); Obscura documents [direct Playwright use](https://github.com/h4ckf0r0day/obscura/blob/main/docs/Use-with-Playwright.md). Ordinary navigation, waits, selectors, link extraction and text reading do not require an LLM. Interpretation of extracted reviews can remain with the existing Gemini travel agent.

## Current repository evidence

- `packages/travel-agent/src/core/search/obscura.ts` invokes the local binary with `fetch --quiet --eval`, queries DuckDuckGo HTML result selectors, and returns title/URL/snippet. It does not open destination pages or extract provider ratings.
- `/Users/indraneel/.obscura/obscura` exists. Its local `fetch --help` supports HTML/text/links and JavaScript evaluation, but lacks the `--timeout` flag in current upstream documentation. `--version` is rejected. The binary version could not be identified through that flag; do not assume current upstream feature parity.
- The existing Stagehand adapter asks an LLM to extract result fields and optionally summarize each page. That extra model layer is unnecessary for deterministic extraction.
- No head-to-head site benchmark, browser download, live search or paid model call was performed for this assessment. Neither browser is claimed to solve blocked pages or guarantee provider review access.

## Proposed retrieval path

1. Render the selected template and log purpose ID, query ID and rendered query.
2. Discover URLs through a search provider. SearxNG can supply discovery results without automating a search-engine UI; a browser search adapter is another option.
3. Open a bounded number of results. Record the final URL, title, retrieval time and exact entity. Preserve attributed page evidence rather than copying a shared answer snippet onto every source.
4. Extract search result fields, structured page data and review text with ordinary code. For dynamic pages, perform known interactions and wait for the expected content.
5. If an engine cannot load the page correctly, retry once in Chromium. A consent/challenge page must be identified as unavailable evidence, not parsed as a review or rated as a successful fetch.
6. Ask Gemini to summarize the collected evidence once. Save only ratings and counts directly supported by the matching provider listing. Keep missing ratings explicit.

Proposed initial limits: two provider searches per place, one refined search retry total, four source-page visits, and one browser compatibility retry. Surface search, reading and completion/failure in the UI. These are proposed limits, not settings implemented by the catalogue.

Before selecting a production default, run the same fixed cases in both browsers and Chromium: a results page, an article, a Google Maps listing and a Tripadvisor listing. Check actual content, resolved URLs, entity/rating/count accuracy, redirects, cancellation and block detection. Choose based on correct evidence retrieval, not page-load timing alone.
