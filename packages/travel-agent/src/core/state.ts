/**
 * Travel state management.
 *
 * Holds all accumulated data as the agent progresses through checklist phases.
 * Supports downstream invalidation when going back to a previous phase.
 */

import {
	type ChecklistPhaseConfig,
	createChecklist,
	formatChecklist,
	getActivePhase,
	type TravelChecklist,
} from "./checklist.js";
import type {
	AccommodationResearch,
	ActivitiesResearch,
	DestinationResearch,
	FlightResearch,
	ItineraryResearch,
	SubDestination,
	TravelPreferences,
} from "./types.js";

// =============================================================================
// State
// =============================================================================

export interface TravelState {
	sessionId: string;
	checklist: TravelChecklist;
	preferences: Partial<TravelPreferences>;
	destinationResearch: DestinationResearch | null;
	selectedDestinations: SubDestination[];
	activitiesResearch: ActivitiesResearch | null;
	itineraryResearch: ItineraryResearch | null;
	accommodationResearch: AccommodationResearch | null;
	flightResearch: FlightResearch | null;
}

/** Create a fresh travel state for a new session. */
export function createTravelState(sessionId: string, checklistConfig: ChecklistPhaseConfig[]): TravelState {
	return {
		sessionId,
		checklist: createChecklist(checklistConfig),
		preferences: {},
		destinationResearch: null,
		selectedDestinations: [],
		activitiesResearch: null,
		itineraryResearch: null,
		accommodationResearch: null,
		flightResearch: null,
	};
}

// =============================================================================
// Phase-to-field mapping
// =============================================================================

/** Map of phase IDs to the state fields they produce. */
const PHASE_DATA_FIELDS: Record<string, (keyof TravelState)[]> = {
	gather_preferences: ["preferences"],
	shortlist_destinations: ["destinationResearch"],
	select_destinations: ["selectedDestinations"],
	research_experiences: ["activitiesResearch"],
	plan_itinerary: ["itineraryResearch"],
	research_accommodation_flights: ["accommodationResearch", "flightResearch"],
	final_plan: [],
};

/**
 * Invalidate downstream state when going back to a previous phase.
 * Clears data for all phases after (and including) `fromPhaseId`.
 */
export function invalidateDownstream(state: TravelState, fromPhaseId: string): TravelState {
	const phaseIndex = state.checklist.phases.findIndex((p) => p.id === fromPhaseId);
	if (phaseIndex < 0) return state;

	const updated = { ...state };
	for (let i = phaseIndex; i < state.checklist.phases.length; i++) {
		const fields = PHASE_DATA_FIELDS[state.checklist.phases[i].id];
		if (!fields) continue;
		for (const field of fields) {
			clearField(updated, field);
		}
	}
	return updated;
}

function clearField(state: TravelState, field: keyof TravelState): void {
	switch (field) {
		case "preferences":
			state.preferences = {};
			break;
		case "destinationResearch":
			state.destinationResearch = null;
			break;
		case "selectedDestinations":
			state.selectedDestinations = [];
			break;
		case "activitiesResearch":
			state.activitiesResearch = null;
			break;
		case "itineraryResearch":
			state.itineraryResearch = null;
			break;
		case "accommodationResearch":
			state.accommodationResearch = null;
			break;
		case "flightResearch":
			state.flightResearch = null;
			break;
	}
}

// =============================================================================
// State Formatting (for system prompt injection)
// =============================================================================

/** Format the current state for injection into the system prompt. */
export function formatStateForPrompt(state: TravelState): string {
	const sections: string[] = [];

	sections.push("# Current Progress\n");
	sections.push(formatChecklist(state.checklist));

	const active = getActivePhase(state.checklist);
	if (active) {
		sections.push(`\nActive phase: ${active.label}`);
	}

	if (Object.keys(state.preferences).length > 0) {
		sections.push("\n# Gathered Preferences\n");
		sections.push(formatPreferences(state.preferences));
	}

	if (state.destinationResearch) {
		sections.push("\n# Destination Research\n");
		sections.push(formatDestinationResearch(state.destinationResearch));
	}

	if (state.selectedDestinations.length > 0) {
		sections.push("\n# Selected Destinations\n");
		sections.push(formatSelectedDestinations(state.selectedDestinations));
	}

	if (state.activitiesResearch) {
		sections.push("\n# Activities Research\n");
		sections.push(formatActivitiesResearch(state.activitiesResearch));
	}

	if (state.itineraryResearch) {
		sections.push("\n# Itinerary\n");
		sections.push(formatItinerary(state.itineraryResearch));
	}

	if (state.accommodationResearch) {
		sections.push("\n# Accommodation Research\n");
		sections.push(formatAccommodationResearch(state.accommodationResearch));
	}

	if (state.flightResearch) {
		sections.push("\n# Flight Research\n");
		sections.push(formatFlightResearch(state.flightResearch));
	}

	return sections.join("\n");
}

function formatPreferences(prefs: Partial<TravelPreferences>): string {
	const lines: string[] = [];
	for (const [key, value] of Object.entries(prefs)) {
		if (value === undefined || value === null) continue;
		if (typeof value === "object" && !Array.isArray(value)) {
			lines.push(`- ${key}: ${JSON.stringify(value)}`);
		} else if (Array.isArray(value)) {
			lines.push(`- ${key}: ${value.join(", ")}`);
		} else {
			lines.push(`- ${key}: ${value}`);
		}
	}
	return lines.join("\n");
}

function formatDestinationResearch(research: any): string {
	if (!research) return "";
	const lines: string[] = [];
	lines.push(`Destination: ${research.destination?.name ?? "Unknown"}`);
	lines.push(`Summary: ${research.overallSummary ?? ""}`);
	const subs = research.subDestinations || [];
	lines.push(`Sub-destinations (${subs.length}):`);
	for (const sub of subs) {
		const score = sub.overallScore ? ` (score: ${sub.overallScore})` : "";
		const desc = sub.description ? sub.description.slice(0, 100) : "";
		const imgCount = sub.imageLinks ? sub.imageLinks.length : 0;
		lines.push(`  - ${sub.name || "Unknown"}${score}: ${desc}... (${imgCount} images)`);
	}
	return lines.join("\n");
}

function formatSelectedDestinations(destinations: any[]): string {
	if (!Array.isArray(destinations)) return "";
	return destinations.map((d) => `- ${d?.name || "Unknown"} (${d?.city ?? ""}, ${d?.country ?? ""})`).join("\n");
}

function formatActivitiesResearch(research: any): string {
	if (!research || !Array.isArray(research.activities)) return "";
	const byLocation = new Map<string, string[]>();
	for (const activity of research.activities) {
		const loc = activity.location || "Unknown Location";
		const list = byLocation.get(loc) ?? [];
		const imgCount = activity.imageLinks ? activity.imageLinks.length : 0;
		list.push(
			`  - ${activity.name || "Unknown"} (${activity.type || "Activity"}, ${activity.estimatedDurationHours || "?"}h) [${imgCount} images]`,
		);
		byLocation.set(loc, list);
	}
	const lines: string[] = [];
	for (const [location, activities] of byLocation) {
		lines.push(`${location}:`);
		lines.push(...activities);
	}
	return lines.join("\n");
}

function formatItinerary(research: any): string {
	if (!research || !Array.isArray(research.itinerary)) return "";
	const lines: string[] = [];
	if (research.description) lines.push(research.description);
	for (const day of research.itinerary) {
		const imgCount = day.imageLinks ? day.imageLinks.length : 0;
		lines.push(`Day ${day.dayNumber || "?"} (${day.date || "?"}) — ${day.place || "?"} [${imgCount} images]:`);
		const activities = day.activities || [];
		for (const act of activities) {
			const time = act.approxStartTime ?? act.timeSlot ?? "";
			lines.push(`  ${time} ${act.name || "Unknown"} (${act.type || "Activity"})`);
		}
	}
	return lines.join("\n");
}

function formatAccommodationResearch(research: any): string {
	if (!research || !Array.isArray(research.areasToStay)) return "";
	const lines: string[] = [];
	if (research.description) lines.push(research.description);
	for (const area of research.areasToStay) {
		const imgCount = area.imageLinks ? area.imageLinks.length : 0;
		lines.push(
			`Area: ${area.areaToStay || "Unknown"} (${area.city || "?"}, ${area.country || "?"}) [${imgCount} images]`,
		);
		lines.push(`  Highlights: ${area.highlights || ""}`);
		if (area.accommodationLinks && area.accommodationLinks.length > 0) {
			lines.push(`  Accommodation Links: ${area.accommodationLinks.join(", ")}`);
		}
	}
	return lines.join("\n");
}

function formatFlightResearch(research: any): string {
	if (!research || !Array.isArray(research.sample_options)) return "";
	const lines: string[] = [];
	lines.push(`Flights: ${research.route_origin || "?"} to ${research.route_destination || "?"}`);
	lines.push(`Typical fare: ${research.fare_typical_per_person_round_trip || "?"} ${research.fare_currency || ""}`);
	for (const opt of research.sample_options.slice(0, 3)) {
		lines.push(
			`  - ${opt.carrier_names_csv || "Unknown Airlines"} (${opt.stops || "Unknown stops"}, ${opt.duration_hours || "?"}h): ${opt.estimated_fare_amount || "?"} ${opt.estimated_fare_currency || ""}`,
		);
		if (opt.booking_url) lines.push(`    Booking: ${opt.booking_url}`);
	}
	return lines.join("\n");
}
