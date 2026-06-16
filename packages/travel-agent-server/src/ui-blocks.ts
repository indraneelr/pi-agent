import type { TravelState } from "@mariozechner/pi-travel-agent";

export type TravelUiBlock =
	| ChecklistProgressBlock
	| TripPreferencesSummaryBlock
	| DestinationCardsBlock
	| SelectedDestinationsBlock
	| BudgetSummaryBlock
	| ActivityCardsBlock
	| ItineraryTimelineBlock
	| AccommodationCardsBlock
	| FlightOptionsBlock;

export interface UiBlockEnvelope<TKind extends string, TData> {
	id: string;
	kind: TKind;
	version: 1;
	title: string;
	data: TData;
	actions: UiBlockAction[];
	sourceStatePath: string;
}

export interface UiBlockAction {
	id: string;
	label: string;
	type: "placeholder";
}

export type ChecklistProgressBlock = UiBlockEnvelope<
	"checklist_progress",
	{
		activePhaseIndex: number;
		phases: Array<{ id: string; label: string; description: string; status: string }>;
	}
>;

export type TripPreferencesSummaryBlock = UiBlockEnvelope<
	"trip_preferences_summary",
	{ preferences: Record<string, unknown> }
>;

export type DestinationCardsBlock = UiBlockEnvelope<
	"destination_cards",
	{
		destinationName: string;
		overallSummary: string;
		cards: DestinationCard[];
	}
>;

export interface DestinationCard {
	name: string;
	summary: string;
	whyItFits?: string;
	tradeoff?: string;
	seasonality?: string;
	budgetFit?: string;
	logisticsFit?: string;
	imageQuery?: string;
	imageLinks: string[];
	selected: boolean;
}

export type SelectedDestinationsBlock = UiBlockEnvelope<
	"selected_destinations",
	{ destinations: Array<{ name: string; summary?: string; whyItFits?: string }> }
>;

export type BudgetSummaryBlock = UiBlockEnvelope<"budget_summary", { budget?: unknown }>;

export type ActivityCardsBlock = UiBlockEnvelope<
	"activity_cards",
	{
		activities: Array<{
			name: string;
			type: string;
			location: string;
			summary: string;
			cost?: number;
			durationHours?: number;
			tips?: string;
		}>;
	}
>;

export type ItineraryTimelineBlock = UiBlockEnvelope<
	"itinerary_timeline",
	{
		description?: string;
		days: Array<{ dayNumber: number; date: string; place: string; activityCount: number; activities: string[] }>;
	}
>;

export type AccommodationCardsBlock = UiBlockEnvelope<
	"accommodation_cards",
	{
		areas: Array<{
			city: string;
			areaToStay: string;
			summary: string;
			highlights: string;
			nightlyRate?: unknown;
			transport?: string;
		}>;
	}
>;

export type FlightOptionsBlock = UiBlockEnvelope<
	"flight_options",
	{
		route: string;
		dates: string;
		typicalFare: string;
		options: Array<{
			rank: number;
			carriers: string;
			stops: string;
			fare: string;
			bookingLabel: string;
			notes?: string;
		}>;
		caveats: string[];
	}
>;

export function composeTravelUiBlocks(state: TravelState): TravelUiBlock[] {
	const blocks: TravelUiBlock[] = [
		{
			id: "checklist-progress",
			kind: "checklist_progress",
			version: 1,
			title: "Checklist progress",
			data: {
				activePhaseIndex: state.checklist.activePhaseIndex,
				phases: state.checklist.phases.map((phase) => ({
					id: phase.id,
					label: phase.label,
					description: phase.description,
					status: phase.status,
				})),
			},
			actions: [],
			sourceStatePath: "checklist",
		},
		{
			id: "trip-preferences-summary",
			kind: "trip_preferences_summary",
			version: 1,
			title: "Trip preferences",
			data: { preferences: state.preferences as Record<string, unknown> },
			actions: [],
			sourceStatePath: "preferences",
		},
	];

	if (state.destinationResearch) {
		blocks.push({
			id: "destination-cards",
			kind: "destination_cards",
			version: 1,
			title: "Destination options",
			data: {
				destinationName:
					state.destinationResearch.destination?.name ??
					state.destinationResearch.destination?.title ??
					"Destination",
				overallSummary: state.destinationResearch.overallSummary ?? "",
				cards: state.destinationResearch.subDestinations.map((destination) => ({
					name: destination.name,
					summary: destination.description,
					whyItFits: destination.why ?? destination.bestFor,
					tradeoff: destination.tradeoff,
					seasonality: destination.seasonNote,
					budgetFit: destination.budgetFit,
					logisticsFit: destination.logisticsFit,
					imageQuery: destination.imageQuery ?? destination.imageKeywords,
					imageLinks: destination.imageLinks ?? [],
					selected: state.selectedDestinations.some((selected) => selected.name === destination.name),
				})),
			},
			actions: [
				{ id: "select-destination", label: "Select", type: "placeholder" },
				{ id: "remove-destination", label: "Remove", type: "placeholder" },
			],
			sourceStatePath: "destinationResearch.subDestinations",
		});
	}

	if (state.selectedDestinations.length > 0) {
		blocks.push({
			id: "selected-destinations",
			kind: "selected_destinations",
			version: 1,
			title: "Selected destinations",
			data: {
				destinations: state.selectedDestinations.map((destination) => ({
					name: destination.name,
					summary: destination.description,
					whyItFits: destination.why ?? destination.bestFor,
				})),
			},
			actions: [],
			sourceStatePath: "selectedDestinations",
		});
	}

	if (state.preferences.budget !== undefined) {
		blocks.push({
			id: "budget-summary",
			kind: "budget_summary",
			version: 1,
			title: "Budget summary",
			data: { budget: state.preferences.budget },
			actions: [],
			sourceStatePath: "preferences.budget",
		});
	}

	if (state.activitiesResearch?.activities?.length) {
		blocks.push({
			id: "activity-cards",
			kind: "activity_cards",
			version: 1,
			title: "Activity ideas",
			data: {
				activities: state.activitiesResearch.activities.slice(0, 8).map((activity) => ({
					name: activity.name,
					type: activity.type,
					location: activity.location,
					summary: activity.description,
					cost: activity.estimatedCost,
					durationHours: activity.estimatedDurationHours,
					tips: activity.tips,
				})),
			},
			actions: [],
			sourceStatePath: "activitiesResearch.activities",
		});
	}

	if (state.itineraryResearch?.itinerary?.length) {
		blocks.push({
			id: "itinerary-timeline",
			kind: "itinerary_timeline",
			version: 1,
			title: "Itinerary timeline",
			data: {
				description: state.itineraryResearch.description,
				days: state.itineraryResearch.itinerary.map((day) => ({
					dayNumber: day.dayNumber,
					date: day.date,
					place: day.place,
					activityCount: day.activities.length,
					activities: day.activities.slice(0, 4).map((activity) => activity.name),
				})),
			},
			actions: [],
			sourceStatePath: "itineraryResearch.itinerary",
		});
	}

	if (state.accommodationResearch?.areasToStay?.length) {
		blocks.push({
			id: "accommodation-cards",
			kind: "accommodation_cards",
			version: 1,
			title: "Where to stay",
			data: {
				areas: state.accommodationResearch.areasToStay.map((area) => ({
					city: area.city,
					areaToStay: area.areaToStay,
					summary: area.description,
					highlights: area.highlights,
					nightlyRate: area.typicalNightlyRate,
					transport: area.nearbyTransport,
				})),
			},
			actions: [],
			sourceStatePath: "accommodationResearch.areasToStay",
		});
	}

	if (state.flightResearch) {
		blocks.push({
			id: "flight-options",
			kind: "flight_options",
			version: 1,
			title: "Flight options",
			data: {
				route: `${state.flightResearch.route_origin} → ${state.flightResearch.route_destination}`,
				dates: `${state.flightResearch.route_depart_date} – ${state.flightResearch.route_return_date}`,
				typicalFare: `${state.flightResearch.fare_typical_per_person_round_trip} ${state.flightResearch.fare_currency} pp`,
				options: state.flightResearch.sample_options.slice(0, 5).map((option) => ({
					rank: option.option_rank,
					carriers: option.carrier_names_csv,
					stops: option.stops,
					fare: `${option.estimated_fare_amount} ${option.estimated_fare_currency}`,
					bookingLabel: option.booking_label,
					notes: option.option_notes,
				})),
				caveats: state.flightResearch.caveats,
			},
			actions: [],
			sourceStatePath: "flightResearch",
		});
	}

	return blocks;
}
