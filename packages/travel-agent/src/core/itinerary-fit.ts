/**
 * Itinerary planning quality scoring.
 *
 * Deterministic release-readiness checks for the plan_itinerary phase. The
 * scorer validates that a persisted day-by-day itinerary uses the user's
 * selected places and approved activity set, respects dates/trip length, avoids
 * overloaded days, and includes practical logistics/budget/season context.
 */

import { AXIS_LABEL, type PreferenceAxis } from "./preference-fit.js";
import type {
	Activity,
	ItineraryActivity,
	ItineraryDay,
	ItineraryResearch,
	SubDestination,
	TravelPreferences,
} from "./types.js";

export type ItineraryQualityAxis = "dates" | "selectedPlaces" | "approvedActivities" | "dailyLoad" | PreferenceAxis;

const ITINERARY_AXES: ItineraryQualityAxis[] = [
	"dates",
	"selectedPlaces",
	"approvedActivities",
	"dailyLoad",
	"logistics",
	"budget",
	"season",
	"tripLength",
	"beaches",
	"food",
	"culture",
	"kids",
];

const AXIS_PATTERNS: Record<PreferenceAxis, RegExp> = {
	beaches: /\b(beach|beaches|coast|coastal|sea|swim|snorkel|boat|island|sand|waterfront|shore)\b/i,
	culture:
		/\b(culture|cultural|history|historic|heritage|temple|shrine|museum|market|old town|castle|monument|walking|district)\b/i,
	food: /\b(food|cuisine|culinary|market|restaurant|dinner|lunch|breakfast|tasting|cooking|wine|seafood|ramen|sushi)\b/i,
	logistics:
		/\b(train|bus|ferry|flight|transfer|transit|taxi|metro|drive|walk|route|nearby|group|cluster|base|shinkansen|airport|arrival|departure|logistics)\b/i,
	kids: /\b(kid|kids|child|children|family|families|stroller|playground|shallow|interactive|easy pace|safe)\b/i,
	budget:
		/\b(budget|cost|costs|price|fee|ticket|free|cheap|expensive|value|save|splurge|mid[- ]?range|cash|€|eur|usd|\$)\b/i,
	season:
		/\b(season|weather|spring|summer|winter|autumn|fall|april|june|july|august|september|heat|rain|wind|crowd|crowds|peak|morning|afternoon|evening|sunset)\b/i,
	tripLength:
		/\b(day|days|night|nights|pace|rushed|rest|downtime|arrival|departure|half[- ]?day|full[- ]?day|limited|short|long)\b/i,
};

const AXIS_LABELS: Record<ItineraryQualityAxis, string> = {
	dates: "date sequence",
	selectedPlaces: "selected places",
	approvedActivities: "approved activities",
	dailyLoad: "daily load",
	beaches: AXIS_LABEL.beaches,
	culture: AXIS_LABEL.culture,
	food: AXIS_LABEL.food,
	logistics: AXIS_LABEL.logistics,
	kids: AXIS_LABEL.kids,
	budget: AXIS_LABEL.budget,
	season: AXIS_LABEL.season,
	tripLength: AXIS_LABEL.tripLength,
};

export interface ItineraryDayQualityScore {
	dayNumber: number;
	date: string;
	place: string;
	activityCount: number;
	totalPlannedHours: number;
	matchedSelectedPlaces: string[];
	matchedApprovedActivities: string[];
	addressedAxes: ItineraryQualityAxis[];
	missingAxes: ItineraryQualityAxis[];
	issues: string[];
}

export interface ItineraryResearchQuality {
	relevantAxes: ItineraryQualityAxis[];
	dayScores: ItineraryDayQualityScore[];
	coverageByAxis: Record<ItineraryQualityAxis, number>;
	approvedActivityMatches: string[];
	issues: string[];
	pass: boolean;
}

export function deriveItineraryQualityAxes(prefs: Partial<TravelPreferences>): ItineraryQualityAxis[] {
	const axes = new Set<ItineraryQualityAxis>([
		"dates",
		"selectedPlaces",
		"approvedActivities",
		"dailyLoad",
		"logistics",
	]);
	if (prefs.budget) axes.add("budget");
	if (prefs.from_date || prefs.to_date) axes.add("season");
	if (prefs.num_nights) axes.add("tripLength");
	const blob = `${(prefs.travel_themes ?? []).join(" ")} ${(prefs.interests ?? []).join(" ")} ${prefs.group_type ?? ""}`;
	for (const axis of ["beaches", "food", "culture", "kids"] as const) {
		if (AXIS_PATTERNS[axis].test(blob)) axes.add(axis);
	}
	if ((prefs.ages_in_group ?? []).some((age) => Number(age) > 0 && Number(age) < 13)) axes.add("kids");
	return ITINERARY_AXES.filter((axis) => axes.has(axis));
}

export function scoreItineraryResearchQuality(
	itineraryResearch: ItineraryResearch | null | undefined,
	prefs: Partial<TravelPreferences>,
	selectedDestinations: readonly Pick<SubDestination, "name">[] = [],
	approvedActivities: readonly Pick<Activity, "name" | "location">[] = [],
): ItineraryResearchQuality {
	const relevantAxes = deriveItineraryQualityAxes(prefs);
	const days = normalizeItineraryDays(itineraryResearch);
	const issues: string[] = [];
	if (!itineraryResearch || days.length === 0) issues.push("itineraryResearch was not persisted with itinerary days.");

	const dayScores = days.map((day) => scoreItineraryDay(day, relevantAxes, selectedDestinations, approvedActivities));
	const coverageByAxis = Object.fromEntries(
		ITINERARY_AXES.map((axis) => [axis, dayScores.filter((score) => score.addressedAxes.includes(axis)).length]),
	) as Record<ItineraryQualityAxis, number>;

	for (const score of dayScores) issues.push(...score.issues);
	issues.push(...scoreTripStructure(days, prefs));

	for (const destination of selectedDestinations) {
		const name = destination.name;
		if (!name) continue;
		const covered = dayScores.some((score) => score.matchedSelectedPlaces.includes(name));
		if (!covered) issues.push(`No itinerary day clearly covers selected place ${name}.`);
	}

	const approvedActivityMatches = unique(dayScores.flatMap((score) => score.matchedApprovedActivities));
	if (approvedActivities.length > 0) {
		const minMatches = Math.min(approvedActivities.length, Math.max(2, Math.ceil(approvedActivities.length * 0.5)));
		if (approvedActivityMatches.length < minMatches) {
			issues.push(
				`Only ${approvedActivityMatches.length}/${approvedActivities.length} approved activities appear in the itinerary; expected at least ${minMatches}.`,
			);
		}
	}

	for (const axis of relevantAxes) {
		if (coverageByAxis[axis] === 0) issues.push(`No itinerary day addresses ${AXIS_LABELS[axis]}.`);
	}

	return { relevantAxes, dayScores, coverageByAxis, approvedActivityMatches, issues, pass: issues.length === 0 };
}

function scoreItineraryDay(
	day: ItineraryDay,
	relevantAxes: ItineraryQualityAxis[],
	selectedDestinations: readonly Pick<SubDestination, "name">[],
	approvedActivities: readonly Pick<Activity, "name" | "location">[],
): ItineraryDayQualityScore {
	const text = dayText(day);
	const matchedSelectedPlaces = selectedDestinations
		.filter((dest) =>
			destinationAliases(dest.name).some((alias) =>
				normalize(`${day.place} ${day.city ?? ""} ${text}`).includes(alias),
			),
		)
		.map((dest) => dest.name)
		.filter(Boolean);
	const matchedApprovedActivities = approvedActivities
		.filter((activity) => activityNameAliases(activity.name).some((alias) => normalize(text).includes(alias)))
		.map((activity) => activity.name)
		.filter(Boolean);
	const totalPlannedHours = (day.activities ?? []).reduce((sum, activity) => sum + validHours(activity), 0);
	const addressedAxes: ItineraryQualityAxis[] = [];
	if (isIsoDate(day.date)) addressedAxes.push("dates");
	if (matchedSelectedPlaces.length > 0 || selectedDestinations.length === 0) addressedAxes.push("selectedPlaces");
	if (matchedApprovedActivities.length > 0 || approvedActivities.length === 0)
		addressedAxes.push("approvedActivities");
	if ((day.activities?.length ?? 0) <= 3 && totalPlannedHours <= 8 && (day.activities?.length ?? 0) > 0)
		addressedAxes.push("dailyLoad");
	for (const axis of relevantAxes) {
		if (isPreferenceAxis(axis) && AXIS_PATTERNS[axis].test(text)) addressedAxes.push(axis);
	}
	const uniqueAddressed = ITINERARY_AXES.filter((axis) => addressedAxes.includes(axis) && relevantAxes.includes(axis));
	const missingAxes = relevantAxes.filter((axis) => !uniqueAddressed.includes(axis));
	const issues: string[] = [];
	if (!isIsoDate(day.date)) issues.push(`Day ${day.dayNumber || "?"} has invalid or missing ISO date.`);
	if (!day.place || String(day.place).trim().length < 2) issues.push(`Day ${day.dayNumber || "?"} is missing place.`);
	if (!Array.isArray(day.activities) || day.activities.length === 0)
		issues.push(`Day ${day.dayNumber || "?"} has no activities.`);
	if ((day.activities?.length ?? 0) > 3 || totalPlannedHours > 8) {
		issues.push(
			`Day ${day.dayNumber || "?"} is overloaded (${day.activities?.length ?? 0} activities, ${totalPlannedHours} planned hours).`,
		);
	}
	return {
		dayNumber: day.dayNumber,
		date: day.date,
		place: day.place,
		activityCount: day.activities?.length ?? 0,
		totalPlannedHours,
		matchedSelectedPlaces,
		matchedApprovedActivities,
		addressedAxes: uniqueAddressed,
		missingAxes,
		issues,
	};
}

function scoreTripStructure(days: ItineraryDay[], prefs: Partial<TravelPreferences>): string[] {
	const issues: string[] = [];
	const sorted = [...days].sort((a, b) => a.dayNumber - b.dayNumber);
	for (let i = 0; i < sorted.length; i++) {
		if (sorted[i].dayNumber !== i + 1) issues.push(`Expected dayNumber ${i + 1}, found ${sorted[i].dayNumber}.`);
		if (i > 0 && isIsoDate(sorted[i - 1].date) && isIsoDate(sorted[i].date)) {
			const delta = (Date.parse(sorted[i].date) - Date.parse(sorted[i - 1].date)) / 86_400_000;
			if (delta !== 1)
				issues.push(`Dates are not sequential between day ${sorted[i - 1].dayNumber} and ${sorted[i].dayNumber}.`);
		}
	}
	const nights = Number(prefs.num_nights ?? 0);
	if (nights > 0) {
		const minDays = Math.min(nights, 3);
		const maxDays = nights + 1;
		if (days.length < minDays || days.length > maxDays) {
			issues.push(
				`Itinerary has ${days.length} day(s); expected between ${minDays} and ${maxDays} for ${nights} nights.`,
			);
		}
	}
	return issues;
}

export function formatItineraryQualityAxis(axis: ItineraryQualityAxis): string {
	return AXIS_LABELS[axis];
}

function normalizeItineraryDays(itineraryResearch: unknown): ItineraryDay[] {
	const research = itineraryResearch as Record<string, unknown> | null | undefined;
	if (!research || typeof research !== "object") return [];
	if (Array.isArray(research.itinerary)) return research.itinerary as ItineraryDay[];
	if (Array.isArray(research.days)) return research.days as ItineraryDay[];
	const nested = research.itinerary;
	if (nested && typeof nested === "object" && Array.isArray((nested as Record<string, unknown>).days)) {
		return (nested as Record<string, unknown>).days as ItineraryDay[];
	}
	return [];
}

function dayText(day: ItineraryDay): string {
	return [day.date, day.place, day.city, day.country, day.activities].map(fieldText).join(" ");
}

function fieldText(value: unknown): string {
	if (typeof value === "string") return value.trim();
	if (typeof value === "number") return String(value);
	if (Array.isArray(value)) return value.map(fieldText).join(" ");
	if (value && typeof value === "object")
		return Object.values(value as Record<string, unknown>)
			.map(fieldText)
			.join(" ");
	return "";
}

function validHours(activity: ItineraryActivity): number {
	const value =
		(activity as ItineraryActivity & { durationHours?: number }).estimatedDurationHours ??
		(activity as ItineraryActivity & { durationHours?: number }).durationHours ??
		0;
	const hours = Number(value);
	return Number.isFinite(hours) && hours > 0 ? hours : 0;
}

function isIsoDate(value: unknown): value is string {
	return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function normalize(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function destinationAliases(name: string): string[] {
	const normalized = normalize(name);
	return unique([normalized, ...normalized.split(/\s+(?:and|with|plus|to)\s+|\s*[&+]\s*|\s*[(),–-]\s*/)]).filter(
		(part) => part.length >= 3,
	);
}

function activityNameAliases(name: string): string[] {
	const normalized = normalize(name);
	const words = normalized.split(" ").filter((w) => w.length >= 4);
	const compact = words.slice(0, 3).join(" ");
	return unique([normalized, compact].filter((part) => part.length >= 4));
}

function unique<T>(values: T[]): T[] {
	return [...new Set(values)];
}

function isPreferenceAxis(axis: ItineraryQualityAxis): axis is PreferenceAxis {
	return ["beaches", "culture", "food", "logistics", "kids", "budget", "season", "tripLength"].includes(axis);
}
