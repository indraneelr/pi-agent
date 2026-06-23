/** SearXNG image-search provider. */

import type { ImageCandidate, ImageSearchProvider, ImageSearchQuery, ImageSearchResult } from "./types.js";
import { type ValidateImageCandidatesOptions, validateImageCandidates } from "./validate.js";

export interface SearxngImageSearchOptions {
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
			const url = new URL("/search", baseUrl.replace(/\/$/, ""));
			url.searchParams.set("q", query.query);
			url.searchParams.set("categories", "images");
			url.searchParams.set("format", "json");
			url.searchParams.set("safesearch", "1");

			const raw = await fetchJson(url.toString(), { timeoutMs: options.timeoutMs ?? 15_000, signal: query.signal });
			const candidates = parseSearxngCandidates(raw);
			const validated = await validateImageCandidates(candidates, {
				minHeight: query.minHeight,
				maxHeight: query.maxHeight,
				limit: query.count,
				validate: options.validate,
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
		for (const url of [result.img_src, result.thumbnail_src, result.thumbnail, directImageUrl(result.url)]) {
			if (!url) continue;
			candidates.push({
				url,
				width: dims.width,
				height: dims.height,
				title: result.title,
				source: result.source ?? result.url,
			});
		}
	}
	return candidates;
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
