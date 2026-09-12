import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { type PersistenceOptions, saveTravelState } from "../persistence.js";
import type { SearchSources } from "../search/sources.js";
import type { TravelState } from "../state.js";

const schema = Type.Object({
	destination_name: Type.String(),
	pros: Type.Array(Type.String(), {
		description: "Paraphrased positive review themes supported by the researched sources.",
	}),
	cons: Type.Array(Type.String(), { description: "Paraphrased downsides supported by the researched sources." }),
	reviewSummary: Type.String({ description: "Summary, including any missing or unverified review information." }),
	source_ids: Type.Array(Type.String(), {
		description:
			"Short Source IDs returned by web_search. The server resolves the exact URLs. Never copy or reconstruct redirect URLs.",
	}),
	providerRatings: Type.Array(
		Type.Object({
			provider: Type.Union([Type.Literal("google"), Type.Literal("tripadvisor")]),
			rating: Type.Number({ minimum: 0, maximum: 5 }),
			reviewCount: Type.Optional(Type.Integer({ minimum: 0 })),
			source_id: Type.String({ description: "Source ID of the matching provider listing returned by web_search." }),
			placeName: Type.String({
				description:
					"Exact place rated by this listing. Never substitute an attraction's rating for the whole city.",
			}),
		}),
		{
			description:
				"Only ratings actually found on matching Google Maps or Tripadvisor listings. Omit unavailable ratings; never estimate.",
		},
	),
});

export function createSaveDestinationReviewsTool(deps: {
	getState: () => TravelState;
	setState: (state: TravelState) => void;
	persistOpts: PersistenceOptions;
	sources: SearchSources;
}): AgentTool<typeof schema> {
	return {
		name: "save_destination_reviews",
		label: "Save destination reviews",
		description:
			"Save researched reviews to the destination card, with pros, cons and source-specific ratings. Call web_search first. Never invent ratings or present your own opinion as traveler reviews.",
		parameters: schema,
		async execute(_id, params) {
			const state = deps.getState();
			const name = params.destination_name.trim().toLowerCase();
			const cards = [...(state.destinationResearch?.subDestinations ?? []), ...state.selectedDestinations].filter(
				(card) => card.name.trim().toLowerCase() === name,
			);
			if (!cards.length) throw new Error("Destination is not in the current shortlist.");
			const sources = params.source_ids.map((id) => {
				const source = deps.sources.get(id);
				if (!source)
					throw new Error(
						`Unknown source ID ${id.slice(0, 40)}. Use the Source IDs from the latest web_search results, not URLs.`,
					);
				return source;
			});
			for (const rating of params.providerRatings) {
				const source = deps.sources.get(rating.source_id);
				if (!source) throw new Error("Unknown rating source ID. Use a Source ID from web_search.");
				const url = new URL(source.url);
				const matchesProvider =
					rating.provider === "google"
						? /(^|\.)google\.(com|[a-z]{2}|(?:com|co)\.[a-z]{2})$/i.test(url.hostname) &&
							/\/maps\b/.test(url.pathname)
						: /(^|\.)tripadvisor\.(com|[a-z]{2}|(?:com|co)\.[a-z]{2})$/i.test(url.hostname);
				const sourceText = `${source.title} ${source.snippet} ${source.content ?? ""}`;
				const score = rating.rating.toString().replace(".", "\\.");
				const ratingEvidence = new RegExp(
					`(?:\\b${score}\\s*(?:/\\s*5|out of 5|stars?)|(?:rating|rated)[^\\d]{0,10}${score}\\b)`,
					"i",
				);
				if (
					!matchesProvider ||
					url.protocol !== "https:" ||
					!params.source_ids.includes(rating.source_id) ||
					!Number.isFinite(rating.rating) ||
					rating.rating < 0 ||
					rating.rating > 5 ||
					!ratingEvidence.test(sourceText) ||
					!sourceText.toLowerCase().includes(name) ||
					rating.placeName.trim().toLowerCase() !== name
				) {
					throw new Error(
						"Ratings must reference a matching place and a cited Google Maps or Tripadvisor listing. Omit ratings that cannot be verified.",
					);
				}
			}
			if ((params.pros.length || params.cons.length) && !sources.length)
				throw new Error("Review themes require researched source URLs.");
			const reviews = {
				pros: params.pros,
				cons: params.cons,
				reviewSummary: params.reviewSummary,
				sources: sources.map((source) => source.url),
				providerRatings: params.providerRatings.map(({ source_id, ...rating }) => ({
					...rating,
					sourceUrl: deps.sources.get(source_id)!.url,
				})),
			};
			for (const card of cards) card.reviews = { ...reviews, researchedAt: new Date().toISOString() };
			deps.setState(state);
			saveTravelState(state, deps.persistOpts);
			return {
				content: [
					{
						type: "text",
						text: "Reviews saved under the destination card. Give only a brief confirmation in chat.",
					},
				],
				details: {},
			};
		},
	};
}
