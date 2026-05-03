/**
 * go_back_to_phase tool — Navigate back to a previous checklist phase.
 *
 * Invalidates all downstream phases and clears their data.
 * The agent should use this when the user wants to revisit an earlier step.
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import { formatChecklist, goBackToPhase } from "../checklist.js";
import type { PersistenceOptions } from "../persistence.js";
import { saveTravelState } from "../persistence.js";
import { invalidateDownstream, type TravelState } from "../state.js";

const goBackSchema = Type.Object({
	phase_id: Type.String({
		description: "The id of the phase to go back to (e.g. 'gather_preferences', 'shortlist_destinations')",
	}),
	reason: Type.String({ description: "Why we are going back to this phase" }),
});

type GoBackInput = Static<typeof goBackSchema>;

export interface GoBackDetails {
	targetPhase: string;
	invalidatedPhases: string[];
}

export interface GoBackDeps {
	getState: () => TravelState;
	setState: (state: TravelState) => void;
	persistOpts: PersistenceOptions;
}

export function createGoBackTool(deps: GoBackDeps): AgentTool<typeof goBackSchema, GoBackDetails> {
	return {
		name: "go_back_to_phase",
		label: "Go Back",
		description:
			"Navigate back to a previous checklist phase. " +
			"This invalidates all downstream phases and clears their data. " +
			"Use this when the user wants to modify earlier choices (e.g., change preferences, add/remove destinations).",
		parameters: goBackSchema,
		async execute(_toolCallId: string, params: GoBackInput): Promise<AgentToolResult<GoBackDetails>> {
			const state = deps.getState();
			const newChecklist = goBackToPhase(state.checklist, params.phase_id);
			const invalidated = invalidateDownstream(state, params.phase_id);
			const updated = { ...invalidated, checklist: newChecklist };

			deps.setState(updated);
			saveTravelState(updated, deps.persistOpts);

			const invalidatedPhases = newChecklist.phases.filter((p) => p.status === "invalidated").map((p) => p.id);

			const formatted = formatChecklist(newChecklist);

			return {
				content: [
					{
						type: "text",
						text: `Going back to "${params.phase_id}". Reason: ${params.reason}\n\nInvalidated phases: ${invalidatedPhases.join(", ")}\n\n${formatted}`,
					},
				],
				details: {
					targetPhase: params.phase_id,
					invalidatedPhases,
				},
			};
		},
	};
}
