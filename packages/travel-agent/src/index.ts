/**
 * @mariozechner/pi-travel-agent
 *
 * Travel planning agent built on pi-agent-core and pi-ai.
 */

// System Prompt
export {
	type ActivityQualityAxis,
	type ActivityQualityScore,
	type ActivityResearchQuality,
	deriveActivityQualityAxes,
	matchActivityPreferenceAxes,
	matchSelectedDestination,
	type ScoreActivityResearchOptions,
	scoreActivityQuality,
	scoreActivityResearchQuality,
} from "./core/activity-fit.js";
// Checklist
export {
	advanceChecklist,
	type ChecklistPhase,
	type ChecklistPhaseConfig,
	createChecklist,
	formatChecklist,
	getActivePhase,
	getMandatoryPendingPreferences,
	goBackToPhase,
	isComplete,
	loadChecklistConfig,
	type TravelChecklist,
} from "./core/checklist.js";
// Persistence
export { deleteTravelState, loadTravelState, type PersistenceOptions, saveTravelState } from "./core/persistence.js";
// Preference Fit
export {
	AXIS_LABEL,
	type AxisEvidence,
	type CardPreferenceScore,
	classifyTradeoffSeverity,
	derivePreferenceAxes,
	formatShortlistPreferenceFit,
	PREFERENCE_AXES,
	type PreferenceAxis,
	type ScoreShortlistOptions,
	SEVERITY_LABEL,
	type ShortlistPreferenceFit,
	scoreCardPreferenceFit,
	scoreShortlistPreferenceFit,
	type TradeoffSeverity,
} from "./core/preference-fit.js";
// SDK
export { type CreateTravelSessionOptions, createTravelSession, type TravelSession } from "./core/sdk.js";
export { createBraveSearchProvider } from "./core/search/brave.js";
export { createGoogleGeminiSearchProvider } from "./core/search/google-gemini.js";
export { type DetectSearchProviderOptions, detectSearchProvider } from "./core/search/index.js";
export { createLinkupSearchProvider } from "./core/search/linkup.js";
export { createObscuraSearchProvider } from "./core/search/obscura.js";
export {
	createStagehandSearchProvider,
	loadStagehandOptionsFromEnv,
	type ResolvedStagehandConfig,
	type StagehandClient,
	type StagehandSearchEngine,
	type StagehandSearchOptions,
} from "./core/search/stagehand.js";
// Search
export type { SearchProvider, SearchResult } from "./core/search/types.js";
// State
export { createTravelState, formatStateForPrompt, invalidateDownstream, type TravelState } from "./core/state.js";
export { buildTravelSystemPrompt, type TravelSystemPromptOptions } from "./core/system-prompt.js";

// Tools
export {
	type AdvanceChecklistDetails,
	createTravelTools,
	type GoBackDetails,
	type SaveDestinationShortlistDetails,
	type ShowChecklistDetails,
	type UpdateStateDetails,
	type WebSearchDetails,
} from "./core/tools/index.js";
// Types
export type {
	AccommodationArea,
	AccommodationResearch,
	ActivitiesResearch,
	Activity,
	BookingLink,
	Budget,
	Destination,
	DestinationResearch,
	FlightCarrier,
	FlightOption,
	FlightResearch,
	ItineraryActivity,
	ItineraryDay,
	ItineraryResearch,
	MandatoryPreferences,
	NightlyRate,
	OptionalPreferences,
	PreferenceMatch,
	PreferencesUsed,
	Reviews,
	SubDestination,
	TravelPreferences,
} from "./core/types.js";
