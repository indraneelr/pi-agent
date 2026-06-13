/**
 * update_travel_state tool — Persist structured travel data to state.
 *
 * The agent calls this to save preferences, destination research, selected
 * destinations, activities, itinerary, accommodation, or flight data.
 * Auto-saves to disk after each update.
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import { getActivePhase } from "../checklist.js";
import type { PersistenceOptions } from "../persistence.js";
import { saveTravelState } from "../persistence.js";
import type { TravelState } from "../state.js";
import type { DestinationResearch, SubDestination } from "../types.js";

const VALID_FIELDS = [
	"preferences",
	"destination_research",
	"selected_destinations",
	"activities_research",
	"itinerary_research",
	"accommodation_research",
	"flight_research",
] as const;

type UpdateField = (typeof VALID_FIELDS)[number];

const updateStateSchema = Type.Object({
	field: Type.String({ description: `Field to update. One of: ${VALID_FIELDS.join(", ")}` }),
	data: Type.Any({ description: "The structured data to save for this field" }),
});

type UpdateStateInput = Static<typeof updateStateSchema>;

export interface UpdateStateDetails {
	field: string;
	phase: string | null;
}

export interface UpdateStateDeps {
	getState: () => TravelState;
	setState: (state: TravelState) => void;
	persistOpts: PersistenceOptions;
}

export function createUpdateStateTool(deps: UpdateStateDeps): AgentTool<typeof updateStateSchema, UpdateStateDetails> {
	return {
		name: "update_travel_state",
		label: "Update Travel State",
		description:
			"Save structured travel data to the session state. " +
			`Valid fields: ${VALID_FIELDS.join(", ")}. ` +
			"For 'preferences', pass the full or partial preferences object (will be merged). " +
			"For other fields, pass the complete research output object.",
		parameters: updateStateSchema,
		async execute(_toolCallId: string, params: UpdateStateInput): Promise<AgentToolResult<UpdateStateDetails>> {
			validateField(params.field);

			const state = deps.getState();
			const active = getActivePhase(state.checklist);
			const data = normalizeToolData(params.data);
			const updated = applyUpdate(state, params.field as UpdateField, data);

			deps.setState(updated);
			saveTravelState(updated, deps.persistOpts);

			return {
				content: [{ type: "text", text: `Updated ${params.field} successfully.` }],
				details: {
					field: params.field,
					phase: active?.id ?? null,
				},
			};
		},
	};
}

function validateField(field: string): asserts field is UpdateField {
	if (!VALID_FIELDS.includes(field as UpdateField)) {
		throw new Error(`Invalid field "${field}". Must be one of: ${VALID_FIELDS.join(", ")}`);
	}
}

function normalizeToolData(data: unknown): unknown {
	if (typeof data !== "string") return data;
	const trimmed = data.trim();
	if (!trimmed) return data;
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return data;
	try {
		return JSON.parse(trimmed);
	} catch {
		return data;
	}
}

function applyUpdate(state: TravelState, field: UpdateField, data: unknown): TravelState {
	const updated = { ...state };

	switch (field) {
		case "preferences":
			// Merge partial preferences
			updated.preferences = { ...state.preferences, ...(data as Record<string, unknown>) };
			break;
		case "destination_research":
			updated.destinationResearch = normalizeDestinationResearch(data, state);
			break;
		case "selected_destinations":
			updated.selectedDestinations = data as TravelState["selectedDestinations"];
			break;
		case "activities_research":
			validateActivitiesResearch(data, state);
			updated.activitiesResearch = data as TravelState["activitiesResearch"];
			break;
		case "itinerary_research":
			updated.itineraryResearch = data as TravelState["itineraryResearch"];
			break;
		case "accommodation_research":
			validateAccommodationResearch(data);
			updated.accommodationResearch = data as TravelState["accommodationResearch"];
			break;
		case "flight_research":
			validateFlightResearch(data);
			updated.flightResearch = data as TravelState["flightResearch"];
			break;
	}

	return updated;
}

function normalizeDestinationResearch(data: unknown, state: TravelState): DestinationResearch {
	if (!data || typeof data !== "object") {
		throw new Error("destination_research must be an object.");
	}
	const raw = data as Record<string, any>;
	const rawOptions = raw.subDestinations ?? raw.destinations ?? raw.destination_research;
	if (!Array.isArray(rawOptions)) {
		throw new Error(
			"destination_research must include subDestinations, destinations, or destination_research as an array of option cards.",
		);
	}

	const options = rawOptions.map((item: Record<string, any>) => normalizeSubDestination(item));
	validateDestinationOptionCards(options, state);

	return {
		destination: raw.destination ?? {
			title: String(state.preferences.destination ?? "Destination options"),
			name: String(state.preferences.destination ?? "Destination options"),
			description: raw.overallSummary ?? raw.summary ?? "Curated destination options.",
			bestTimeToVisit: raw.bestTimeToVisit ?? "Check current seasonal guidance for the travel dates.",
			reviews: raw.reviews ?? {},
			sources: raw.sources ?? [],
		},
		subDestinations: options,
		overallSummary: raw.overallSummary ?? raw.summary ?? "Curated options matching the user's preferences.",
		tripHighlights: Array.isArray(raw.tripHighlights) ? raw.tripHighlights : [],
		travelTips: Array.isArray(raw.travelTips) ? raw.travelTips : [],
		preferencesUsed: raw.preferencesUsed ?? {
			themes: state.preferences.travel_themes ?? state.preferences.interests ?? [],
			groupType: state.preferences.group_type ?? "unknown",
			numNights: state.preferences.num_nights,
			interests: state.preferences.interests,
		},
		nextUserAction:
			raw.nextUserAction ??
			`Choose the places you want to include${state.preferences.num_nights ? ` for the ${state.preferences.num_nights}-night trip` : ""}.`,
		schemaVersion: "2.0.0",
	};
}

function normalizeSubDestination(item: Record<string, any>): SubDestination {
	const name = item.name ?? item.location ?? item.title;
	const why = item.why ?? item.reason;
	const bestFor = item.bestFor ?? item.best_for ?? inferBestFor(item);
	const imageQuery =
		item.imageQuery ?? item.imageKeywords ?? (name ? `${name} travel ${bestFor ?? "highlights"}` : undefined);
	return {
		...item,
		name,
		type: item.type ?? "place",
		description: item.description,
		bestFor,
		why,
		roughDays: item.roughDays ?? item.rough_days ?? item.dayAllocation ?? item.day_allocation,
		logisticsFit: item.logisticsFit ?? item.logistics_fit ?? item.logistics,
		budgetFit: item.budgetFit ?? item.budget_fit ?? item.budgetNote ?? item.budget_note,
		seasonNote: item.seasonNote ?? item.season_note ?? item.weatherNote ?? item.weather_note,
		tradeoff: item.tradeoff ?? item.tradeOff ?? item.downside,
		imageQuery,
		selected: item.selected ?? false,
		reviews: item.reviews ?? {},
		sources: Array.isArray(item.sources) ? item.sources : [],
	};
}

function inferBestFor(item: Record<string, any>): string | undefined {
	const text = JSON.stringify(item).toLowerCase();
	if (text.includes("beach")) return "best for beaches";
	if (text.includes("food")) return "best for food";
	if (text.includes("history") || text.includes("archaeolog") || text.includes("myth")) return "best for history";
	if (text.includes("family") || text.includes("kid")) return "best for families";
	if (text.includes("value") || text.includes("budget")) return "best value";
	return undefined;
}

function validateDestinationOptionCards(options: SubDestination[], state: TravelState): void {
	const destination = String(state.preferences.destination ?? "").trim();
	const numNights = Number(state.preferences.num_nights ?? 0);
	const broadDestination = destination.length > 0;
	if (broadDestination) {
		const isSurprise = /surprise|anywhere|options|not sure|undecided/i.test(destination);
		const min = isSurprise ? 3 : 8;
		const max = isSurprise ? 5 : numNights > 14 ? 12 : 10;
		if (options.length < min || options.length > max) {
			throw new Error(`destination_research must include ${min}-${max} option cards; received ${options.length}.`);
		}
	}

	const seen = new Set<string>();
	for (const option of options) {
		const name = String(option.name ?? "").trim();
		if (!name) throw new Error("Each destination option must include a non-empty name.");
		const key = name.toLowerCase();
		if (seen.has(key)) throw new Error(`Duplicate destination option: ${name}`);
		seen.add(key);
		for (const field of [
			"description",
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
				throw new Error(`Destination option "${name}" is missing a useful ${field} field.`);
			}
		}
		if (looksLikeCopiedDescription(option, options)) {
			throw new Error(`Destination option "${name}" appears to reuse another option's description.`);
		}
	}
}

function looksLikeCopiedDescription(option: SubDestination, options: SubDestination[]): boolean {
	const own = normalizeText(option.description);
	if (own.length < 40) return false;
	return options.some((other) => other !== option && normalizeText(other.description) === own);
}

function normalizeText(text: string): string {
	return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function validateActivitiesResearch(data: unknown, state: TravelState): void {
	const research = data as TravelState["activitiesResearch"];
	if (!research || !Array.isArray(research.activities) || research.activities.length === 0) {
		throw new Error("activities_research must include activities.");
	}
	for (const selected of state.selectedDestinations) {
		const selectedName = selected.name?.toLowerCase();
		if (!selectedName) continue;
		const count = research.activities.filter((activity) =>
			String(activity.location ?? "")
				.toLowerCase()
				.includes(selectedName),
		).length;
		if (count < 4 || count > 6) {
			throw new Error(`Expected 4-6 activity options for ${selected.name}; received ${count}.`);
		}
	}
}

function validateAccommodationResearch(data: unknown): void {
	const research = data as TravelState["accommodationResearch"];
	if (!research || !Array.isArray(research.areasToStay) || research.areasToStay.length === 0) {
		throw new Error("accommodation_research must include areasToStay.");
	}
	for (const area of research.areasToStay) {
		const name = String(area.areaToStay ?? "").trim();
		if (!name) {
			throw new Error("Each accommodation area must include a non-empty areaToStay name.");
		}
		if (typeof area.description !== "string" || area.description.trim().length < 6) {
			throw new Error(`Accommodation area "${name}" is missing a useful description.`);
		}
	}
	const cities = new Map<string, string>();
	for (const area of research.areasToStay) {
		const city = String(area.city ?? "").trim();
		if (city) cities.set(city.toLowerCase(), city);
	}
	for (const [cityKey, cityLabel] of cities) {
		const count = research.areasToStay.filter(
			(a) =>
				String(a.city ?? "")
					.trim()
					.toLowerCase() === cityKey,
		).length;
		if (count < 4 || count > 6) {
			throw new Error(`City "${cityLabel}" has ${count} accommodation option(s); provide 4-6 per overnight city.`);
		}
	}
}

function validateFlightResearch(data: unknown): void {
	const research = data as TravelState["flightResearch"];
	if (!research || !Array.isArray(research.sample_options)) {
		throw new Error("flight_research must include sample_options.");
	}
	if (
		research.sample_options.length > 0 &&
		(research.sample_options.length < 4 || research.sample_options.length > 6)
	) {
		throw new Error(
			`flight_research must include 4-6 viable flight options; received ${research.sample_options.length}.`,
		);
	}
}
