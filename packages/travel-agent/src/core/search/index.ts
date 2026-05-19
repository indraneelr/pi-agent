/**
 * Search provider exports and auto-detection.
 */

export { createBraveSearchProvider } from "./brave.js";
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

import { createBraveSearchProvider } from "./brave.js";
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
