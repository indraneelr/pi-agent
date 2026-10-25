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
export {
	createDiscoverPlacesTool,
	createModelPlaceExtractor,
	type DiscoveredPlace,
	type DiscoverPlacesDeps,
	type DiscoverPlacesDetails,
	type PlaceExtractor,
	rankPlaces,
} from "./discover-places.js";
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
import type { ExaDiscoverySearch } from "../search/exa.js";
import { SearchSources } from "../search/sources.js";
import type { SearchProvider } from "../search/types.js";
import type { TravelState } from "../state.js";
import { createAdvanceChecklistTool } from "./advance-checklist.js";
import { createDiscoverPlacesTool, createModelPlaceExtractor } from "./discover-places.js";
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
	/** Experimental Exa place discovery for the shortlist; adds discover_places when set. */
	exaDiscoverySearch?: ExaDiscoverySearch;
	/** Optional: validate + clean destination image links (in place). Undefined = no-op. */
	cleanImageLinks?: (
		cards: Array<{ name?: string; imageQuery?: string; imageLinks?: string[] }>,
	) => Promise<{ totalChecked: number; valid: number; broken: number; refetched: number }>;
}

/** Create all travel agent tools. */
export function createTravelTools(options: CreateTravelToolsOptions): AgentTool<any>[] {
	const {
		getState,
		setState,
		searchProvider,
		persistOpts,
		model,
		getApiKey,
		imageTimeoutMs,
		cleanImageLinks,
		exaDiscoverySearch,
	} = options;
	const stateDeps = { getState, setState, persistOpts, cleanImageLinks };
	const reviewSources = new SearchSources();

	return [
		createWebSearchTool(searchProvider, {
			getState,
			sources: reviewSources,
		}),
		createGetImagesTool({ ...stateDeps, imageTimeoutMs }),
		createUpdateStateTool(stateDeps),
		createSaveDestinationShortlistTool(stateDeps),
		createSaveDestinationReviewsTool({ ...stateDeps, sources: reviewSources }),
		createAdvanceChecklistTool(stateDeps),
		createGoBackTool(stateDeps),
		createShowChecklistTool(() => getState().checklist),
		createVerifyDataTool({ model, getApiKey, searchProvider }),
		...(exaDiscoverySearch
			? [
					createDiscoverPlacesTool({
						getState,
						search: exaDiscoverySearch,
						extract: createModelPlaceExtractor(model, getApiKey),
					}),
				]
			: []),
	];
}
