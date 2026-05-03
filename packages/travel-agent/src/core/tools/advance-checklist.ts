/**
 * advance_checklist tool — Mark current phase as done and move to next.
 *
 * Validates that the current phase has the required data before advancing.
 * For gather_preferences, checks all mandatory preferences are filled.
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { advanceChecklist, formatChecklist, getActivePhase, getMandatoryPendingPreferences } from "../checklist.js";
import type { PersistenceOptions } from "../persistence.js";
import { saveTravelState } from "../persistence.js";
import type { TravelState } from "../state.js";

const advanceChecklistSchema = Type.Object({});

export interface AdvanceChecklistDetails {
	previousPhase: string;
	newActivePhase: string | null;
}

export interface AdvanceChecklistDeps {
	getState: () => TravelState;
	setState: (state: TravelState) => void;
	persistOpts: PersistenceOptions;
}

export function createAdvanceChecklistTool(
	deps: AdvanceChecklistDeps,
): AgentTool<typeof advanceChecklistSchema, AdvanceChecklistDetails> {
	return {
		name: "advance_checklist",
		label: "Advance Checklist",
		description:
			"Mark the current checklist phase as complete and move to the next phase. " +
			"Only call this when you have completed all work for the current phase. " +
			"For the gather_preferences phase, all mandatory preferences must be filled first.",
		parameters: advanceChecklistSchema,
		async execute(): Promise<AgentToolResult<AdvanceChecklistDetails>> {
			const state = deps.getState();
			const active = getActivePhase(state.checklist);
			if (!active) {
				throw new Error("No active phase to advance. The checklist is already complete.");
			}

			validatePhaseCompletion(state, active.id);

			const previousPhase = active.id;
			const updated = { ...state, checklist: advanceChecklist(state.checklist) };
			deps.setState(updated);
			saveTravelState(updated, deps.persistOpts);

			const newActive = getActivePhase(updated.checklist);
			const formatted = formatChecklist(updated.checklist);

			return {
				content: [{ type: "text", text: `Phase "${active.label}" completed.\n\n${formatted}` }],
				details: {
					previousPhase,
					newActivePhase: newActive?.id ?? null,
				},
			};
		},
	};
}

function validatePhaseCompletion(state: TravelState, phaseId: string): void {
	switch (phaseId) {
		case "gather_preferences": {
			const pending = getMandatoryPendingPreferences(state.preferences);
			if (pending.length > 0) {
				throw new Error(`Cannot advance: mandatory preferences still missing: ${pending.join(", ")}`);
			}
			break;
		}
		case "shortlist_destinations": {
			if (!state.destinationResearch || state.destinationResearch.subDestinations.length === 0) {
				throw new Error("Cannot advance: no destinations have been researched yet.");
			}
			break;
		}
		case "select_destinations": {
			if (state.selectedDestinations.length === 0) {
				throw new Error("Cannot advance: no destinations have been selected by the user.");
			}
			break;
		}
		case "research_experiences": {
			if (!state.activitiesResearch || state.activitiesResearch.activities.length === 0) {
				throw new Error("Cannot advance: no activities have been researched yet.");
			}
			break;
		}
		case "plan_itinerary": {
			if (!state.itineraryResearch || state.itineraryResearch.itinerary.length === 0) {
				throw new Error("Cannot advance: no itinerary has been created yet.");
			}
			break;
		}
		case "research_accommodation_flights": {
			if (!state.accommodationResearch && !state.flightResearch) {
				throw new Error("Cannot advance: neither accommodation nor flight research has been done.");
			}
			break;
		}
	}
}
