/**
 * Travel agent tools.
 *
 * Combines travel-specific tools: web_search, update_travel_state,
 * advance_checklist, go_back_to_phase, show_checklist.
 */

export {
	type AdvanceChecklistDeps,
	type AdvanceChecklistDetails,
	createAdvanceChecklistTool,
} from "./advance-checklist.js";
export { createGoBackTool, type GoBackDeps, type GoBackDetails } from "./go-back.js";
export { createShowChecklistTool, type ShowChecklistDetails } from "./show-checklist.js";
export { createUpdateStateTool, type UpdateStateDeps, type UpdateStateDetails } from "./update-state.js";
export { createWebSearchTool, type WebSearchDetails } from "./web-search.js";

import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { PersistenceOptions } from "../persistence.js";
import type { SearchProvider } from "../search/types.js";
import type { TravelState } from "../state.js";
import { createAdvanceChecklistTool } from "./advance-checklist.js";
import { createGoBackTool } from "./go-back.js";
import { createShowChecklistTool } from "./show-checklist.js";
import { createUpdateStateTool } from "./update-state.js";
import { createWebSearchTool } from "./web-search.js";

export interface CreateTravelToolsOptions {
	getState: () => TravelState;
	setState: (state: TravelState) => void;
	searchProvider: SearchProvider;
	persistOpts: PersistenceOptions;
}

/** Create all travel agent tools. */
export function createTravelTools(options: CreateTravelToolsOptions): AgentTool<any>[] {
	const { getState, setState, searchProvider, persistOpts } = options;
	const stateDeps = { getState, setState, persistOpts };

	return [
		createWebSearchTool(searchProvider),
		createUpdateStateTool(stateDeps),
		createAdvanceChecklistTool(stateDeps),
		createGoBackTool(stateDeps),
		createShowChecklistTool(() => getState().checklist),
	];
}
