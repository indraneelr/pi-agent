/**
 * save_destination_shortlist tool — Persist destination shortlist / choice cards.
 *
 * Dedicated tool for the shortlist_destinations phase. It normalizes and saves
 * the destination option cards to state.destinationResearch using the same
 * DestinationResearch normalization as update_travel_state, but with a narrow
 * schema so the model does not have to use the generic
 * field="destination_research" parameter.
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import { getActivePhase } from "../checklist.js";
import type { PersistenceOptions } from "../persistence.js";
import { saveTravelState } from "../persistence.js";
import type { TravelState } from "../state.js";
import { normalizeDestinationResearch } from "./destination-research.js";

const saveDestinationShortlistSchema = Type.Object({
	subDestinations: Type.Array(Type.Any({ description: "A choice card object for one destination/area." }), {
		description:
			"The destination option cards. Each card MUST include name, description, bestFor, why, roughDays, " +
			"logisticsFit, budgetFit, seasonNote, tradeoff, imageQuery, imageLinks, selected=false, reviews, and sources. " +
			"imageLinks MUST contain at least one valid direct http(s) .jpg/.jpeg/.png/.webp URL; imageQuery alone is not enough. " +
			"The tradeoff MUST be contextual to a stated user preference (logistics, kids/family, budget, season/dates, beaches, culture, food, or trip length); generic tradeoffs that map to no preference are rejected.",
	}),
	destination: Type.Optional(
		Type.Any({
			description:
				"Top-level destination summary object (title, name, description, bestTimeToVisit, reviews, sources). " +
				"Inferred from preferences if omitted.",
		}),
	),
	overallSummary: Type.Optional(Type.String({ description: "One-paragraph summary of the curated shortlist." })),
	nextUserAction: Type.Optional(
		Type.String({
			description: 'A concrete choice prompt for the user, e.g. "Choose 3-4 places to continue".',
		}),
	),
	tripHighlights: Type.Optional(Type.Array(Type.String(), { description: "Key highlights across the shortlist." })),
	travelTips: Type.Optional(Type.Array(Type.String(), { description: "General travel tips for the shortlist." })),
	preferencesUsed: Type.Optional(
		Type.Any({
			description: "The preferences snapshot used to curate the shortlist. Inferred from state if omitted.",
		}),
	),
});

type SaveDestinationShortlistInput = Static<typeof saveDestinationShortlistSchema>;

export interface SaveDestinationShortlistDetails {
	phase: string | null;
	optionCount: number;
}

export interface SaveDestinationShortlistDeps {
	getState: () => TravelState;
	setState: (state: TravelState) => void;
	persistOpts: PersistenceOptions;
}

export function createSaveDestinationShortlistTool(
	deps: SaveDestinationShortlistDeps,
): AgentTool<typeof saveDestinationShortlistSchema, SaveDestinationShortlistDetails> {
	return {
		name: "save_destination_shortlist",
		label: "Save Destination Shortlist",
		description:
			"Save the destination shortlist / choice cards for the shortlist_destinations phase. " +
			"Call this BEFORE presenting the shortlist to the user; do not merely say you will save it. " +
			"Pass the complete subDestinations option cards plus nextUserAction; every card must include imageLinks with at least one valid direct image URL. " +
			'This is the dedicated tool for destination research — prefer it over update_travel_state with field="destination_research".',
		parameters: saveDestinationShortlistSchema,
		async execute(
			_toolCallId: string,
			params: SaveDestinationShortlistInput,
		): Promise<AgentToolResult<SaveDestinationShortlistDetails>> {
			const state = deps.getState();
			const active = getActivePhase(state.checklist);
			const research = normalizeDestinationResearch(params, state);

			const updated = { ...state, destinationResearch: research };
			deps.setState(updated);
			saveTravelState(updated, deps.persistOpts);

			return {
				content: [
					{
						type: "text",
						text: `Saved destination shortlist with ${research.subDestinations.length} option card(s) successfully.`,
					},
				],
				details: {
					phase: active?.id ?? null,
					optionCount: research.subDestinations.length,
				},
			};
		},
	};
}
