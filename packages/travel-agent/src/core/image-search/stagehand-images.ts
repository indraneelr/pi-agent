/** Stagehand/Playwright image-search provider. */

import { Stagehand } from "@browserbasehq/stagehand";
import {
	loadStagehandOptionsFromEnv,
	type ResolvedStagehandConfig,
	type StagehandSearchOptions,
} from "../search/stagehand.js";
import type { ImageCandidate, ImageSearchProvider, ImageSearchQuery, ImageSearchResult } from "./types.js";
import { type ValidateImageCandidatesOptions, validateImageCandidates } from "./validate.js";

export interface StagehandImageSearchOptions extends Omit<StagehandSearchOptions, "clientFactory"> {
	validate?: ValidateImageCandidatesOptions["validate"];
	dimensionProbe?: ValidateImageCandidatesOptions["dimensionProbe"];
	clientFactory?: (config: ResolvedStagehandConfig) => StagehandImageClient;
}

export interface StagehandImageClient {
	init(): Promise<void>;
	close(): Promise<void>;
	goto(url: string, opts?: { timeout?: number }): Promise<void>;
	extractImageCandidates(limit: number): Promise<ImageCandidate[]>;
}

export function createStagehandImageSearchProvider(options: StagehandImageSearchOptions = {}): ImageSearchProvider {
	const config = resolveImageStagehandConfig(options);
	const factory = options.clientFactory ?? defaultStagehandImageClientFactory;
	let clientPromise: Promise<StagehandImageClient> | null = null;
	let closed = false;

	async function getClient(): Promise<StagehandImageClient> {
		if (closed) throw new Error("Stagehand image search provider has been closed.");
		if (!clientPromise) {
			const client = factory(config);
			clientPromise = client.init().then(() => client);
		}
		return clientPromise;
	}

	async function close(): Promise<void> {
		if (closed) return;
		closed = true;
		if (clientPromise) {
			try {
				await (await clientPromise).close();
			} catch {
				// best effort
			}
		}
	}

	return {
		name: "stagehand",
		async searchImages(query: ImageSearchQuery): Promise<ImageSearchResult> {
			const onAbort = () => void close();
			query.signal?.addEventListener("abort", onAbort, { once: true });
			try {
				const client = await getClient();
				await client.goto(buildImageSearchUrl(query.query), { timeout: config.timeoutMs });
				const candidates = await client.extractImageCandidates(Math.max(query.count * 4, 20));
				const validated = await validateImageCandidates(candidates, {
					minHeight: query.minHeight,
					maxHeight: query.maxHeight,
					limit: query.count,
					validate: options.validate,
					dimensionProbe: options.dimensionProbe,
					signal: query.signal,
				});
				return {
					provider: "stagehand",
					images: withEvidenceProvider(validated.images, "stagehand"),
					rejectedCount: validated.rejectedCount,
				};
			} finally {
				query.signal?.removeEventListener("abort", onAbort);
			}
		},
	};
}

function resolveImageStagehandConfig(options: StagehandImageSearchOptions): ResolvedStagehandConfig {
	// Reuse the env loader/defaults from web search, then overlay explicit options.
	const fromEnv = loadStagehandOptionsFromEnv(options.fallbackApiKey);
	const merged = { ...fromEnv, ...options };
	// create a tiny provider to force the existing config resolution path is not exported,
	// so mirror the documented defaults here.
	const modelName = merged.modelName ?? "ollama/minimax-m2.7:cloud";
	const ollama = modelName.toLowerCase().startsWith("ollama/");
	const apiKey = merged.apiKey ?? (ollama ? process.env.OLLAMA_API_KEY : undefined) ?? merged.fallbackApiKey ?? "";
	if (!apiKey) {
		throw new Error("Stagehand image search requires STAGEHAND_API_KEY or OLLAMA_API_KEY.");
	}
	return {
		modelName,
		apiKey,
		baseURL: merged.baseURL ?? (ollama ? "https://ollama.com/api" : undefined),
		headless: merged.headless ?? true,
		searchEngine: merged.searchEngine ?? "duckduckgo",
		visitResults: false,
		timeoutMs: merged.timeoutMs ?? 120_000,
		verbose: merged.verbose ?? 0,
	};
}

function buildImageSearchUrl(query: string): string {
	// Bing Images exposes useful DOM img.currentSrc/naturalWidth/naturalHeight in local Playwright.
	return `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1`;
}

function withEvidenceProvider<T extends { evidence?: { provider: string } }>(images: T[], provider: "stagehand"): T[] {
	return images.map((image) => (image.evidence ? { ...image, evidence: { ...image.evidence, provider } } : image));
}

function defaultStagehandImageClientFactory(config: ResolvedStagehandConfig): StagehandImageClient {
	const ollama = config.modelName.toLowerCase().startsWith("ollama/");
	const model = ollama
		? {
				modelName: config.modelName,
				headers: { Authorization: `Bearer ${config.apiKey}` },
				...(config.baseURL ? { baseURL: config.baseURL } : {}),
			}
		: { modelName: config.modelName, apiKey: config.apiKey, ...(config.baseURL ? { baseURL: config.baseURL } : {}) };
	const stagehand = new Stagehand({
		env: "LOCAL",
		model,
		verbose: config.verbose,
		localBrowserLaunchOptions: { headless: config.headless },
	});
	return {
		async init() {
			await stagehand.init();
			await stagehand.context.newPage("about:blank");
		},
		async close() {
			await stagehand.close();
		},
		async goto(url: string, opts?: { timeout?: number }) {
			const page = stagehand.context.pages().at(-1) ?? (await stagehand.context.newPage());
			await page.goto(url, opts ? { timeoutMs: opts.timeout } : undefined);
			await page
				.waitForLoadState("domcontentloaded", Math.min(opts?.timeout ?? 30_000, 30_000))
				.catch(() => undefined);
		},
		async extractImageCandidates(limit: number) {
			const page = stagehand.context.pages().at(-1) ?? (await stagehand.context.newPage());
			return await page.evaluate((cap) => {
				const out: Array<{ url: string; width?: number; height?: number; title?: string; source?: string }> = [];
				const seen = new Set<string>();
				const doc = globalThis["document" as keyof typeof globalThis] as
					| { querySelectorAll(selector: string): Iterable<unknown> }
					| undefined;
				const loc = globalThis["location" as keyof typeof globalThis] as { href?: string } | undefined;
				if (!doc) return out;
				for (const img of Array.from(doc.querySelectorAll("img"))) {
					const el = img as {
						currentSrc?: string;
						src?: string;
						getAttribute(name: string): string | null;
						closest(selector: string): { href?: string; title?: string } | null;
						naturalWidth?: number;
						width?: number;
						naturalHeight?: number;
						height?: number;
						alt?: string;
						title?: string;
					};
					const url =
						el.currentSrc || el.src || el.getAttribute("data-src") || el.getAttribute("data-lazy-src") || "";
					if (!url.startsWith("http") || seen.has(url)) continue;
					seen.add(url);
					const anchor = el.closest("a");
					out.push({
						url,
						width: el.naturalWidth || el.width || undefined,
						height: el.naturalHeight || el.height || undefined,
						title: el.alt || el.title || anchor?.title || undefined,
						source: anchor?.href || loc?.href,
					});
					if (out.length >= cap) break;
				}
				return out;
			}, limit);
		},
	};
}
