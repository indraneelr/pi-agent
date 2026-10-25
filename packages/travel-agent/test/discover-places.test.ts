import { describe, expect, it, vi } from "vitest";
import type { ChecklistPhaseConfig } from "../src/core/checklist.js";
import {
	buildExaDiscoveryRequest,
	createExaDiscoverySearch,
	type ExaDiscoveryResult,
	type ExaDiscoverySearch,
} from "../src/core/search/exa.js";
import { createTravelState, type TravelState } from "../src/core/state.js";
import { buildTravelSystemPrompt } from "../src/core/system-prompt.js";
import {
	createDiscoverPlacesTool,
	type DiscoveredPlace,
	type PlaceExtractor,
	parseExtractedPlaces,
	rankPlaces,
} from "../src/core/tools/discover-places.js";

const checklist: ChecklistPhaseConfig[] = [
	{ id: "gather_preferences", label: "Preferences", description: "" },
	{ id: "shortlist_destinations", label: "Shortlist", description: "" },
];

function place(name: string, themes: string[], goodFor: string[] = [], sources = 1): DiscoveredPlace {
	return {
		name,
		why: `${name} is recommended`,
		themes,
		goodFor,
		sourceUrls: Array.from({ length: sources }, (_, i) => `https://guide.example/${name}/${i}`),
	};
}

function japanState(): TravelState {
	const state = createTravelState("s1", checklist);
	state.preferences = {
		destination: "Japan",
		travel_themes: ["food", "temples", "nature"],
		group_type: "couple",
	};
	return state;
}

function text(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content.map((c) => c.text ?? "").join("");
}

describe("Exa discovery request", () => {
	it("sends one 50-result lite search limited to the last five years", () => {
		const request = buildExaDiscoveryRequest("Japan", new Date("2026-10-25T00:00:00.000Z"));
		expect(request).toEqual({
			query: "most interesting destinations, best places to visit in Japan",
			type: "lite",
			numResults: 50,
			startPublishedDate: "2021-10-25T00:00:00.000Z",
			contents: { highlights: true },
		});
	});

	it("posts to Exa with the key header and maps results and cost", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						results: [
							{ title: "Best places", url: "https://a.example", publishedDate: null, highlights: ["Kyoto"] },
						],
						costDollars: { total: 0.044 },
						searchTime: 856,
					}),
				),
		);
		const search = createExaDiscoverySearch("exa-key", fetchMock as unknown as typeof fetch);
		const response = await search("Japan");
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://api.exa.ai/search");
		expect((init.headers as Record<string, string>)["x-api-key"]).toBe("exa-key");
		expect(JSON.parse(String(init.body)).numResults).toBe(50);
		expect(response).toEqual({
			results: [{ title: "Best places", url: "https://a.example", publishedDate: undefined, highlights: ["Kyoto"] }],
			costDollars: 0.044,
			searchTimeMs: 856,
		});
	});

	it("surfaces Exa rejections with the reason", async () => {
		const search = createExaDiscoverySearch(
			"exa-key",
			(async () => new Response('{"error":"Not supported"}', { status: 400 })) as unknown as typeof fetch,
		);
		await expect(search("Japan")).rejects.toThrow("Exa search failed: 400");
	});
});

describe("place post-filter", () => {
	it("ranks theme matches, then group fit, then source count; unmatched places sink but stay", () => {
		const ranked = rankPlaces(
			[
				place("Osaka", ["nightlife", "shopping"], [], 5),
				place("Kyoto", ["temples", "food"], ["couples"], 3),
				place("Nara", ["temple", "history"], ["families"], 2),
				place("Hakone", ["onsen", "nature"], ["couples"], 1),
			],
			japanState().preferences,
		);
		expect(ranked.map((p) => p.name)).toEqual(["Kyoto", "Hakone", "Nara", "Osaka"]);
		expect(ranked[0]).toMatchObject({ matchedThemes: ["food", "temples"], groupMatch: true });
		expect(ranked[2].matchedThemes).toEqual(["temples"]);
		expect(ranked[3]).toMatchObject({ matchedThemes: [], groupMatch: false });
	});

	it("parses extractor JSON, maps source indexes to URLs and drops duplicates", () => {
		const results: ExaDiscoveryResult[] = [
			{ title: "A", url: "https://a.example", highlights: [] },
			{ title: "B", url: "https://b.example", highlights: [] },
		];
		const places = parseExtractedPlaces(
			'```json\n{"places":[{"name":"Kyoto","why":"Temples","themes":["temples"],"goodFor":["couples"],"sources":[0,1,1,9]},{"name":"kyoto","sources":[0]},{"name":""}]}\n```',
			results,
		);
		expect(places).toEqual([
			{
				name: "Kyoto",
				why: "Temples",
				themes: ["temples"],
				goodFor: ["couples"],
				sourceUrls: ["https://a.example", "https://b.example"],
			},
		]);
		expect(() => parseExtractedPlaces("no json here", results)).toThrow("invalid JSON");
	});
});

describe("discover_places tool", () => {
	function setup(places: DiscoveredPlace[]) {
		const state = japanState();
		const search = vi.fn<ExaDiscoverySearch>(async () => ({
			results: [{ title: "A", url: "https://a.example", highlights: ["Kyoto"] }],
			costDollars: 0.044,
		}));
		const extract = vi.fn<PlaceExtractor>(async () => ({ places, costDollars: 0.004 }));
		const tool = createDiscoverPlacesTool({ getState: () => state, search, extract });
		return { tool, search, extract };
	}

	it("searches once per destination and pages through the cached pool", async () => {
		const places = Array.from({ length: 15 }, (_, i) => place(`Place ${i + 1}`, i === 14 ? ["food"] : ["misc"]));
		const { tool, search, extract } = setup(places);

		const first = await tool.execute("1", {});
		expect(search).toHaveBeenCalledWith("Japan", undefined);
		expect(first.details).toMatchObject({
			cached: false,
			resultCount: 1,
			candidateCount: 15,
			searchCostDollars: 0.044,
			extractionCostDollars: 0.004,
		});
		expect(text(first)).toContain("12 of 15 discovered places");
		expect(text(first)).toMatch(/^1\. Place 15 \(matches food\)/m);
		expect(text(first)).toContain("3 more on page 2.");

		const second = await tool.execute("2", { page: 2 });
		expect(second.details.cached).toBe(true);
		expect(text(second)).toContain("3 of 15 discovered places");
		expect(text(second)).toMatch(/^13\. /m);

		const third = await tool.execute("3", { page: 3 });
		expect(text(third)).toContain("all 15 candidates have been shown");
		expect(search).toHaveBeenCalledTimes(1);
		expect(extract).toHaveBeenCalledTimes(1);
	});

	it("tells the planner to fall back to web_search when Exa fails, without caching the failure", async () => {
		const { tool, search } = setup([place("Kyoto", ["food"])]);
		search.mockRejectedValueOnce(new Error("Exa search failed: 401"));

		const failed = await tool.execute("1", {});
		expect(text(failed)).toContain("Use web_search (at most 2 calls)");
		expect(failed.details.error).toBe("Exa search failed: 401");

		const retried = await tool.execute("2", {});
		expect(text(retried)).toContain("Kyoto");
		expect(search).toHaveBeenCalledTimes(2);
	});
});

describe("shortlist prompt with Exa discovery", () => {
	it("routes shortlist research through discover_places only when enabled", () => {
		const state = createTravelState("s1", checklist);
		state.checklist.activePhaseIndex = 1;

		const enabled = buildTravelSystemPrompt(state, { exaDiscovery: true });
		expect(enabled).toContain("- discover_places:");
		expect(enabled).toContain("Call discover_places once (page 1)");
		expect(enabled).not.toContain("Limit shortlist research to 1-2 web_search calls");

		const disabled = buildTravelSystemPrompt(state);
		expect(disabled).not.toContain("discover_places");
		expect(disabled).toContain("Limit shortlist research to 1-2 web_search calls");
	});
});
