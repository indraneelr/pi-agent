/**
 * Search provider exports and auto-detection.
 */

export { createBraveSearchProvider } from "./brave.js";
export { createGoogleGeminiSearchProvider } from "./google-gemini.js";
export { createLinkupSearchProvider } from "./linkup.js";
export { createObscuraSearchProvider } from "./obscura.js";
export type { SearchProvider, SearchResult } from "./types.js";

import { createBraveSearchProvider } from "./brave.js";
import { createGoogleGeminiSearchProvider } from "./google-gemini.js";
import { createLinkupSearchProvider } from "./linkup.js";
import { createObscuraSearchProvider } from "./obscura.js";
import type { SearchProvider } from "./types.js";

/**
 * Auto-detect an available search provider from environment variables.
 * Priority: Brave > Linkup > Google Gemini.
 * Returns null if no search API key is found.
 */
export function detectSearchProvider(): SearchProvider | null {
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
