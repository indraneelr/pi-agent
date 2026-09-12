import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { type PersistenceOptions, saveTravelState } from "../persistence.js";
import type { TravelState } from "../state.js";

const schema = Type.Object({
	destination_name: Type.String(),
	pros: Type.Array(Type.String(), {
		description: "Paraphrased positive review themes supported by the researched sources.",
	}),
	cons: Type.Array(Type.String(), { description: "Paraphrased downsides supported by the researched sources." }),
	reviewSummary: Type.String({ description: "Summary, including any missing or unverified review information." }),
	sources: Type.Array(Type.String(), { description: "Actual review source URLs returned by web_search." }),
	providerRatings: Type.Array(
		Type.Object({
			provider: Type.Union([Type.Literal("google"), Type.Literal("tripadvisor")]),
			rating: Type.Number({ minimum: 0, maximum: 5 }),
			reviewCount: Type.Optional(Type.Integer({ minimum: 0 })),
			sourceUrl: Type.String(),
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
	getSourceText: (url: string) => string | undefined;
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
			for (const source of params.sources) {
				if (!/^https?:\/\//i.test(source) || !deps.getSourceText(source))
					throw new Error(
						"Review sources must be URLs from web_search results. Search for the review sources before saving.",
					);
			}
			for (const rating of params.providerRatings) {
				const url = new URL(rating.sourceUrl);
				const matchesProvider =
					rating.provider === "google"
						? /(^|\.)google\.(com|[a-z]{2}|(?:com|co)\.[a-z]{2})$/i.test(url.hostname) &&
							/\/maps\b/.test(url.pathname)
						: /(^|\.)tripadvisor\.(com|[a-z]{2}|(?:com|co)\.[a-z]{2})$/i.test(url.hostname);
				const sourceText = deps.getSourceText(rating.sourceUrl) ?? "";
				const score = rating.rating.toString().replace(".", "\\.");
				const ratingEvidence = new RegExp(
					`(?:\\b${score}\\s*(?:/\\s*5|out of 5|stars?)|(?:rating|rated)[^\\d]{0,10}${score}\\b)`,
					"i",
				);
				if (
					!matchesProvider ||
					url.protocol !== "https:" ||
					!params.sources.includes(rating.sourceUrl) ||
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
			if ((params.pros.length || params.cons.length) && !params.sources.length)
				throw new Error("Review themes require researched source URLs.");
			const { destination_name: _name, ...reviews } = params;
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
