/**
 * Travel agent tools.
 *
 * Combines travel-specific tools: web_search, save_destination_shortlist,
 * update_travel_state, advance_checklist, go_back_to_phase, show_checklist.
 */

export {
	type AdvanceChecklistDeps,
	type AdvanceChecklistDetails,
	createAdvanceChecklistTool,
} from "./advance-checklist.js";
export { createGetImagesTool, type GetImagesDeps, type GetImagesDetails } from "./get-images.js";
export { createGoBackTool, type GoBackDeps, type GoBackDetails } from "./go-back.js";
export {
	createSaveDestinationShortlistTool,
	type SaveDestinationShortlistDeps,
	type SaveDestinationShortlistDetails,
} from "./save-destination-shortlist.js";
export { createShowChecklistTool, type ShowChecklistDetails } from "./show-checklist.js";
export { createUpdateStateTool, type UpdateStateDeps, type UpdateStateDetails } from "./update-state.js";
export { createVerifyDataTool } from "./verify-data.js";
export { createWebSearchTool, type WebSearchDetails } from "./web-search.js";

import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { PersistenceOptions } from "../persistence.js";
import type { SearchProvider } from "../search/types.js";
import type { TravelState } from "../state.js";
import { createAdvanceChecklistTool } from "./advance-checklist.js";
import { createGetImagesTool } from "./get-images.js";
import { createGoBackTool } from "./go-back.js";
import { createSaveDestinationReviewsTool } from "./save-destination-reviews.js";
import { createSaveDestinationShortlistTool } from "./save-destination-shortlist.js";
import { createShowChecklistTool } from "./show-checklist.js";
import { createUpdateStateTool } from "./update-state.js";
import { createVerifyDataTool } from "./verify-data.js";
import { createWebSearchTool } from "./web-search.js";

export interface CreateTravelToolsOptions {
	getState: () => TravelState;
	setState: (state: TravelState) => void;
	searchProvider: SearchProvider;
	persistOpts: PersistenceOptions;
	model: Model<any>;
	getApiKey?: () => string;
	/** Per-provider image-search failover timeout (ADR 0002). */
	imageTimeoutMs?: number;
	/** Optional: validate + clean destination image links (in place). Undefined = no-op. */
	cleanImageLinks?: (
		cards: Array<{ name?: string; imageQuery?: string; imageLinks?: string[] }>,
	) => Promise<{ totalChecked: number; valid: number; broken: number; refetched: number }>;
}

/** Create all travel agent tools. */
export function createTravelTools(options: CreateTravelToolsOptions): AgentTool<any>[] {
	const { getState, setState, searchProvider, persistOpts, model, getApiKey, imageTimeoutMs, cleanImageLinks } =
		options;
	const stateDeps = { getState, setState, persistOpts, cleanImageLinks };
	const reviewSources = new Map<string, string>();

	return [
		createWebSearchTool(searchProvider, {
			getState,
			onResults: (results) => {
				for (const result of results)
					reviewSources.set(result.url, `${result.title} ${result.snippet} ${result.content ?? ""}`);
			},
		}),
		createGetImagesTool({ ...stateDeps, imageTimeoutMs }),
		createUpdateStateTool(stateDeps),
		createSaveDestinationShortlistTool(stateDeps),
		createSaveDestinationReviewsTool({ ...stateDeps, getSourceText: (url) => reviewSources.get(url) }),
		createAdvanceChecklistTool(stateDeps),
		createGoBackTool(stateDeps),
		createShowChecklistTool(() => getState().checklist),
		createVerifyDataTool({ model, getApiKey, searchProvider }),
	];
}
