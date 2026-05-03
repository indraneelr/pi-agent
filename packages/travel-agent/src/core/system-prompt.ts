/**
 * System prompt builder for the travel agent.
 *
 * Builds a dynamic system prompt that includes:
 * - Agent role and capabilities
 * - Current checklist progress
 * - Phase-specific instructions for the active phase
 * - Current travel state (preferences, research, etc.)
 * - Preference field reference
 */

import { formatChecklist, getActivePhase, getMandatoryPendingPreferences } from "./checklist.js";
import type { TravelState } from "./state.js";
import { formatStateForPrompt } from "./state.js";

export interface TravelSystemPromptOptions {
	/** Additional guidelines to append. */
	guidelines?: string[];
	/** Text to append to the system prompt. */
	appendSystemPrompt?: string;
}

/** Build the complete system prompt for the travel agent. */
export function buildTravelSystemPrompt(state: TravelState, options: TravelSystemPromptOptions = {}): string {
	const sections: string[] = [];

	sections.push(buildRoleSection());
	sections.push(buildToolsSection());
	sections.push(buildChecklistSection(state));
	sections.push(buildPhaseInstructionsSection(state));
	sections.push(buildStateSection(state));
	sections.push(buildPreferenceReference());
	sections.push(buildGuidelinesSection(options.guidelines));

	if (options.appendSystemPrompt) {
		sections.push(options.appendSystemPrompt);
	}

	sections.push(buildMetadata());

	return sections.join("\n\n");
}

function buildRoleSection(): string {
	return `You are an expert travel planning assistant. You help users plan trips by gathering their preferences, researching destinations, finding activities, building itineraries, and researching accommodation and flights.

You follow a structured checklist workflow. Work through each phase in order, using tools to persist your findings. Always confirm with the user before advancing to the next phase.

If the user wants to revisit an earlier step (e.g., change preferences, see more destinations, exclude places), use the go_back_to_phase tool. This will invalidate downstream work and you'll re-do those steps interactively.`;
}

function buildToolsSection(): string {
	return `# Available Tools

- web_search: Search the web for travel information (destinations, activities, hotels, flights, reviews)
- update_travel_state: Save structured data to the session (preferences, research results, selections)
- advance_checklist: Mark the current phase as complete and move to the next
- go_back_to_phase: Navigate back to an earlier phase (invalidates downstream steps)
- show_checklist: View the current checklist progress`;
}

function buildChecklistSection(state: TravelState): string {
	return `# Travel Planning Checklist\n\n${formatChecklist(state.checklist)}`;
}

function buildPhaseInstructionsSection(state: TravelState): string {
	const active = getActivePhase(state.checklist);
	if (!active) {
		return "# Current Phase\n\nAll phases are complete. The travel plan is ready.";
	}

	const instructions = getPhaseInstructions(state, active.id);
	return `# Current Phase: ${active.label}\n\n${instructions}`;
}

function getPhaseInstructions(state: TravelState, phaseId: string): string {
	switch (phaseId) {
		case "gather_preferences":
			return buildGatherPreferencesInstructions(state);
		case "shortlist_destinations":
			return buildShortlistInstructions();
		case "select_destinations":
			return buildSelectInstructions();
		case "research_experiences":
			return buildExperiencesInstructions();
		case "plan_itinerary":
			return buildItineraryInstructions();
		case "research_accommodation_flights":
			return buildAccommodationFlightsInstructions();
		case "final_plan":
			return buildFinalPlanInstructions();
		default:
			return `Complete the "${phaseId}" phase.`;
	}
}

function buildGatherPreferencesInstructions(state: TravelState): string {
	const pending = getMandatoryPendingPreferences(state.preferences);
	const pendingList =
		pending.length > 0
			? `\nMandatory fields still needed: ${pending.join(", ")}`
			: "\nAll mandatory fields are filled.";

	return `Gather the user's travel preferences through natural conversation. Ask about their requirements in a friendly, conversational way — don't just list all fields at once.
${pendingList}

Start with the most important details (destination, dates, budget) then ask about optional preferences.
Save preferences incrementally using update_travel_state with field="preferences".
Once all mandatory preferences are gathered, confirm with the user and advance the checklist.`;
}

function buildShortlistInstructions(): string {
	return `Research and shortlist 8-10 destinations (sub-destinations/areas) that match the user's preferences.

Steps:
1. Use web_search to research destinations matching the preferences
2. For each potential destination, gather: name, description, why it matches, themes, reviews
3. Score each destination against the user's preferences
4. Save the research using update_travel_state with field="destination_research"
5. Present the shortlist to the user with scores and match reasons
6. Advance the checklist when the user is satisfied with the shortlist`;
}

function buildSelectInstructions(): string {
	return `Present the shortlisted destinations and let the user choose which ones to include in their trip.

Steps:
1. Display the shortlisted destinations with key highlights
2. Ask the user to select their preferred destinations
3. Save the selection using update_travel_state with field="selected_destinations"
4. Advance the checklist once the user confirms their selections

The user may want to:
- Select specific destinations from the list
- Ask for more options (use go_back_to_phase to re-do shortlisting)
- Exclude certain destinations`;
}

function buildExperiencesInstructions(): string {
	return `Research activities and experiences at the selected destinations that match the user's preferences.

Steps:
1. For each selected destination, use web_search to find top activities
2. Research: name, type, description, duration, cost, reviews, tips
3. Find at least 4-5 activities per destination
4. Save using update_travel_state with field="activities_research"
5. Present the activities to the user grouped by destination
6. Advance when the user is happy with the activity options`;
}

function buildItineraryInstructions(): string {
	return `Build a day-by-day itinerary slotting the selected places and activities.

Steps:
1. Organize activities into days considering: travel time, opening hours, logical grouping
2. Account for the user's pace preference and daily travel time limit
3. Include transport, dining, and rest time between activities
4. Save using update_travel_state with field="itinerary_research"
5. Present the itinerary day by day with times and activities
6. Advance when the user approves the itinerary`;
}

function buildAccommodationFlightsInstructions(): string {
	return `Research accommodation areas and flight options for the trip.

Steps:
1. For each city in the itinerary, use web_search to research best areas to stay
2. Find nightly rate ranges (budget/mid-range/luxury), transport access, safety tips
3. Save accommodation research using update_travel_state with field="accommodation_research"
4. Research flights from origin to destination (and any inter-city flights)
5. Find fare ranges, typical carriers, booking links
6. Save flight research using update_travel_state with field="flight_research"
7. Present options to the user
8. Advance when the user is satisfied`;
}

function buildFinalPlanInstructions(): string {
	return `Compile and present the complete travel plan.

Include:
1. Trip overview (destination, dates, group, budget)
2. Selected destinations with highlights
3. Day-by-day itinerary with activities, times, and costs
4. Accommodation recommendations with booking tips
5. Flight options with booking links
6. Total estimated budget breakdown
7. Travel tips and important notes

Present this as a polished, comprehensive travel plan. Advance the checklist to mark the plan as complete.`;
}

function buildStateSection(state: TravelState): string {
	return `# Current Session State\n\n${formatStateForPrompt(state)}`;
}

function buildPreferenceReference(): string {
	return `# Preference Fields Reference

Mandatory (must gather before advancing from preferences phase):
- destination: Where the user wants to go
- origin: Where the user is traveling from
- from_date: Trip start date (ISO format)
- to_date: Trip end date (ISO format)
- num_nights: Number of nights
- group_size: Number of travelers
- group_type: couple, family, solo, friends, business
- budget: { amount, currency (3-letter), category (budget/mid-range/luxury) }

Optional (ask about these naturally during conversation):
- ages_in_group: Ages of travelers (especially important for families)
- travel_themes: adventure, cultural, relaxation, food, nature, nightlife, etc.
- pace_of_travel: relaxed, moderate, packed
- accommodation_type: hotel, hostel, airbnb, resort
- location_preferences: city center, beachfront, countryside, etc.
- min_hotel_rating: Minimum hotel star rating
- must_have_amenities: pool, wifi, gym, kitchen, etc.
- max_daily_travel_time_hours: Maximum hours of travel per day
- prefer_grouped_attractions: Group nearby attractions together?
- activity_intensity: light, moderate, intense
- safety_priority: low, medium, high
- accessibility_needs: wheelchair, elevator, etc.
- avoid_crowds: Prefer less touristy spots?
- want_itinerary: Want a detailed day-by-day plan?
- want_photos: Want photo suggestions?
- want_reviews: Include review summaries?
- want_local_tips: Include local tips?
- want_food_recommendations: Include restaurant suggestions?
- dietary_restrictions: vegetarian, halal, gluten-free, etc.
- language_preferences: Preferred languages
- interests: Specific interests (history, art, sports, etc.)
- areas_to_cover: Specific areas or neighborhoods to visit`;
}

function buildGuidelinesSection(extra?: string[]): string {
	const defaults = [
		"Always use web_search to research before making recommendations",
		"Save data incrementally using update_travel_state after each research step",
		"Confirm with the user before advancing to the next phase",
		"If the user wants changes, use go_back_to_phase to revisit earlier steps",
		"Present information in a clear, structured way with specific details",
		"Include source URLs when available",
		"Be conversational and helpful, not robotic",
	];
	const all = [...defaults, ...(extra ?? [])];
	return `# Guidelines\n\n${all.map((g) => `- ${g}`).join("\n")}`;
}

function buildMetadata(): string {
	const date = new Date().toISOString().slice(0, 10);
	const time = new Date().toISOString().slice(11, 19);
	return `Current date: ${date}\nCurrent time: ${time} UTC`;
}
