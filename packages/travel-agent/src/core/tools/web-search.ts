/**
 * web_search tool — Search the web for travel information.
 *
 * Wraps the pluggable SearchProvider interface.
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { SearchProvider, SearchResult } from "../search/types.js";

const webSearchSchema = Type.Object({
	query: Type.String({
		description: "Search query for travel research (destinations, activities, hotels, flights, etc.)",
	}),
	num_results: Type.Optional(Type.Number({ description: "Number of results to return (default: 5, max: 10)" })),
});

type WebSearchInput = Static<typeof webSearchSchema>;

export interface WebSearchDetails {
	query: string;
	resultCount: number;
	provider: string;
}

export function createWebSearchTool(
	searchProvider: SearchProvider,
): AgentTool<typeof webSearchSchema, WebSearchDetails> {
	return {
		name: "web_search",
		label: "Web Search",
		description:
			"Search the web for travel-related information. Use this to research destinations, " +
			"activities, hotels, flights, reviews, and travel tips. Returns titles, URLs, and snippets.",
		parameters: webSearchSchema,
		async execute(
			_toolCallId: string,
			params: WebSearchInput,
			signal?: AbortSignal,
		): Promise<AgentToolResult<WebSearchDetails>> {
			const numResults = Math.min(params.num_results ?? 5, 10);
			const results = await searchProvider.search(params.query, numResults, signal);
			const formatted = formatSearchResults(results);

			return {
				content: [{ type: "text", text: formatted }],
				details: {
					query: params.query,
					resultCount: results.length,
					provider: searchProvider.name,
				},
			};
		},
	};
}

function formatSearchResults(results: SearchResult[]): string {
	if (results.length === 0) {
		return "No results found.";
	}
	return results
		.map((r, i) => {
			const lines = [`${i + 1}. ${r.title}`, `   URL: ${r.url}`, `   ${r.snippet}`];
			if (r.content) {
				const truncated = r.content.length > 500 ? `${r.content.slice(0, 500)}...` : r.content;
				lines.push(`   Content: ${truncated}`);
			}
			return lines.join("\n");
		})
		.join("\n\n");
}
