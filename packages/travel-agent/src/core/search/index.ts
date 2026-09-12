/**
 * Search provider exports and auto-detection.
 */

export { createBraveSearchProvider } from "./brave.js";
export { createFailoverSearchProvider, type FailoverSearchOptions } from "./failover.js";
export { createGoogleGeminiSearchProvider } from "./google-gemini.js";
export { createLinkupSearchProvider } from "./linkup.js";
export { createObscuraSearchProvider } from "./obscura.js";
export {
	createStagehandSearchProvider,
	loadStagehandOptionsFromEnv,
	type ResolvedStagehandConfig,
	type StagehandClient,
	type StagehandSearchEngine,
	type StagehandSearchOptions,
} from "./stagehand.js";
export type { SearchProvider, SearchResult } from "./types.js";

import type { FailoverEvent } from "../failover.js";
import { createBraveSearchProvider } from "./brave.js";
import { createFailoverSearchProvider } from "./failover.js";
import { createGoogleGeminiSearchProvider } from "./google-gemini.js";
import { createLinkupSearchProvider } from "./linkup.js";
import { createObscuraSearchProvider } from "./obscura.js";
import { createStagehandSearchProvider, loadStagehandOptionsFromEnv } from "./stagehand.js";
import type { SearchProvider } from "./types.js";

export interface DetectSearchProviderOptions {
	/** API key to fall back to when STAGEHAND_API_KEY / OLLAMA_API_KEY are not set. */
	stagehandFallbackApiKey?: string;
}

/**
 * Auto-detect a search provider from environment variables.
 *
 * Stagehand (Playwright-driven agentic browser search, defaulting to Ollama
 * Cloud's `minimax-m2:cloud`) is the default web search tool. Users opt out
 * of Stagehand explicitly by setting `USE_STAGEHAND=0` or `false`, in which
 * case the legacy API-key providers are tried in order:
 *
 *   Brave > Linkup > Google Gemini > Obscura
 *
 * Returns null only when Stagehand is disabled and no other provider is set.
 */
export function detectSearchProvider(opts: DetectSearchProviderOptions = {}): SearchProvider | null {
	const stagehandEnv = process.env.USE_STAGEHAND;
	const stagehandDisabled = stagehandEnv === "0" || stagehandEnv?.toLowerCase() === "false";

	if (!stagehandDisabled) {
		return createStagehandSearchProvider(loadStagehandOptionsFromEnv(opts.stagehandFallbackApiKey));
	}

	if (process.env.BRAVE_API_KEY) {
		return createBraveSearchProvider(process.env.BRAVE_API_KEY);
	}
	if (process.env.LINKUP_API_KEY) {
		return createLinkupSearchProvider(process.env.LINKUP_API_KEY);
	}
	if (process.env.GEMINI_API_KEY) {
		return createGoogleGeminiSearchProvider(process.env.GEMINI_API_KEY);
	}
	if (process.env.USE_OBSCURA || process.env.OBSCURA_SEARCH) {
		return createObscuraSearchProvider();
	}
	return null;
}

/** True for pi-ai provider ids that expose a Gemini/Google-Search-grounding key. */
export function isGeminiProvider(provider: string | undefined): boolean {
	const p = provider?.trim().toLowerCase();
	return p === "google" || p === "gemini" || p === "google-generative-ai";
}

export interface BuildWebSearchProviderOptions extends DetectSearchProviderOptions {
	/**
	 * Gemini key used for the primary Google-Search-grounding provider. Under
	 * BYOK-Gemini this is the user's own session key, so grounding is billed to
	 * them and rate-limited per user (ADR 0002 / spec M1).
	 */
	geminiApiKey?: string;
	/** Per-provider failover timeout in ms. */
	timeoutMs?: number;
	/** Failover telemetry callback. */
	onFailover?: (event: FailoverEvent) => void;
}

/**
 * Build the web-search capability as a failover provider:
 * primary = Gemini grounding (user's key) when a Gemini key is available;
 * fallback = whatever `detectSearchProvider` resolves (Stagehand by default).
 *
 * Returns null only when neither a Gemini key nor any detected provider exists.
 */
export function buildWebSearchProvider(opts: BuildWebSearchProviderOptions = {}): SearchProvider | null {
	const providers: SearchProvider[] = [];

	const geminiKey = opts.geminiApiKey ?? process.env.GEMINI_API_KEY;
	if (geminiKey) {
		providers.push(createGoogleGeminiSearchProvider(geminiKey));
	}

	let detected: SearchProvider | null = null;
	try {
		detected = detectSearchProvider({ stagehandFallbackApiKey: opts.stagehandFallbackApiKey });
	} catch (error) {
		// An unconfigured optional fallback must not disable a working BYOK primary.
		if (providers.length === 0) throw error;
	}
	// Avoid listing Gemini twice if detection also resolved to it.
	if (detected && !(providers.length > 0 && detected.name === "google-gemini")) {
		providers.push(detected);
	}

	if (providers.length === 0) return null;
	return createFailoverSearchProvider(providers, { timeoutMs: opts.timeoutMs, onFailover: opts.onFailover });
}
