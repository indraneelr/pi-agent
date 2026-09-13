/** SearXNG image-search provider. */

import type { ImageCandidate, ImageSearchProvider, ImageSearchQuery, ImageSearchResult } from "./types.js";
import { type ValidateImageCandidatesOptions, validateImageCandidates } from "./validate.js";

export interface SearxngImageSearchOptions {
	/** Photo engines only; avoids unrelated default icon engines. */
	engines?: string[];
	/** Base URL, e.g. http://127.0.0.1:8080. Defaults to SEARXNG_BASE_URL. */
	baseUrl?: string;
	timeoutMs?: number;
	validate?: ValidateImageCandidatesOptions["validate"];
	dimensionProbe?: ValidateImageCandidatesOptions["dimensionProbe"];
}

interface SearxngResponse {
	results?: SearxngResult[];
}

interface SearxngResult {
	title?: string;
	url?: string;
	img_src?: string;
	thumbnail?: string;
	thumbnail_src?: string;
	content?: string;
	source?: string;
	resolution?: string;
	width?: number | string;
	height?: number | string;
	img_width?: number | string;
	img_height?: number | string;
}

export function createSearxngImageSearchProvider(options: SearxngImageSearchOptions = {}): ImageSearchProvider | null {
	// Prefer explicit configuration, but default to the local SearXNG instance
	// used by the travel-agent dev/runtime VM. If it is not actually running,
	// the get_images tool catches the provider error and falls back to Stagehand.
	const baseUrl = options.baseUrl ?? process.env.SEARXNG_BASE_URL ?? "http://127.0.0.1:8080";
	return {
		name: "searxng",
		async searchImages(query: ImageSearchQuery): Promise<ImageSearchResult> {
			const started = Date.now();
			const url = new URL("/search", baseUrl.replace(/\/$/, ""));
			url.searchParams.set("q", query.query);
			// SearXNG unions category engines with explicit engines; adding the
			// images category here would re-enable default icon engines.
			url.searchParams.set("format", "json");
			url.searchParams.set("safesearch", "1");
			url.searchParams.set(
				"engines",
				(
					options.engines ??
					(process.env.SEARXNG_IMAGE_ENGINES ?? "bing images,duckduckgo images,flickr,wikicommons").split(",")
				)
					.map((engine) => engine.trim())
					.filter(Boolean)
					.join(","),
			);

			const raw = await fetchJson(url.toString(), { timeoutMs: options.timeoutMs ?? 15_000, signal: query.signal });
			const candidates = parseSearxngCandidates(raw).filter(
				(candidate) =>
					!query.excludeUrls?.includes(candidate.url) &&
					!query.excludeUrls?.includes(candidate.identityUrl ?? candidate.url),
			);
			const validated = await validateImageCandidates(candidates, {
				maxDurationMs: Math.max(0, 13_000 - (Date.now() - started)),
				minHeight: query.minHeight,
				maxHeight: query.maxHeight,
				limit: query.count,
				excludeUrls: query.excludeUrls,
				validate: { timeoutMs: 2_000, ...options.validate },
				dimensionProbe: options.dimensionProbe,
				signal: query.signal,
			});
			return { provider: "searxng", ...validated };
		},
	};
}

export function parseSearxngCandidates(response: SearxngResponse): ImageCandidate[] {
	const candidates: ImageCandidate[] = [];
	for (const result of response.results ?? []) {
		const dims = dimensionsFromResult(result);
		const original = absoluteImageUrl(result.img_src || directImageUrl(result.url));
		const thumbnails = [result.thumbnail_src, result.thumbnail].map(absoluteImageUrl);
		const identityUrl = original || thumbnails.find(Boolean);
		for (const url of [original, ...thumbnails]) {
			if (!url) continue;
			candidates.push({
				url,
				identityUrl,
				width: url === original ? dims.width : undefined,
				height: url === original ? dims.height : undefined,
				title: result.title,
				source: result.url ?? result.source,
			});
		}
	}
	return candidates;
}

function absoluteImageUrl(url: string | undefined): string | undefined {
	const value = url?.trim();
	return value?.startsWith("//") ? `https:${value}` : value;
}

async function fetchJson(url: string, opts: { timeoutMs: number; signal?: AbortSignal }): Promise<SearxngResponse> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
	const onAbort = () => controller.abort();
	opts.signal?.addEventListener("abort", onAbort, { once: true });
	try {
		const res = await fetch(url, {
			headers: { accept: "application/json", "user-agent": "PiTravelAgent/1.0 (searxng-image-search)" },
			signal: controller.signal,
		});
		if (!res.ok) throw new Error(`SearXNG image search failed: ${res.status}`);
		return (await res.json()) as SearxngResponse;
	} finally {
		clearTimeout(timer);
		opts.signal?.removeEventListener("abort", onAbort);
	}
}

function dimensionsFromResult(result: SearxngResult): { width?: number; height?: number } {
	const width = numberFrom(result.width) ?? numberFrom(result.img_width);
	const height = numberFrom(result.height) ?? numberFrom(result.img_height);
	if (width && height) return { width, height };
	const resolution = result.resolution?.match(/(\d{2,5})\s*[x×]\s*(\d{2,5})/i);
	if (resolution?.[1] && resolution[2]) return { width: Number(resolution[1]), height: Number(resolution[2]) };
	return {};
}

function numberFrom(value: unknown): number | undefined {
	const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
	return Number.isFinite(n) && n > 0 ? n : undefined;
}

function directImageUrl(url: string | undefined): string | undefined {
	if (!url) return undefined;
	return /\.(?:jpe?g|png|webp|gif|avif)(?:[?#].*)?$/i.test(url) ? url : undefined;
}
