/**
 * Activity research quality scoring.
 *
 * Stage 2 preference-fit checks prove destination cards match the user's stated
 * preferences. This module starts the same release-readiness discipline for the
 * next stage: activity/experience research after destinations are selected.
 *
 * It is deterministic and keyword-based so tests/evals can run without an LLM
 * judge. The goal is not to declare an activity "good" universally; it is to
 * catch obvious client-quality misses: activities for the wrong selected place,
 * generic items that ignore the user's themes/group, and missing practical
 * caveats around time/logistics/budget/season/tradeoffs.
 */

import { AXIS_LABEL, classifyTradeoffSeverity, type PreferenceAxis, type TradeoffSeverity } from "./preference-fit.js";
import type { Activity, SubDestination, TravelPreferences } from "./types.js";

export type ActivityQualityAxis = "destination" | PreferenceAxis | "duration" | "practicalTips";

const ACTIVITY_AXES: ActivityQualityAxis[] = [
	"destination",
	"beaches",
	"culture",
	"food",
	"logistics",
	"kids",
	"budget",
	"season",
	"tripLength",
	"duration",
	"practicalTips",
];

const ACTIVITY_AXIS_LABEL: Record<ActivityQualityAxis, string> = {
	destination: "selected destination",
	beaches: AXIS_LABEL.beaches,
	culture: AXIS_LABEL.culture,
	food: AXIS_LABEL.food,
	logistics: AXIS_LABEL.logistics,
	kids: AXIS_LABEL.kids,
	budget: AXIS_LABEL.budget,
	season: AXIS_LABEL.season,
	tripLength: AXIS_LABEL.tripLength,
	duration: "duration/time realism",
	practicalTips: "practical tips/caveats",
};

const ACTIVITY_PATTERNS: Record<PreferenceAxis, RegExp> = {
	beaches:
		/\b(beaches?|coasts?|coastal|swim(ming)?|snorkel(ing)?|boat|sailing|kayak(ing)?|lagoon|cove|waterfront|shore|island|sand(y)?|sea|marine)\b/i,
	culture:
		/\b(cultures?|cultural|history|historical?|historic|ruins?|archaeology|archaeological|museum|museums|temple|ancient|heritage|unesco|castle|monument|architecture|old town|walking tour)\b/i,
	food: /\b(food|foods|cuisine|culinary|gastronomy|taverna|restaurant|market|cooking|wine|winery|seafood|dining|tasting|farm|olive|cheese|street food)\b/i,
	logistics:
		/\b(transfer|transfers|drive|driving|walk|walking|ferry|bus|taxi|metro|train|pickup|drop[- ]?off|distance|nearby|central|route|access|accessible|logistics|book ahead|reservation|queue|parking)\b/i,
	kids: /\b(kids?|children|child|famil(y|ies)|toddlers?|teen|shallow|stroller|playground|easy pace|hands[- ]?on|interactive|safe|kid[- ]?friendly|child[- ]?friendly)\b/i,
	budget:
		/\b(cost|costs|price|prices|pricing|fee|fees|ticket|tickets|entry|free|affordable|expensive|cheap|value|budget|mid[- ]?range|included|extra|cash|euro|€)\b/i,
	season:
		/\b(season|seasonal|weather|summer|winter|spring|autumn|fall|june|july|august|heat|hot|sun|shade|wind|windy|rain|crowd|crowded|peak|morning|afternoon|evening|sunset)\b/i,
	tripLength:
		/\b(day|days|night|nights|half[- ]?day|full[- ]?day|hours?|duration|time|pace|rushed|rest day|downtime|short|long)\b/i,
};

export interface ActivityQualityScore {
	name: string;
	location: string;
	matchedDestination?: string;
	relevantAxes: ActivityQualityAxis[];
	addressedAxes: ActivityQualityAxis[];
	missingAxes: ActivityQualityAxis[];
	fitRatio: number;
	tradeoffText: string;
	tradeoffAxes: PreferenceAxis[];
	tradeoffRelevantAxes: PreferenceAxis[];
	tradeoffSeverity: TradeoffSeverity;
	issues: string[];
}

export interface ActivityResearchQuality {
	relevantAxes: ActivityQualityAxis[];
	activityScores: ActivityQualityScore[];
	coverageByAxis: Record<ActivityQualityAxis, number>;
	issues: string[];
	pass: boolean;
}

export interface ScoreActivityResearchOptions {
	/** Minimum per-activity fit ratio. Default: 0.5. */
	minFitRatio?: number;
	/** Require tips/description to include a contextual downside/caveat. Default: true. */
	requireContextualTradeoff?: boolean;
}

export function scoreActivityResearchQuality(
	activities: readonly Activity[],
	prefs: Partial<TravelPreferences>,
	selectedDestinations: readonly Pick<SubDestination, "name">[] = [],
	options: ScoreActivityResearchOptions = {},
): ActivityResearchQuality {
	const relevantAxes = deriveActivityQualityAxes(prefs);
	const activityScores = activities.map((activity) =>
		scoreActivityQuality(activity, prefs, selectedDestinations, relevantAxes, options),
	);
	const coverageByAxis = Object.fromEntries(
		ACTIVITY_AXES.map((axis) => [axis, activityScores.filter((score) => score.addressedAxes.includes(axis)).length]),
	) as Record<ActivityQualityAxis, number>;
	const issues = activityScores.flatMap((score) => score.issues);
	for (const axis of relevantAxes.filter((axis) => axis !== "destination")) {
		if (coverageByAxis[axis] === 0) issues.push(`No activity addresses ${ACTIVITY_AXIS_LABEL[axis]}.`);
	}
	return { relevantAxes, activityScores, coverageByAxis, issues, pass: issues.length === 0 };
}

export function scoreActivityQuality(
	activity: Activity,
	prefs: Partial<TravelPreferences>,
	selectedDestinations: readonly Pick<SubDestination, "name">[] = [],
	relevantAxes = deriveActivityQualityAxes(prefs),
	options: ScoreActivityResearchOptions = {},
): ActivityQualityScore {
	const minFitRatio = options.minFitRatio ?? 0.5;
	const requireContextualTradeoff = options.requireContextualTradeoff ?? true;
	const text = activityText(activity);
	const matchedDestination = matchSelectedDestination(activity, selectedDestinations);
	const addressedAxes: ActivityQualityAxis[] = [];
	if (matchedDestination || selectedDestinations.length === 0) addressedAxes.push("destination");
	for (const axis of relevantAxes) {
		if (axis === "destination") continue;
		if (axis === "duration") {
			if (
				Number.isFinite(activity.estimatedDurationHours) &&
				activity.estimatedDurationHours > 0 &&
				activity.estimatedDurationHours <= 12
			) {
				addressedAxes.push(axis);
			}
		} else if (axis === "practicalTips") {
			if (fieldText(activity.tips).length >= 12 || fieldText(activity.bestTimeToVisit).length >= 12)
				addressedAxes.push(axis);
		} else if (axis === "budget") {
			if (activity.estimatedCost != null || ACTIVITY_PATTERNS.budget.test(text)) addressedAxes.push(axis);
		} else if (ACTIVITY_PATTERNS[axis].test(text)) {
			addressedAxes.push(axis);
		}
	}
	const uniqueAddressed = ACTIVITY_AXES.filter((axis) => addressedAxes.includes(axis) && relevantAxes.includes(axis));
	const missingAxes = relevantAxes.filter((axis) => !uniqueAddressed.includes(axis));
	const fitRatio = relevantAxes.length ? uniqueAddressed.length / relevantAxes.length : 0;
	const tradeoffText = extractTradeoffText(activity);
	const tradeoffAxes = matchActivityPreferenceAxes(tradeoffText);
	const prefAxes = relevantAxes.filter((axis): axis is PreferenceAxis => isPreferenceAxis(axis));
	const tradeoffRelevantAxes = tradeoffAxes.filter((axis) => prefAxes.includes(axis));
	const tradeoffSeverity = classifyTradeoffSeverity(tradeoffText);
	const name = activity.name || "Unnamed activity";
	const issues: string[] = [];
	if (selectedDestinations.length > 0 && !matchedDestination) {
		issues.push(
			`"${name}" does not clearly match any selected destination (${selectedDestinations.map((d) => d.name).join(", ")}).`,
		);
	}
	if (fitRatio < minFitRatio) {
		issues.push(`"${name}" only addresses ${Math.round(fitRatio * 100)}% of relevant activity-quality axes.`);
	}
	if (requireContextualTradeoff && tradeoffText.length < 8) {
		issues.push(`"${name}" is missing a practical tradeoff/caveat in tips or description.`);
	} else if (requireContextualTradeoff && tradeoffRelevantAxes.length === 0) {
		issues.push(`"${name}" tradeoff/caveat does not map to a relevant preference axis.`);
	}
	return {
		name,
		location: activity.location,
		matchedDestination,
		relevantAxes,
		addressedAxes: uniqueAddressed,
		missingAxes,
		fitRatio,
		tradeoffText,
		tradeoffAxes,
		tradeoffRelevantAxes,
		tradeoffSeverity,
		issues,
	};
}

export function deriveActivityQualityAxes(prefs: Partial<TravelPreferences>): ActivityQualityAxis[] {
	const axes = new Set<ActivityQualityAxis>(["destination", "duration", "practicalTips"]);
	const blob =
		`${(prefs.travel_themes ?? []).join(" ")} ${(prefs.interests ?? []).join(" ")} ${prefs.group_type ?? ""}`.toLowerCase();
	if (prefs.budget) axes.add("budget");
	if (prefs.from_date || prefs.to_date) axes.add("season");
	if (prefs.num_nights) axes.add("tripLength");
	if (
		prefs.origin ||
		prefs.max_daily_travel_time_hours != null ||
		/easy|logistics|transfer|transport|nearby/.test(blob)
	)
		axes.add("logistics");
	for (const axis of ["beaches", "culture", "food", "kids"] as const) {
		if (ACTIVITY_PATTERNS[axis].test(blob)) axes.add(axis);
	}
	if ((prefs.ages_in_group ?? []).some((age) => Number(age) > 0 && Number(age) < 13)) axes.add("kids");
	return ACTIVITY_AXES.filter((axis) => axes.has(axis));
}

export function matchSelectedDestination(
	activity: Activity,
	selectedDestinations: readonly Pick<SubDestination, "name">[],
): string | undefined {
	const text = normalize(`${activity.location} ${activity.name} ${activity.description}`);
	return selectedDestinations.find((dest) => destinationAliases(dest.name).some((alias) => text.includes(alias)))
		?.name;
}

export function matchActivityPreferenceAxes(text: string): PreferenceAxis[] {
	return (Object.keys(ACTIVITY_PATTERNS) as PreferenceAxis[]).filter((axis) => ACTIVITY_PATTERNS[axis].test(text));
}

function extractTradeoffText(activity: Activity): string {
	const tips = fieldText(activity.tips);
	const description = fieldText(activity.description);
	const caveatSentence = [...tips.split(/[.!?;]/), ...description.split(/[.!?;]/)]
		.map((s) => s.trim())
		.find((s) =>
			/\b(but|however|tradeoff|downside|avoid|book|crowd|heat|cost|expensive|transfer|ferry|queue|limited|early|morning|peak|busy|not ideal|requires?)\b/i.test(
				s,
			),
		);
	return caveatSentence ?? tips;
}

function activityText(activity: Activity): string {
	return [
		activity.name,
		activity.type,
		activity.description,
		activity.location,
		activity.tips,
		activity.bestTimeToVisit,
		activity.themes,
		activity.suitableForGroups,
		activity.estimatedCost,
		activity.reviews,
	]
		.map(fieldText)
		.join(" ");
}

function fieldText(value: unknown): string {
	if (typeof value === "string") return value.trim();
	if (typeof value === "number") return String(value);
	if (Array.isArray(value)) return value.map(fieldText).filter(Boolean).join(" ");
	if (value != null && typeof value === "object") {
		return Object.entries(value as Record<string, unknown>)
			.flatMap(([k, v]) => [k, fieldText(v)])
			.filter(Boolean)
			.join(" ");
	}
	return "";
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
	const parts = normalized
		.split(/\s+(?:and|with|plus)\s+|\s*[&+]\s*|\s*[(),–-]\s*/)
		.map((part) => part.trim())
		.filter(Boolean);
	return [...new Set([normalized, ...parts].filter((part) => part.length >= 3))];
}

function isPreferenceAxis(axis: ActivityQualityAxis): axis is PreferenceAxis {
	return ["beaches", "culture", "food", "logistics", "kids", "budget", "season", "tripLength"].includes(axis);
}
