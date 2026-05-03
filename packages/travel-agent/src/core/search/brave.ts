/**
 * Brave Search API provider.
 *
 * Uses the Brave Web Search API: https://api.search.brave.com/
 * Requires BRAVE_API_KEY environment variable.
 */

import type { SearchProvider, SearchResult } from "./types.js";

export function createBraveSearchProvider(apiKey: string): SearchProvider {
	return {
		name: "brave",
		async search(query: string, numResults = 5, signal?: AbortSignal): Promise<SearchResult[]> {
			const url = new URL("https://api.search.brave.com/res/v1/web/search");
			url.searchParams.set("q", query);
			url.searchParams.set("count", String(numResults));

			const response = await fetch(url.toString(), {
				headers: {
					Accept: "application/json",
					"Accept-Encoding": "gzip",
					"X-Subscription-Token": apiKey,
				},
				signal,
			});

			if (!response.ok) {
				throw new Error(`Brave search failed: ${response.status} ${response.statusText}`);
			}

			const data = (await response.json()) as BraveSearchResponse;
			return mapBraveResults(data);
		},
	};
}

interface BraveSearchResponse {
	web?: {
		results?: Array<{
			title: string;
			url: string;
			description: string;
			extra_snippets?: string[];
		}>;
	};
}

function mapBraveResults(data: BraveSearchResponse): SearchResult[] {
	const results = data.web?.results ?? [];
	return results.map((r) => ({
		title: r.title,
		url: r.url,
		snippet: r.description,
		content: r.extra_snippets?.join("\n"),
	}));
}
