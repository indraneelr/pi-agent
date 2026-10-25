/**
 * Exa discovery search (experimental, EXA_DISCOVERY=1).
 *
 * One broad `lite` search per destination returns a large result pool that the
 * discover_places tool refines locally. `lite` does not accept outputSchema, so
 * place extraction happens outside Exa.
 */

export const EXA_DISCOVERY_RESULTS = 50;
export const EXA_RECENCY_YEARS = 5;

export interface ExaDiscoveryResult {
	title: string;
	url: string;
	publishedDate?: string;
	highlights: string[];
}

export interface ExaDiscoveryResponse {
	results: ExaDiscoveryResult[];
	costDollars?: number;
	searchTimeMs?: number;
}

export type ExaDiscoverySearch = (destination: string, signal?: AbortSignal) => Promise<ExaDiscoveryResponse>;

export function buildExaDiscoveryRequest(destination: string, now = new Date()) {
	const start = new Date(now);
	start.setUTCFullYear(start.getUTCFullYear() - EXA_RECENCY_YEARS);
	return {
		query: `most interesting destinations, best places to visit in ${destination}`,
		type: "lite",
		numResults: EXA_DISCOVERY_RESULTS,
		startPublishedDate: start.toISOString(),
		contents: { highlights: true },
	};
}

interface ExaSearchResponse {
	results?: Array<{ title?: string | null; url: string; publishedDate?: string | null; highlights?: string[] }>;
	costDollars?: { total?: number };
	searchTime?: number;
}

export function createExaDiscoverySearch(apiKey: string, fetchImpl: typeof fetch = fetch): ExaDiscoverySearch {
	return async (destination, signal) => {
		const response = await fetchImpl("https://api.exa.ai/search", {
			method: "POST",
			headers: { "content-type": "application/json", "x-api-key": apiKey },
			body: JSON.stringify(buildExaDiscoveryRequest(destination)),
			signal,
		});
		if (!response.ok) {
			// The body names the rejected field; it never echoes the key.
			const detail = (await response.text()).slice(0, 300);
			throw new Error(`Exa search failed: ${response.status} ${detail}`);
		}
		const data = (await response.json()) as ExaSearchResponse;
		return {
			results: (data.results ?? []).map((r) => ({
				title: r.title ?? r.url,
				url: r.url,
				publishedDate: r.publishedDate ?? undefined,
				highlights: r.highlights ?? [],
			})),
			costDollars: data.costDollars?.total,
			searchTimeMs: data.searchTime,
		};
	};
}
