/**
 * Linkup Search API provider.
 *
 * Uses the Linkup API: https://api.linkup.so/
 * Requires LINKUP_API_KEY environment variable.
 */

import type { SearchProvider, SearchResult } from "./types.js";

export function createLinkupSearchProvider(apiKey: string): SearchProvider {
	return {
		name: "linkup",
		async search(query: string, numResults = 5, signal?: AbortSignal): Promise<SearchResult[]> {
			const response = await fetch("https://api.linkup.so/v1/search", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					q: query,
					depth: "standard",
					outputType: "searchResults",
					numResults,
				}),
				signal,
			});

			if (!response.ok) {
				throw new Error(`Linkup search failed: ${response.status} ${response.statusText}`);
			}

			const data = (await response.json()) as LinkupSearchResponse;
			return mapLinkupResults(data);
		},
	};
}

interface LinkupSearchResponse {
	results?: Array<{
		name: string;
		url: string;
		content: string;
	}>;
}

function mapLinkupResults(data: LinkupSearchResponse): SearchResult[] {
	const results = data.results ?? [];
	return results.map((r) => ({
		title: r.name,
		url: r.url,
		snippet: r.content.length > 200 ? `${r.content.slice(0, 200)}...` : r.content,
		content: r.content,
	}));
}
