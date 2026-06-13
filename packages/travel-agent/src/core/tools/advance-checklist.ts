/**
 * advance_checklist tool — Mark current phase as done and move to next.
 *
 * Validates that the current phase has the required data before advancing.
 * For gather_preferences, checks all mandatory preferences are filled.
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { advanceChecklist, formatChecklist, getActivePhase, getMandatoryPendingPreferences } from "../checklist.js";
import type { PersistenceOptions } from "../persistence.js";
import { saveTravelState } from "../persistence.js";
import type { TravelState } from "../state.js";

const advanceChecklistSchema = Type.Object({});

export interface AdvanceChecklistDetails {
	previousPhase: string;
	newActivePhase: string | null;
}

export interface AdvanceChecklistDeps {
	getState: () => TravelState;
	setState: (state: TravelState) => void;
	persistOpts: PersistenceOptions;
}

export function createAdvanceChecklistTool(
	deps: AdvanceChecklistDeps,
): AgentTool<typeof advanceChecklistSchema, AdvanceChecklistDetails> {
	return {
		name: "advance_checklist",
		label: "Advance Checklist",
		description:
			"Mark the current checklist phase as complete and move to the next phase. " +
			"Only call this when you have completed all work for the current phase. " +
			"For the gather_preferences phase, all mandatory preferences must be filled first.",
		parameters: advanceChecklistSchema,
		async execute(): Promise<AgentToolResult<AdvanceChecklistDetails>> {
			const state = deps.getState();
			const active = getActivePhase(state.checklist);
			if (!active) {
				throw new Error("No active phase to advance. The checklist is already complete.");
			}

			validatePhaseCompletion(state, active.id);

			const previousPhase = active.id;
			const updated = { ...state, checklist: advanceChecklist(state.checklist) };
			deps.setState(updated);
			saveTravelState(updated, deps.persistOpts);

			const newActive = getActivePhase(updated.checklist);
			const formatted = formatChecklist(updated.checklist);

			return {
				content: [{ type: "text", text: `Phase "${active.label}" completed.\n\n${formatted}` }],
				details: {
					previousPhase,
					newActivePhase: newActive?.id ?? null,
				},
			};
		},
	};
}

function validatePhaseCompletion(state: TravelState, phaseId: string): void {
	switch (phaseId) {
		case "gather_preferences": {
			const pending = getMandatoryPendingPreferences(state.preferences);
			if (pending.length > 0) {
				throw new Error(`Cannot advance: mandatory preferences still missing: ${pending.join(", ")}`);
			}
			break;
		}
		case "shortlist_destinations": {
			if (!state.destinationResearch || state.destinationResearch.subDestinations.length === 0) {
				throw new Error("Cannot advance: no destinations have been researched yet.");
			}
			validateDestinationCardsForAdvance(state);
			break;
		}
		case "select_destinations": {
			if (state.selectedDestinations.length === 0) {
				throw new Error("Cannot advance: no destinations have been selected by the user.");
			}
			break;
		}
		case "research_experiences": {
			if (!state.activitiesResearch || state.activitiesResearch.activities.length === 0) {
				throw new Error("Cannot advance: no activities have been researched yet.");
			}
			if (state.selectedDestinations.length > 0) {
				for (const destination of state.selectedDestinations) {
					const count = state.activitiesResearch.activities.filter((activity) =>
						String(activity.location ?? "")
							.toLowerCase()
							.includes(destination.name.toLowerCase()),
					).length;
					if (count < 4 || count > 6) {
						throw new Error(`Cannot advance: ${destination.name} needs 4-6 activity options; found ${count}.`);
					}
				}
			}
			break;
		}
		case "plan_itinerary": {
			if (!state.itineraryResearch || state.itineraryResearch.itinerary.length === 0) {
				throw new Error("Cannot advance: no itinerary has been created yet.");
			}
			break;
		}
		case "research_accommodation_flights": {
			if (!state.accommodationResearch && !state.flightResearch) {
				throw new Error("Cannot advance: neither accommodation nor flight research has been done.");
			}
			if (
				state.flightResearch?.sample_options?.length &&
				(state.flightResearch.sample_options.length < 4 || state.flightResearch.sample_options.length > 6)
			) {
				throw new Error("Cannot advance: provide 4-6 flight options or explicitly defer flights.");
			}
			if (state.accommodationResearch) {
				validateAccommodationCardsForAdvance(state);
			}
			break;
		}
	}
}

function validateDestinationCardsForAdvance(state: TravelState): void {
	const options = state.destinationResearch?.subDestinations ?? [];
	const destination = String(state.preferences.destination ?? "").toLowerCase();
	const isSurprise = /surprise|anywhere|options|not sure|undecided/.test(destination);
	const min = isSurprise ? 3 : 8;
	const max = isSurprise ? 5 : Number(state.preferences.num_nights ?? 0) > 14 ? 12 : 10;
	if (options.length < min || options.length > max) {
		throw new Error(
			`Cannot advance: destination shortlist must contain ${min}-${max} curated options; found ${options.length}.`,
		);
	}
	const seen = new Set<string>();
	for (const option of options) {
		const name = option.name?.trim();
		if (!name) throw new Error("Cannot advance: every destination option must have a name.");
		const key = name.toLowerCase();
		if (seen.has(key)) throw new Error(`Cannot advance: duplicate destination option "${name}".`);
		seen.add(key);
		for (const field of [
			"bestFor",
			"why",
			"roughDays",
			"logisticsFit",
			"budgetFit",
			"seasonNote",
			"tradeoff",
		] as const) {
			const value = option[field];
			if (typeof value !== "string" || value.trim().length < 6) {
				throw new Error(`Cannot advance: destination option "${name}" is missing ${field}.`);
			}
		}
	}
	if (!state.destinationResearch?.nextUserAction) {
		throw new Error("Cannot advance: destination research must include nextUserAction for the user's choice step.");
	}
}

function validateAccommodationCardsForAdvance(state: TravelState): void {
	const areas = state.accommodationResearch?.areasToStay ?? [];
	if (areas.length === 0) return;
	for (const area of areas) {
		const name = String(area.areaToStay ?? "").trim();
		if (!name) throw new Error("Cannot advance: every accommodation area must have an areaToStay name.");
		if (typeof area.description !== "string" || area.description.trim().length < 6) {
			throw new Error(`Cannot advance: accommodation area "${name}" is missing a useful description.`);
		}
	}
	const cities = new Map<string, string>();
	for (const area of areas) {
		const city = String(area.city ?? "").trim();
		if (city) cities.set(city.toLowerCase(), city);
	}
	for (const [cityKey, cityLabel] of cities) {
		const count = areas.filter(
			(a) =>
				String(a.city ?? "")
					.trim()
					.toLowerCase() === cityKey,
		).length;
		if (count < 4 || count > 6) {
			throw new Error(
				`Cannot advance: city "${cityLabel}" has ${count} accommodation option(s); provide 4-6 per overnight city.`,
			);
		}
	}
}
