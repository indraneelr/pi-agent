/**
 * Google Gemini Search (Grounding) provider.
 *
 * Uses the Gemini API with Google Search grounding to fetch search results.
 * Requires GEMINI_API_KEY environment variable.
 */

import type { SearchProvider, SearchResult } from "./types.js";

export function createGoogleGeminiSearchProvider(apiKey: string): SearchProvider {
	return {
		name: "google-gemini",
		async search(query: string, numResults = 5, signal?: AbortSignal): Promise<SearchResult[]> {
			const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

			const response = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					contents: [{ parts: [{ text: query }] }],
					tools: [{ googleSearch: {} }],
				}),
				signal,
			});

			if (!response.ok) {
				throw new Error(`Gemini search failed: ${response.status} ${response.statusText}`);
			}

			const data = (await response.json()) as GeminiResponse;
			return mapGeminiResults(data, numResults);
		},
	};
}

interface GeminiResponse {
	candidates?: Array<{
		content?: {
			parts?: Array<{ text?: string }>;
		};
		groundingMetadata?: {
			groundingChunks?: Array<{
				web?: { uri: string; title: string };
			}>;
			searchEntryPoint?: {
				renderedContent?: string;
			};
		};
	}>;
}

function mapGeminiResults(data: GeminiResponse, numResults: number): SearchResult[] {
	const candidate = data.candidates?.[0];
	if (!candidate) return [];

	const chunks = candidate.groundingMetadata?.groundingChunks ?? [];
	const textContent = candidate.content?.parts?.map((p) => p.text ?? "").join("\n") ?? "";

	const results: SearchResult[] = chunks.slice(0, numResults).map((chunk) => ({
		title: chunk.web?.title ?? "Search Result",
		url: chunk.web?.uri ?? "",
		snippet: textContent.slice(0, 200),
	}));

	// If no grounding chunks but we have text, return it as a single result
	if (results.length === 0 && textContent) {
		results.push({
			title: "Gemini Search Result",
			url: "",
			snippet: textContent.slice(0, 200),
			content: textContent,
		});
	}

	return results;
}
