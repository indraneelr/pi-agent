import { advanceChecklist, type TravelSession, type TravelState } from "@mariozechner/pi-travel-agent";
import type { TravelStreamEvent } from "./events.js";

export type PlannerAction =
	| { type: "images"; destinationName: string }
	| { type: "reviews"; destinationName: string }
	| { type: "activities" };

export class PlannerActionError extends Error {}

export function isPlannerAction(value: unknown): value is PlannerAction {
	if (!value || typeof value !== "object") return false;
	const action = value as { type?: unknown; destinationName?: unknown };
	return (
		action.type === "activities" ||
		((action.type === "images" || action.type === "reviews") &&
			typeof action.destinationName === "string" &&
			Boolean(action.destinationName.trim()))
	);
}

export function requireDestination(state: TravelState, name: string) {
	const card = state.destinationResearch?.subDestinations.find(
		(entry) => entry.name.trim().toLowerCase() === name.trim().toLowerCase(),
	);
	if (!card)
		throw new PlannerActionError(
			"This place is no longer in the shortlist. Refresh your trip and choose a current place.",
		);
	return card;
}

/** A prose acknowledgement is not completion of a card action. Retry once within the same bounded run. */
export async function runResearchAction(
	session: TravelSession,
	action: Exclude<PlannerAction, { type: "images" }>,
	emit: (event: TravelStreamEvent) => void,
	signal: AbortSignal,
) {
	const beforeActivities = JSON.stringify(session.state.activitiesResearch);
	const beforeReviews =
		action.type === "reviews"
			? requireDestination(session.state, action.destinationName).reviews?.researchedAt
			: undefined;
	if (action.type === "activities") {
		if (!session.state.selectedDestinations.length)
			throw new PlannerActionError("Select at least one place before exploring activities.");
		const state = session.state;
		if (state.checklist.phases[state.checklist.activePhaseIndex]?.id === "select_destinations") {
			session.setState({ ...state, checklist: advanceChecklist(state.checklist) });
		}
	}
	const prompt =
		action.type === "reviews"
			? `Research traveler reviews for ${JSON.stringify(action.destinationName)} now using web_search. Save the results with save_destination_reviews: pros, cons, reviewSummary, sources and providerRatings for Google Maps and Tripadvisor. Ratings must be from a matching place listing, never an attraction or hotel substituted for a city. Omit any rating you cannot find; explain unavailable sources. Keep chat to a brief confirmation; the full review belongs in the destination card.`
			: `Research activities NOW for the selected places: ${JSON.stringify(session.state.selectedDestinations.map((card) => card.name))}. The user has confirmed these selections. Use web_search, then call update_travel_state with field activities_research to save 4-6 practical activities per selected place, with duration, cost, family suitability, tips and sources. Advance the checklist as needed. Photos are optional. Finish the research in this run; do not stop with a promise to begin later or ask for permission again.`;
	for (let attempt = 0; attempt < 2; attempt++) {
		signal.throwIfAborted();
		emit({
			type: "tool_start",
			tool: "planner_action",
			label: attempt
				? "Finishing and saving the research…"
				: action.type === "reviews"
					? "Researching traveler reviews…"
					: "Researching activities for your selected places…",
		});
		await session.agent.prompt(
			`[Planner action: ${action.type}] ${attempt ? "The requested card data has not been saved yet. Continue the same task and call the required save tool now. " : ""}${prompt}`,
		);
		signal.throwIfAborted();
		const complete =
			action.type === "reviews"
				? Boolean(requireDestination(session.state, action.destinationName).reviews?.researchedAt) &&
					requireDestination(session.state, action.destinationName).reviews?.researchedAt !== beforeReviews
				: Boolean(session.state.activitiesResearch?.activities.length) &&
					JSON.stringify(session.state.activitiesResearch) !== beforeActivities;
		if (complete) return;
	}
	throw new PlannerActionError(
		action.type === "reviews"
			? "Review research ended without saving reviews. Nothing is running in the background. Retry reviews to try again."
			: "Activity research ended without saving activity options. Nothing is running in the background. Retry activity research to continue.",
	);
}
