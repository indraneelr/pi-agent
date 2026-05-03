/**
 * Search provider types.
 *
 * Pluggable interface for web search — implementations for Brave, Linkup,
 * and Google Gemini are provided separately.
 */

export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
	/** Full page content if available from the search provider. */
	content?: string;
}

export interface SearchProvider {
	/** Provider name for logging/display. */
	name: string;
	/** Perform a web search and return results. */
	search(query: string, numResults?: number, signal?: AbortSignal): Promise<SearchResult[]>;
}
