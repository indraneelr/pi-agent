/**
 * update_travel_state tool — Persist structured travel data to state.
 *
 * The agent calls this to save preferences, destination research, selected
 * destinations, activities, itinerary, accommodation, or flight data.
 * Auto-saves to disk after each update.
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import { getActivePhase } from "../checklist.js";
import type { PersistenceOptions } from "../persistence.js";
import { saveTravelState } from "../persistence.js";
import type { TravelState } from "../state.js";

const VALID_FIELDS = [
	"preferences",
	"destination_research",
	"selected_destinations",
	"activities_research",
	"itinerary_research",
	"accommodation_research",
	"flight_research",
] as const;

type UpdateField = (typeof VALID_FIELDS)[number];

const updateStateSchema = Type.Object({
	field: Type.String({ description: `Field to update. One of: ${VALID_FIELDS.join(", ")}` }),
	data: Type.Any({ description: "The structured data to save for this field" }),
});

type UpdateStateInput = Static<typeof updateStateSchema>;

export interface UpdateStateDetails {
	field: string;
	phase: string | null;
}

export interface UpdateStateDeps {
	getState: () => TravelState;
	setState: (state: TravelState) => void;
	persistOpts: PersistenceOptions;
}

export function createUpdateStateTool(deps: UpdateStateDeps): AgentTool<typeof updateStateSchema, UpdateStateDetails> {
	return {
		name: "update_travel_state",
		label: "Update Travel State",
		description:
			"Save structured travel data to the session state. " +
			`Valid fields: ${VALID_FIELDS.join(", ")}. ` +
			"For 'preferences', pass the full or partial preferences object (will be merged). " +
			"For other fields, pass the complete research output object.",
		parameters: updateStateSchema,
		async execute(_toolCallId: string, params: UpdateStateInput): Promise<AgentToolResult<UpdateStateDetails>> {
			validateField(params.field);

			const state = deps.getState();
			const active = getActivePhase(state.checklist);
			const updated = applyUpdate(state, params.field as UpdateField, params.data);

			deps.setState(updated);
			saveTravelState(updated, deps.persistOpts);

			return {
				content: [{ type: "text", text: `Updated ${params.field} successfully.` }],
				details: {
					field: params.field,
					phase: active?.id ?? null,
				},
			};
		},
	};
}

function validateField(field: string): asserts field is UpdateField {
	if (!VALID_FIELDS.includes(field as UpdateField)) {
		throw new Error(`Invalid field "${field}". Must be one of: ${VALID_FIELDS.join(", ")}`);
	}
}

function applyUpdate(state: TravelState, field: UpdateField, data: unknown): TravelState {
	const updated = { ...state };

	switch (field) {
		case "preferences":
			// Merge partial preferences
			updated.preferences = { ...state.preferences, ...(data as Record<string, unknown>) };
			break;
		case "destination_research":
			updated.destinationResearch = data as TravelState["destinationResearch"];
			break;
		case "selected_destinations":
			updated.selectedDestinations = data as TravelState["selectedDestinations"];
			break;
		case "activities_research":
			updated.activitiesResearch = data as TravelState["activitiesResearch"];
			break;
		case "itinerary_research":
			updated.itineraryResearch = data as TravelState["itineraryResearch"];
			break;
		case "accommodation_research":
			updated.accommodationResearch = data as TravelState["accommodationResearch"];
			break;
		case "flight_research":
			updated.flightResearch = data as TravelState["flightResearch"];
			break;
	}

	return updated;
}
