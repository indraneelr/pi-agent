/**
 * discover_places tool (experimental, EXA_DISCOVERY=1).
 *
 * Runs one broad Exa search per destination, extracts candidate places from
 * the result pool with a single model call kept out of the chat transcript,
 * then ranks them locally against the traveler's themes and group. Only a
 * compact page of candidates reaches the planner's context.
 */

import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { completeSimple, type Model } from "@earendil-works/pi-ai";
import { type Static, Type } from "@sinclair/typebox";
import type { ExaDiscoveryResponse, ExaDiscoveryResult, ExaDiscoverySearch } from "../search/exa.js";
import type { TravelState } from "../state.js";

export const DISCOVERY_PAGE_SIZE = 12;
const HIGHLIGHT_CHARS_PER_RESULT = 1500;
const MAX_SOURCES_PER_PLACE = 3;
/** Keeps extraction output well inside its token limit; 50 guide pages name far more places. */
const MAX_EXTRACTED_PLACES = 30;

const discoverPlacesSchema = Type.Object({
	page: Type.Optional(
		Type.Number({
			description: "1 for the best-ranked places (default). 2 or more when the user asks for more places.",
		}),
	),
});

type DiscoverPlacesInput = Static<typeof discoverPlacesSchema>;

export interface DiscoveredPlace {
	name: string;
	why: string;
	themes: string[];
	goodFor: string[];
	sourceUrls: string[];
}

export interface RankedPlace extends DiscoveredPlace {
	score: number;
	matchedThemes: string[];
	groupMatch: boolean;
}

export type PlaceExtractor = (
	destination: string,
	results: ExaDiscoveryResult[],
	signal?: AbortSignal,
) => Promise<{ places: DiscoveredPlace[]; costDollars?: number }>;

export interface DiscoverPlacesDetails {
	provider: "exa";
	destination: string;
	cached: boolean;
	resultCount: number;
	candidateCount: number;
	page: number;
	searchCostDollars?: number;
	extractionCostDollars?: number;
	error?: string;
}

export interface DiscoverPlacesDeps {
	getState: () => TravelState;
	search: ExaDiscoverySearch;
	extract: PlaceExtractor;
}

interface Discovery {
	resultCount: number;
	places: DiscoveredPlace[];
	searchCostDollars?: number;
	extractionCostDollars?: number;
}

export function createDiscoverPlacesTool(
	deps: DiscoverPlacesDeps,
): AgentTool<typeof discoverPlacesSchema, DiscoverPlacesDetails> {
	// One Exa search per session and destination; "more places" pages through the same pool.
	const discoveries = new Map<string, Discovery>();
	// Paid search responses survive a failed extraction so a retry does not search again.
	const searches = new Map<string, ExaDiscoveryResponse>();
	return {
		name: "discover_places",
		label: "Discover Places",
		description:
			"Find candidate places within the trip destination from one broad web search of recent travel guides, ranked against the traveler's themes and group. Returns names, reasons, tags and source URLs for building option cards.",
		parameters: discoverPlacesSchema,
		async execute(
			_toolCallId: string,
			params: DiscoverPlacesInput,
			signal?: AbortSignal,
		): Promise<AgentToolResult<DiscoverPlacesDetails>> {
			const state = deps.getState();
			const destination = String(state.preferences.destination ?? "").trim();
			const page = Math.max(1, Math.floor(params.page ?? 1));
			const base = { provider: "exa" as const, destination, page, resultCount: 0, candidateCount: 0 };
			if (!destination)
				return {
					content: [{ type: "text", text: "No destination saved yet. Save the destination preference first." }],
					details: { ...base, cached: false, error: "missing destination" },
				};

			const key = `${state.sessionId}:${destination.toLowerCase()}`;
			let discovery = discoveries.get(key);
			const cached = Boolean(discovery);
			if (!discovery) {
				let response = searches.get(key);
				try {
					if (!response) {
						response = await deps.search(destination, signal);
						searches.set(key, response);
					}
					const extracted = await deps.extract(destination, response.results, signal);
					discovery = {
						resultCount: response.results.length,
						places: extracted.places,
						searchCostDollars: response.costDollars,
						extractionCostDollars: extracted.costDollars,
					};
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					return {
						content: [
							{
								type: "text",
								text: "Place discovery is unavailable right now. Use web_search (at most 2 calls) for shortlist research instead.",
							},
						],
						details: {
							...base,
							cached: false,
							resultCount: response?.results.length ?? 0,
							searchCostDollars: response?.costDollars,
							error: message,
						},
					};
				}
				discoveries.set(key, discovery);
			}

			const ranked = rankPlaces(discovery.places, state.preferences);
			const pageItems = ranked.slice((page - 1) * DISCOVERY_PAGE_SIZE, page * DISCOVERY_PAGE_SIZE);
			const details: DiscoverPlacesDetails = {
				...base,
				cached,
				resultCount: discovery.resultCount,
				candidateCount: ranked.length,
				searchCostDollars: discovery.searchCostDollars,
				extractionCostDollars: discovery.extractionCostDollars,
			};
			if (pageItems.length === 0)
				return {
					content: [
						{
							type: "text",
							text:
								ranked.length === 0
									? "The search returned no usable places. Use web_search (at most 2 calls) for shortlist research instead."
									: `No more places: all ${ranked.length} candidates have been shown.`,
						},
					],
					details,
				};
			return { content: [{ type: "text", text: formatPage(pageItems, page, ranked.length) }], details };
		},
	};
}

/**
 * Post-filter: rank by stated themes, group suitability, then how many
 * sources mention the place. Unmatched places sink rather than disappear.
 */
export function rankPlaces(places: DiscoveredPlace[], preferences: TravelState["preferences"]): RankedPlace[] {
	const themes = (preferences.travel_themes ?? preferences.interests ?? []).map(normalizeTag).filter(Boolean);
	const group = normalizeTag(String(preferences.group_type ?? ""));
	return places
		.map((place) => {
			const tags = place.themes.map(normalizeTag);
			const matchedThemes = themes.filter((theme) => tags.some((tag) => tagsMatch(tag, theme)));
			const groupMatch = Boolean(group) && place.goodFor.some((tag) => tagsMatch(normalizeTag(tag), group));
			const score =
				matchedThemes.length * 3 + (groupMatch ? 2 : 0) + Math.min(place.sourceUrls.length, MAX_SOURCES_PER_PLACE);
			return { ...place, score, matchedThemes, groupMatch };
		})
		.sort((a, b) => b.score - a.score || b.sourceUrls.length - a.sourceUrls.length);
}

function normalizeTag(tag: string): string {
	return tag.trim().toLowerCase();
}

/** "temples" matches "temple", "family" matches "families with kids". */
function tagsMatch(tag: string, wanted: string): boolean {
	const stem = (value: string) => value.replace(/(ies|es|s)$/, "");
	return tag.includes(stem(wanted)) || wanted.includes(stem(tag));
}

function formatPage(places: RankedPlace[], page: number, total: number): string {
	const start = (page - 1) * DISCOVERY_PAGE_SIZE;
	const lines = places.map((place, i) => {
		const fit = [
			place.matchedThemes.length ? `matches ${place.matchedThemes.join(", ")}` : "matches no stated theme",
			place.groupMatch ? "suits the group" : undefined,
		]
			.filter(Boolean)
			.join("; ");
		return [
			`${start + i + 1}. ${place.name} (${fit})`,
			`   Why: ${place.why}`,
			`   Tags: ${[...place.themes, ...place.goodFor].join(", ") || "none"}`,
			`   Sources: ${place.sourceUrls.slice(0, MAX_SOURCES_PER_PLACE).join(" ") || "none"}`,
		].join("\n");
	});
	const more = start + places.length < total ? `\n\n${total - start - places.length} more on page ${page + 1}.` : "";
	return `${places.length} of ${total} discovered places, ranked for this traveler:\n\n${lines.join("\n\n")}${more}`;
}

/** Extract places from the Exa pool with one model call outside the chat transcript. */
export function createModelPlaceExtractor(model: Model<any>, getApiKey?: () => string): PlaceExtractor {
	return async (destination, results, signal) => {
		const corpus = results
			.map((r, i) => `[${i}] ${r.title} (${r.url})\n${r.highlights.join("\n").slice(0, HIGHLIGHT_CHARS_PER_RESULT)}`)
			.join("\n\n");
		const prompt = `Below are ${results.length} recent web pages about places to visit in ${destination}.
List up to ${MAX_EXTRACTED_PLACES} distinct places within ${destination} (city, town, island, region, park or area; not single attractions such as one temple or museum) that these pages recommend, most widely recommended first.
Use only what the pages say. For each place give:
- name: the common English name
- why: one sentence of at most 20 words on why the pages recommend it
- themes: short lowercase tags such as food, temples, culture, nature, beaches, hiking, nightlife, onsen, history, shopping
- goodFor: short lowercase tags such as families, couples, solo, friends, seniors, first-timers
- sources: the [index] numbers of the pages that recommend it

Reply with only a JSON object: {"places":[{"name":"","why":"","themes":[],"goodFor":[],"sources":[0]}]}

${corpus}`;
		const message = await completeSimple(
			model,
			{ messages: [{ role: "user", content: prompt, timestamp: Date.now() }] },
			{ apiKey: getApiKey?.(), maxTokens: 8000, signal },
		);
		if (message.stopReason === "error" || message.stopReason === "aborted")
			throw new Error(`Place extraction failed: ${message.errorMessage ?? message.stopReason}`);
		const text = message.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("");
		try {
			return { places: parseExtractedPlaces(text, results), costDollars: message.usage.cost.total };
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			throw new Error(
				`${reason} (stop: ${message.stopReason}, ${text.length} chars, ${message.usage.output} output tokens)`,
			);
		}
	};
}

export function parseExtractedPlaces(text: string, results: ExaDiscoveryResult[]): DiscoveredPlace[] {
	const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error("Place extraction returned invalid JSON");
	}
	const raw = (parsed as { places?: unknown }).places;
	if (!Array.isArray(raw)) throw new Error("Place extraction returned no places array");
	const strings = (value: unknown) =>
		Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];
	const seen = new Set<string>();
	const places: DiscoveredPlace[] = [];
	for (const item of raw as Array<Record<string, unknown>>) {
		const name = typeof item?.name === "string" ? item.name.trim() : "";
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const sourceUrls = [
			...new Set(
				(Array.isArray(item.sources) ? item.sources : [])
					.map((index) => (typeof index === "number" ? results[index]?.url : undefined))
					.filter((url): url is string => Boolean(url)),
			),
		];
		places.push({
			name,
			why: typeof item.why === "string" ? item.why.trim() : "",
			themes: strings(item.themes),
			goodFor: strings(item.goodFor),
			sourceUrls,
		});
	}
	return places;
}
