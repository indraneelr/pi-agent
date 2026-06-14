/**
 * update_travel_state tool — Persist structured travel data to state.
 *
 * The agent calls this to save preferences, destination research, selected
 * destinations, activities, itinerary, accommodation, or flight data.
 * Auto-saves to disk after each update.
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import { scoreActivityResearchQuality } from "../activity-fit.js";
import { getActivePhase } from "../checklist.js";
import type { PersistenceOptions } from "../persistence.js";
import { saveTravelState } from "../persistence.js";
import type { TravelState } from "../state.js";
import { normalizeDestinationResearch } from "./destination-research.js";

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
			"Save structured travel data to the session state. Call this tool whenever you have completed a checklist phase artifact; do not merely say you will save it. " +
			`Valid fields: ${VALID_FIELDS.join(", ")}. ` +
			"For 'preferences', pass the full or partial preferences object (will be merged). " +
			"Prefer the dedicated save_destination_shortlist tool for 'destination_research' option cards, but this field remains supported for backward compatibility. " +
			"For 'activities_research', every activity is quality-validated against the selected destinations and current preferences: provide 4-6 activities per selected place, valid duration/cost/tips fields, and practical caveats tied to stated axes such as logistics, budget, season/dates, trip length, kids/family, beaches, culture, or food. If validation fails, fix the named activities and call this tool again. " +
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
		case "activities_research": {
			const normalized = normalizeActivitiesResearch(data);
			validateActivitiesResearch(normalized, state);
			updated.activitiesResearch = normalized;
			break;
		}
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

function normalizeActivitiesResearch(data: unknown): NonNullable<TravelState["activitiesResearch"]> {
	if (data && typeof data === "object" && Array.isArray((data as Record<string, any>).activities)) {
		return {
			...(data as Record<string, any>),
			activities: (data as Record<string, any>).activities.map((activity: any) => normalizeActivity(activity)),
		} as NonNullable<TravelState["activitiesResearch"]>;
	}

	const activities: any[] = [];
	collectActivities(data, undefined, activities);
	if (activities.length > 0) {
		return { activities } as NonNullable<TravelState["activitiesResearch"]>;
	}

	const keys =
		data && typeof data === "object" ? Object.keys(data as Record<string, unknown>).join(", ") : typeof data;
	throw new Error(
		`activities_research must include activities as a top-level array, or a grouped shape such as { destinations: [{ name, activities }] }, { byDestination: { Tokyo: [...] } }, or { Tokyo: { recommended, switchable } }. Received keys/type: ${keys || "none"}.`,
	);
}

function collectActivities(value: unknown, locationHint: string | undefined, out: any[]): void {
	if (!value || typeof value !== "object") return;
	if (Array.isArray(value)) {
		for (const item of value) {
			if (looksLikeActivity(item)) out.push(normalizeActivity(item, locationHint));
			else collectActivities(item, locationHint, out);
		}
		return;
	}

	const record = value as Record<string, any>;
	let collectedGrouped = false;

	if (Array.isArray(record.activities)) {
		const nestedLocation = stringValue(record.name) ?? stringValue(record.location) ?? locationHint;
		for (const item of record.activities) out.push(normalizeActivity(item, nestedLocation));
		collectedGrouped = true;
	}
	if (Array.isArray(record.recommended)) {
		for (const item of record.recommended) out.push(normalizeActivity(item, locationHint, "recommended"));
		collectedGrouped = true;
	}
	if (Array.isArray(record.switchable)) {
		for (const item of record.switchable) out.push(normalizeActivity(item, locationHint, "switchable"));
		collectedGrouped = true;
	}
	if (Array.isArray(record.alternatives)) {
		for (const item of record.alternatives) out.push(normalizeActivity(item, locationHint, "switchable"));
		collectedGrouped = true;
	}
	if (Array.isArray(record.destinations)) {
		for (const destination of record.destinations) {
			const nestedLocation = stringValue(destination?.name) ?? stringValue(destination?.location) ?? locationHint;
			collectActivities(destination, nestedLocation, out);
		}
		collectedGrouped = true;
	}
	if (record.byDestination && typeof record.byDestination === "object") {
		for (const [destinationName, grouped] of Object.entries(record.byDestination))
			collectActivities(grouped, destinationName, out);
		collectedGrouped = true;
	}
	if (collectedGrouped) return;

	if (looksLikeActivity(record)) {
		out.push(normalizeActivity(record, locationHint));
		return;
	}

	for (const [key, nested] of Object.entries(record)) {
		if (["activities", "recommended", "switchable", "alternatives", "destinations", "byDestination"].includes(key))
			continue;
		if (nested && typeof nested === "object" && !Array.isArray(nested)) collectActivities(nested, key, out);
	}
}

function normalizeActivity(activity: any, locationHint?: string, priority?: "recommended" | "switchable"): any {
	const normalized = {
		...activity,
		location: stringValue(activity?.location) ?? locationHint,
		reviews: activity?.reviews ?? {},
		sources: Array.isArray(activity?.sources) ? activity.sources : [],
	};
	if (priority && normalized.priority == null) normalized.priority = priority;
	const duration = normalized.estimatedDurationHours ?? normalized.durationHours ?? normalized.duration_hours;
	if (typeof duration === "string") {
		const match = duration.match(/\d+(?:\.\d+)?/);
		if (match) normalized.estimatedDurationHours = Number(match[0]);
	} else if (typeof duration === "number") {
		normalized.estimatedDurationHours = duration;
	}
	const cost = normalized.estimatedCost ?? normalized.cost ?? normalized.price;
	if (typeof cost === "string") {
		const match = cost.match(/\d+(?:\.\d+)?/);
		if (match) normalized.estimatedCost = Number(match[0]);
	} else if (typeof cost === "number") {
		normalized.estimatedCost = cost;
	}
	return normalized;
}

function looksLikeActivity(value: unknown): boolean {
	return !!value && typeof value === "object" && typeof (value as Record<string, any>).name === "string";
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

	const quality = scoreActivityResearchQuality(
		research.activities,
		state.preferences,
		state.selectedDestinations.map((destination) => ({ name: destination.name })),
	);
	if (!quality.pass) {
		throw new Error(
			"activities_research failed quality validation. Fix and call update_travel_state again. " +
				quality.issues.map((issue) => `activity-quality: ${issue}`).join(" "),
		);
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
