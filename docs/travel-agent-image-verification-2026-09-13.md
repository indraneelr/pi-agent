# Image retrieval verification — 2026-09-13

## Cause

`parseSearxngCandidates` emitted the original image and every thumbnail as separate candidates, assigning the original resolution to all variants. URL-only deduplication could not recognize the same photo at different URLs. The saved Da Nang gallery contained four originals and four Bing thumbnails; Wikimedia originals and thumbnails were duplicated in other galleries too.

Measured 26 saved preview images: actual heights were 185–591px despite recorded heights of 720px or more. Those invalid entries were removed after backing up both saved trips.

## Request and configuration

The recorded agent call was `get_images({query: "Da Nang My Khe Beach and Marble Mountains", destination_name: "Da Nang", count: 8, min_height: 720})`. The eight-photo count and height filter are applied by the application after SearxNG returns candidates; they are not SearxNG HTTP parameters.

Original HTTP request: `GET http://127.0.0.1:8888/search?q=Da+Nang+My+Khe+Beach+and+Marble+Mountains&categories=images&format=json&safesearch=1`.

Container `searxng` uses `searxng/searxng:latest`, exposes port 8888 to container port 8080, and mounts `/Users/indraneel/dev/POC/bravesearch/img-search/searxng` at `/etc/searxng`. Its settings enable default engines and JSON output. The initial request returned 310 results: 250 devicons, 35 Bing images and 25 Flickr results. Some other engines reported access denial, CAPTCHA or parsing errors.

The corrected request uses `engines=bing images,duckduckgo images,flickr,wikicommons`, `format=json` and `safesearch=1`, without `categories`. The installed SearxNG `webadapter.py` adds category engines to explicit engine selections, so keeping `categories=images` defeats the restriction. Engine-only selection returned 60 photo results and no devicons. Engines can be overridden with `SEARXNG_IMAGE_ENGINES`; the shared container configuration was left intact.

## Fix and checks

- Group original/thumbnail variants by original image identity. Preserve thumbnail fallback, but probe its own dimensions and accept at most one variant.
- Exclude saved image identities and redirect destinations before counting new photos. Normalize protocol-relative image URLs and use publisher-page source links.
- Defensively deduplicate final URLs in the renderer.
- 41 targeted tests passed: image parsing, retrieval, validation, persistence, renderer and desktop/mobile browser journey. The browser fixture now includes original/thumbnail pairs and checks all 16 entries after two calls and a reload.
- Two corrected live retrieval calls produced seven plus one new photo; all eight loaded in a browser at 720px or higher and were visually inspected as distinct photos. The request still targets eight per call; availability and the bounded validation time can produce fewer.
- The real saved Hanoi gallery was also tested through See more images, HTTP/SSE, carousel navigation and page reload: it grew from two cleaned photos to five distinct entries, adding three new photos without repeating the existing ones.
- Root checks and web type checking passed. No Gemini calls were used.

Request/response captures, cleanup measurements and screenshots are under `/tmp/wander-images-20260913`. Identity and redirect deduplication address this reported bug; this is not perceptual duplicate detection across unrelated websites hosting modified copies.
