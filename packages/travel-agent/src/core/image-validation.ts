/**
 * Image link validation and real image fetching.
 *
 * Problem this solves:
 *   The agent is an LLM and routinely emits *plausible-looking* image URLs
 *   (especially Wikipedia Commons thumbnail URLs with hallucinated hash paths)
 *   that pass a simple regex check but 404 in the browser. There is no real
 *   image-search tool, so we (a) verify candidate links with a real HTTP check
 *   and (b) fetch genuinely-reachable replacement images from the Wikimedia
 *   Commons API using the agent's own imageQuery.
 *
 * Everything here is deterministic (no LLM). The HTTP transport is injectable
 * so the logic is unit-testable without network access.
 */

export interface ImageLinkValidation {
	url: string;
	ok: boolean;
	status: number;
	contentType: string | null;
	reason?: string;
}

export interface ValidateImageUrlsOptions {
	/** Per-request timeout in ms. Default: 12_000. */
	timeoutMs?: number;
	/** Max concurrent requests. Default: 5. */
	concurrency?: number;
	/**
	 * Inject an HTTP implementation for testing. Must resolve with status +
	 * content-type for a HEAD/GET on the URL.
	 */
	http?: ImageHttpProbe;
	/** AbortSignal for cooperative cancellation. */
	signal?: AbortSignal;
}

export interface ImageHttpProbeResponse {
	status: number;
	contentType: string | null;
}

export type ImageHttpProbe = (
	url: string,
	opts: { timeoutMs: number; signal?: AbortSignal },
) => Promise<ImageHttpProbeResponse>;

/** Default probe: HEAD with GET fallback, follows redirects, verifies image content-type. */
export const defaultImageHttpProbe: ImageHttpProbe = async (url, { timeoutMs, signal }) => {
	const headers: Record<string, string> = {
		// Wikimedia + most open hosts block bare/unknown user agents with 403/429.
		"user-agent": "PiTravelAgent/1.0 (https://github.com/oraios; image-link-validator)",
		accept: "image/*",
	};

	async function attempt(method: "HEAD" | "GET"): Promise<ImageHttpProbeResponse> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		const onParentAbort = () => controller.abort();
		signal?.addEventListener("abort", onParentAbort, { once: true });
		try {
			// GET uses a tiny range so we don't download the whole image.
			const res = await fetch(url, {
				method,
				headers: method === "GET" ? { ...headers, range: "bytes=0-0" } : headers,
				redirect: "follow",
				signal: controller.signal,
			});
			return { status: res.status, contentType: res.headers.get("content-type") };
		} finally {
			clearTimeout(timer);
			signal?.removeEventListener("abort", onParentAbort);
		}
	}

	// Prefer HEAD; some hosts forbid it (405) so fall back to a ranged GET.
	const head = await attempt("HEAD");
	if (head.status >= 200 && head.status < 400) return head;
	if (head.status === 405 || head.status === 403 || head.status === 501) {
		return attempt("GET");
	}
	return head;
};

function isImageContentType(contentType: string | null): boolean {
	if (!contentType) return false;
	const ct = contentType.toLowerCase();
	if (ct.startsWith("image/")) return true;
	// Some CDNs serve octet-stream for webp/avif; accept only if the URL itself looks like an image.
	return false;
}

function looksLikeImageUrl(url: string): boolean {
	return /^https?:\/\/.+\.(?:jpe?g|png|webp|gif|avif)(?:[?#].*)?$/i.test(url.trim());
}

/**
 * Validate an array of candidate image URLs with real HTTP probes.
 * Returns one result per input URL, preserving order.
 */
export async function validateImageUrls(
	urls: string[],
	options: ValidateImageUrlsOptions = {},
): Promise<ImageLinkValidation[]> {
	const timeoutMs = options.timeoutMs ?? 12_000;
	const concurrency = Math.max(1, options.concurrency ?? 5);
	const probe = options.http ?? defaultImageHttpProbe;
	const signal = options.signal;

	const unique = Array.from(new Set(urls.map((u) => u.trim()).filter(Boolean)));
	const results = new Map<string, ImageLinkValidation>();

	// Simple bounded-concurrency pool.
	let cursor = 0;
	async function worker() {
		while (cursor < unique.length) {
			const index = cursor++;
			const url = unique[index];
			if (!url) continue;
			if (!/^https?:\/\//i.test(url)) {
				results.set(url, { url, ok: false, status: 0, contentType: null, reason: "not an http(s) url" });
				continue;
			}
			try {
				const res = await probe(url, { timeoutMs, signal });
				const imageish =
					res.status >= 200 && res.status < 400 && (isImageContentType(res.contentType) || looksLikeImageUrl(url));
				results.set(url, {
					url,
					ok: imageish,
					status: res.status,
					contentType: res.contentType,
					reason: imageish ? undefined : `status=${res.status} content-type=${res.contentType ?? "unknown"}`,
				});
			} catch (e) {
				const reason = e instanceof Error ? e.message : String(e);
				results.set(url, { url, ok: false, status: 0, contentType: null, reason: reason.slice(0, 160) });
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, () => worker()));

	return urls
		.map((u) => u.trim())
		.filter(Boolean)
		.map((url) => results.get(url)!)
		.filter(Boolean);
}

/**
 * Split candidate URLs into valid/broken buckets.
 */
export async function filterValidImageUrls(
	urls: string[],
	options?: ValidateImageUrlsOptions,
): Promise<{ valid: string[]; broken: ImageLinkValidation[] }> {
	const results = await validateImageUrls(urls, options);
	const valid = results.filter((r) => r.ok).map((r) => r.url);
	const broken = results.filter((r) => !r.ok);
	return { valid, broken };
}

// =============================================================================
// Wikimedia Commons real-image fetcher
// =============================================================================

export interface WikimediaImageOptions {
	/** Max images to return. Default: 3. */
	limit?: number;
	/** Thumbnail width in px. Default: 800. */
	width?: number;
	http?: WikimediaHttp;
	timeoutMs?: number;
	signal?: AbortSignal;
}

export type WikimediaHttp = (url: string, opts: { timeoutMs: number; signal?: AbortSignal }) => Promise<string>;

interface WikimediaResponse {
	query?: {
		pages?: Record<
			string,
			{
				title?: string;
				imageinfo?: Array<{ thumburl?: string; url?: string; mime?: string }>;
			}
		>;
	};
}

const defaultWikimediaHttp: WikimediaHttp = async (url, { timeoutMs, signal }) => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const onParentAbort = () => controller.abort();
	signal?.addEventListener("abort", onParentAbort, { once: true });
	try {
		const res = await fetch(url, {
			headers: {
				"user-agent": "PiTravelAgent/1.0 (https://github.com/oraios; image-link-validator)",
				accept: "application/json",
			},
			redirect: "follow",
			signal: controller.signal,
		});
		return await res.text();
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", onParentAbort);
	}
};

/**
 * Search the Wikimedia Commons API for genuinely-reachable image thumbnail URLs.
 * Returns [] on any error — callers treat empty as "no images found" and keep
 * the agent's imageQuery for fallback.
 */
export async function fetchImageUrlsFromQuery(query: string, options: WikimediaImageOptions = {}): Promise<string[]> {
	const limit = Math.min(5, Math.max(1, options.limit ?? 3));
	const width = options.width ?? 800;
	const http = options.http ?? defaultWikimediaHttp;
	const timeoutMs = options.timeoutMs ?? 12_000;
	const trimmed = query.trim();
	if (!trimmed) return [];

	const endpoint =
		"https://commons.wikimedia.org/w/api.php?action=query&format=json" +
		"&generator=search&gsrnamespace=6&gsrlimit=" +
		limit +
		"&gsrsearch=" +
		encodeURIComponent(trimmed) +
		"&prop=imageinfo&iiprop=url|mime&iiurlwidth=" +
		width;

	try {
		const raw = await http(endpoint, { timeoutMs, signal: options.signal });
		const json = JSON.parse(raw) as WikimediaResponse;
		const pages = json.query?.pages ?? {};
		const urls: string[] = [];
		for (const page of Object.values(pages)) {
			const info = page.imageinfo?.[0];
			const url = info?.thumburl ?? info?.url;
			if (url && /^https?:\/\//i.test(url)) urls.push(url);
		}
		return urls;
	} catch {
		return [];
	}
}

// =============================================================================
// Destination-research image cleaning
// =============================================================================

export interface ImageCleanReport {
	totalChecked: number;
	valid: number;
	broken: number;
	refetched: number;
}

/**
 * Given a set of sub-destination cards (with imageLinks + imageQuery), validate
 * each card's links, drop broken ones, and — when a card is left with none —
 * fetch real replacements from Wikimedia using the card's imageQuery.
 *
 * Mutates cards in place by replacing `imageLinks` with the cleaned set.
 * Non-throwing: a card simply ends with [] if no images can be confirmed.
 */
export async function cleanDestinationImageLinks(
	cards: Array<{ name?: string; imageQuery?: string; imageLinks?: string[] }>,
	options: { validate?: ValidateImageUrlsOptions; refetch?: boolean; wikimedia?: WikimediaImageOptions } = {},
): Promise<ImageCleanReport> {
	const validate = options.validate ?? {};
	const refetch = options.refetch ?? true;
	const wikimedia = options.wikimedia ?? {};
	let totalChecked = 0;
	let validCount = 0;
	let brokenCount = 0;
	let refetched = 0;

	for (const card of cards) {
		const candidates = (card.imageLinks ?? []).filter((u) => typeof u === "string");
		totalChecked += candidates.length;
		if (candidates.length === 0 && !refetch) continue;

		const { valid, broken } = await filterValidImageUrls(candidates, validate);
		validCount += valid.length;
		brokenCount += broken.length;
		let cleaned = valid;

		if (cleaned.length === 0 && refetch && card.imageQuery) {
			const fetched = await fetchImageUrlsFromQuery(card.imageQuery, wikimedia);
			// Verify the freshly fetched URLs too (catch API drift / rate limits).
			const verified = await filterValidImageUrls(fetched, validate);
			if (verified.valid.length > 0) {
				cleaned = verified.valid;
				refetched += verified.valid.length;
			}
		}
		card.imageLinks = cleaned;
	}

	return { totalChecked, valid: validCount, broken: brokenCount, refetched };
}
