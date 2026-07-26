/**
 * Instant actions (ADR 0001).
 *
 * Deterministic, LLM-free mutations of canonical trip state: selecting,
 * deselecting, and removing places and activities. These run in single-digit
 * milliseconds so the UI feels instant; the agent is reserved for generate
 * actions. Each function is pure — it returns a new state or throws
 * InstantActionError — so it is trivially unit-testable and safe to reason about.
 */

import type { TravelState } from "./state.js";

/** Thrown when an instant action references something not present in state. */
export class InstantActionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InstantActionError";
	}
}

export type InstantAction =
	| { type: "select_place"; name: string }
	| { type: "deselect_place"; name: string }
	| { type: "remove_place"; name: string }
	| { type: "select_activity"; name: string }
	| { type: "deselect_activity"; name: string }
	| { type: "remove_activity"; name: string };

export const INSTANT_ACTION_TYPES: ReadonlyArray<InstantAction["type"]> = [
	"select_place",
	"deselect_place",
	"remove_place",
	"select_activity",
	"deselect_activity",
	"remove_activity",
];

const norm = (value: string): string => value.trim().toLowerCase();

/** Apply an instant action, returning a new state. Throws on invalid references. */
export function applyInstantAction(state: TravelState, action: InstantAction): TravelState {
	switch (action.type) {
		case "select_place":
			return selectPlace(state, action.name);
		case "deselect_place":
			return deselectPlace(state, action.name);
		case "remove_place":
			return removePlace(state, action.name);
		case "select_activity":
			return selectActivity(state, action.name);
		case "deselect_activity":
			return deselectActivity(state, action.name);
		case "remove_activity":
			return removeActivity(state, action.name);
		default: {
			const exhaustive: never = action;
			throw new InstantActionError(`Unknown instant action: ${JSON.stringify(exhaustive)}`);
		}
	}
}

function selectPlace(state: TravelState, name: string): TravelState {
	const candidates = state.destinationResearch?.subDestinations ?? [];
	const match = candidates.find((place) => norm(place.name) === norm(name));
	if (!match) throw new InstantActionError(`No such place to select: "${name}"`);
	if (state.selectedDestinations.some((place) => norm(place.name) === norm(name))) {
		return state; // already selected — idempotent
	}
	return { ...state, selectedDestinations: [...state.selectedDestinations, match] };
}

function deselectPlace(state: TravelState, name: string): TravelState {
	const next = state.selectedDestinations.filter((place) => norm(place.name) !== norm(name));
	if (next.length === state.selectedDestinations.length) return state;
	return { ...state, selectedDestinations: next };
}

function removePlace(state: TravelState, name: string): TravelState {
	const selected = state.selectedDestinations.filter((place) => norm(place.name) !== norm(name));
	let destinationResearch = state.destinationResearch;
	if (destinationResearch) {
		destinationResearch = {
			...destinationResearch,
			subDestinations: destinationResearch.subDestinations.filter((place) => norm(place.name) !== norm(name)),
		};
	}
	return { ...state, selectedDestinations: selected, destinationResearch };
}

function selectActivity(state: TravelState, name: string): TravelState {
	const candidates = state.activitiesResearch?.activities ?? [];
	if (!candidates.some((activity) => norm(activity.name) === norm(name))) {
		throw new InstantActionError(`No such activity to select: "${name}"`);
	}
	const current = state.selectedActivityNames ?? [];
	if (current.some((existing) => norm(existing) === norm(name))) return state;
	return { ...state, selectedActivityNames: [...current, name] };
}

function deselectActivity(state: TravelState, name: string): TravelState {
	const current = state.selectedActivityNames ?? [];
	const next = current.filter((existing) => norm(existing) !== norm(name));
	if (next.length === current.length) return state;
	return { ...state, selectedActivityNames: next };
}

function removeActivity(state: TravelState, name: string): TravelState {
	const current = state.selectedActivityNames ?? [];
	const selectedActivityNames = current.filter((existing) => norm(existing) !== norm(name));
	let activitiesResearch = state.activitiesResearch;
	if (activitiesResearch) {
		activitiesResearch = {
			...activitiesResearch,
			activities: activitiesResearch.activities.filter((activity) => norm(activity.name) !== norm(name)),
		};
	}
	return { ...state, selectedActivityNames, activitiesResearch };
}
