/**
 * Preference-fit scoring for Stage 2 destination shortlists.
 *
 * The schema/count checks in `destination-research` only verify that option
 * cards have the right shape and quantity. This module scores cards against
 * the actual user preferences so the eval can catch a shortlist that is
 * well-formed but fails to serve what the traveler asked for.
 *
 * Two independent concerns are scored:
 *
 * 1. Per-card preference fit — for each relevant preference axis, does the
 *    card actually address it? Structured axes (logistics/budget/season/
 *    tripLength) are addressed when their dedicated field is meaningfully
 *    filled. Theme/group axes (beaches/culture/food/kids) are addressed when
 *    the card's descriptive text mentions axis keywords.
 *
 * 2. Tradeoff relevance — a card tradeoff is only useful if it maps to at
 *    least one relevant preference axis, so the traveler can weigh it against
 *    something they actually care about.
 *
 * The scoring is deterministic and keyword-based so it can be unit tested and
 * used in the fresh live eval without an LLM judge.
 */

import type { SubDestination, TravelPreferences } from "./types.js";

/** Canonical preference axes used for shortlist scoring. */
export const PREFERENCE_AXES = [
	"beaches",
	"culture",
	"food",
	"logistics",
	"kids",
	"budget",
	"season",
	"tripLength",
] as const;

export type PreferenceAxis = (typeof PREFERENCE_AXES)[number];

/** Human-readable axis labels for eval reports. */
export const AXIS_LABEL: Record<PreferenceAxis, string> = {
	beaches: "beaches",
	culture: "culture/history",
	food: "food",
	logistics: "easy logistics",
	kids: "family/kids",
	budget: "budget",
	season: "season/dates",
	tripLength: "trip length",
};

/** Axes inferred from free-text themes/group profile rather than a dedicated card field. */
const THEME_AXES = ["beaches", "culture", "food", "kids"] as const;
type ThemeAxis = (typeof THEME_AXES)[number];

/** Axes backed by a dedicated card field. */
const STRUCTURED_AXES = ["logistics", "budget", "season", "tripLength"] as const;
type StructuredAxis = (typeof STRUCTURED_AXES)[number];

/** Dedicated card field that backs each structured axis. */
const STRUCTURED_FIELD: Record<StructuredAxis, keyof SubDestination> = {
	logistics: "logisticsFit",
	budget: "budgetFit",
	season: "seasonNote",
	tripLength: "roughDays",
};

/**
 * Keyword patterns used both to address theme axes and to map tradeoffs to axes.
 * Stems are plural-aware (`beaches?`) so "beaches", "ruins", "islands" etc. match.
 * Short stems that are prefixes of common unrelated words (sea→season, hot→hotel,
 * art→start) are avoided or fully written out.
 */
const AXIS_PATTERNS: Record<PreferenceAxis, RegExp> = {
	beaches:
		/\b(beaches?|coasts?|coastal|coastline|seaside|islands?|shore|snorkel(ing)?|swim(ming)?|sandy|waterfront|coves?|lagoon|marina|sailing|cliffs?|ocean|diving|kayak(ing)?)\b/i,
	culture:
		/\b(cultures?|cultural|history|historical?|historic|ruins?|archaeology|archaeological|heritage|museums?|temples?|ancient|monuments?|myths?|mythology|unesco|castles?|cathedrals?|galleries?|gallery|architecture|architectural)\b/i,
	food: /\b(foods?|cuisines?|culinary|gastronomy|gastronomic|tavernas?|restaurants?|wines?|wineries?|seafood|dining|delicacy|delicacies|tapas|gelato|cheeses?|olives?|street food|markets?)\b/i,
	logistics:
		/\b(ferries?|ferry|routes?|transfers?|drives?|driving|flights?|trains?|buses?|distances?|proximity|bases?|hubs?|connects?|connecting|connections?|hops?|logistics?|travel time|commute|transit|parking|access|accessible|reachable|remote|convenient)\b/i,
	kids: /\b(kids?|children?|child|families?|family|toddlers?|strollers?|playgrounds?|shallow|babies?|infants?|aquariums?|zoos?|theme parks?|amusement|child friendly|kid friendly|kid-friendly|child-friendly)\b/i,
	budget:
		/\b(budgets?|prices?|pricing|pricier|pricey|price|costs?|affordable|expensive|cheap(er)?|value|splurge|luxur(y|ious)?|mid-range|midrange|wallet|rates?|euros?|dollars?|costly|inexpensive|premium|steep)\b/i,
	season:
		/\b(seasons?|weather|months?|summer|spring|winter|autumns?|falls?|warm(er)?|windy|winds?|crowds?|crowded|tourists?|touristy|bus(y|ier)?|packed|popular|peak|shoulder|sunn(y|ier)?|rains?|rainy|hot(ter|test)?|cool(er)?|humid|humidity|temperatures?)\b/i,
	tripLength:
		/\b(days?|nights?|weeks?|stays?|stay|durations?|overnight|allocat(e|es|ing)?|rushed|trips?|too long|too short|enough time|short trip|long trip)\b/i,
};

/** Minimum length for a structured field to count as meaningfully addressing its axis. */
const MIN_STRUCTURED_FIELD_LENGTH = 6;

/**
 * Tradeoff severity classification.
 *
 * Classifies the magnitude of a card's `tradeoff` so the user and the eval
 * report can weigh downsides at a glance. Deterministic and keyword-based so it
 * is unit-testable without an LLM judge:
 *
 * - "high": strong negative language (significant/long/expensive/overcrowded/
 *   difficult/...) that materially affects the trip.
 * - "low": softening language (minor/slight/manageable/worth it/...) that
 *   signals a small, easy-to-mitigate downside.
 * - "medium": neutral default. Also returned when high and low cues both appear
 *   (a strong downside that is explicitly mitigated reads as a balanced, medium
 *   tradeoff rather than high).
 */
export type TradeoffSeverity = "low" | "medium" | "high";

export const SEVERITY_LABEL: Record<TradeoffSeverity, string> = {
	low: "low",
	medium: "medium",
	high: "high",
};

const HIGH_SEVERITY_PATTERN =
	/\b(major|significant|substantive|substantial|serious|severe|steep|heavily|heavy|big downside|deal[- ]?breaker|avoid|not worth|very expensive|expensive|pricey|costly|premium|overcrowded|very crowded|difficult|hard to reach|hard to get to|challenging|extreme|brutal|long drive|long ferry|long transfer|long bus|long flight|hours of travel|too far|too long|too short|rushed|cramped|packed|touristy|tourist trap|limited time|strenuous|exhausting)\b/i;

const LOW_SEVERITY_PATTERN =
	/\b(minor|slight|slightly|small|tiny|manageable|easy to|easy fix|no big deal|worth it|negligible|modest|mild|trivial|barely|short hop|quick)\b/i;

/** Classify the severity of a tradeoff string. */
export function classifyTradeoffSeverity(text: string): TradeoffSeverity {
	if (!text || !text.trim()) return "medium";
	const high = HIGH_SEVERITY_PATTERN.test(text);
	const low = LOW_SEVERITY_PATTERN.test(text);
	if (high && low) return "medium";
	if (high) return "high";
	if (low) return "low";
	return "medium";
}

export interface AxisEvidence {
	axis: PreferenceAxis;
	/** True when the card addresses this axis in a structured field or descriptive text. */
	addressed: boolean;
	/** Card field that provided the evidence, when applicable. */
	field?: string;
	/** Matched snippet, for theme axes. */
	snippet?: string;
}

export interface CardPreferenceScore {
	name: string;
	/** Preference axes relevant to this run (snapshot from preferences). */
	relevantAxes: PreferenceAxis[];
	axisEvidence: AxisEvidence[];
	/** Relevant axes this card addresses (structured or theme). */
	addressedAxes: PreferenceAxis[];
	/** Relevant axes this card does NOT address. */
	missingRelevantAxes: PreferenceAxis[];
	tradeoffText: string;
	/** All axes the tradeoff text maps to, relevant or not. */
	tradeoffAxes: PreferenceAxis[];
	/** Axes the tradeoff maps to that are also relevant for the run. */
	tradeoffRelevantAxes: PreferenceAxis[];
	tradeoffMapsToRelevant: boolean;
	/** Magnitude of the tradeoff (low/medium/high), keyword-derived. */
	tradeoffSeverity: TradeoffSeverity;
	fitsAtLeastOneRelevantAxis: boolean;
	/** Fraction of relevant axes addressed: addressed / relevant (0..1). */
	fitRatio: number;
	/** Concrete problems with this card's preference fit. */
	issues: string[];
}

export interface ShortlistPreferenceFit {
	/** All preference axes derived from the run preferences. */
	relevantAxes: PreferenceAxis[];
	/** Subset of relevant axes that are theme/group-driven. */
	themeAxes: PreferenceAxis[];
	cardScores: CardPreferenceScore[];
	/** Number of cards that address each axis. */
	coverageByAxis: Record<PreferenceAxis, number>;
	/** Relevant theme axes that no card addresses. */
	uncoveredThemeAxes: PreferenceAxis[];
	/** Aggregated problems across all cards plus menu coverage. */
	issues: string[];
	pass: boolean;
}

export interface ScoreShortlistOptions {
	/**
	 * When true (default), a card whose tradeoff text is present but does not map
	 * to any relevant axis is flagged. Disable to audit coverage without the
	 * tradeoff rule, e.g. for partial fixtures.
	 */
	requireTradeoffRelevance?: boolean;
}

/**
 * Derive the preference axes that are relevant for a run from the stated
 * preferences. Structured axes (budget/season/tripLength/logistics) become
 * relevant whenever the corresponding preference is set; theme axes only when
 * the themes/group profile mention them.
 */
export function derivePreferenceAxes(prefs: Partial<TravelPreferences>): PreferenceAxis[] {
	const axes = new Set<PreferenceAxis>();
	const themes = [...(prefs.travel_themes ?? []), ...(prefs.interests ?? [])].join(" ").toLowerCase();

	if (prefs.budget && (prefs.budget.amount != null || prefs.budget.category)) axes.add("budget");
	if (prefs.from_date || prefs.to_date) axes.add("season");
	if (prefs.num_nights && prefs.num_nights > 0) axes.add("tripLength");
	if (prefs.origin || prefs.max_daily_travel_time_hours != null || AXIS_PATTERNS.logistics.test(themes)) {
		axes.add("logistics");
	}

	for (const themeAxis of THEME_AXES.filter((axis) => axis !== "kids") as PreferenceAxis[]) {
		if (AXIS_PATTERNS[themeAxis].test(themes)) axes.add(themeAxis);
	}

	const groupBlob = `${prefs.group_type ?? ""} ${(prefs.ages_in_group ?? []).join(" ")}`.toLowerCase();
	const childAges = (prefs.ages_in_group ?? []).some((age) => {
		const n = Number(age);
		return Number.isFinite(n) && n > 0 && n < 13;
	});
	if (AXIS_PATTERNS.kids.test(groupBlob) || childAges) axes.add("kids");

	return PREFERENCE_AXES.filter((axis) => axes.has(axis));
}

/** Score a single destination card against the relevant preference axes. */
export function scoreCardPreferenceFit(
	card: SubDestination,
	relevantAxes: readonly PreferenceAxis[],
	options: ScoreShortlistOptions = {},
): CardPreferenceScore {
	const rel: PreferenceAxis[] =
		relevantAxes.length > 0 ? [...relevantAxes] : ([...PREFERENCE_AXES] as PreferenceAxis[]);
	const requireTradeoffRelevance = options.requireTradeoffRelevance ?? true;

	const axisEvidence: AxisEvidence[] = rel.map((axis) => detectAxisEvidence(card, axis));
	const addressedAxes = axisEvidence.filter((e) => e.addressed).map((e) => e.axis);
	const missingRelevantAxes = rel.filter((axis) => !addressedAxes.includes(axis));

	const tradeoffText = cardFieldText(card, "tradeoff");
	const tradeoffAxes = matchAxes(tradeoffText);
	const tradeoffRelevantAxes = tradeoffAxes.filter((axis) => rel.includes(axis));
	const tradeoffMapsToRelevant = tradeoffRelevantAxes.length > 0;
	const tradeoffSeverity = classifyTradeoffSeverity(tradeoffText);

	const fitsAtLeastOneRelevantAxis = addressedAxes.length > 0;
	const fitRatio = rel.length > 0 ? addressedAxes.length / rel.length : 0;
	const name = cardName(card);

	const issues: string[] = [];
	if (!fitsAtLeastOneRelevantAxis) {
		issues.push(`"${name}" addresses none of the relevant preference axes (${formatAxes(rel)}).`);
	}
	if (requireTradeoffRelevance && tradeoffText.length > 0 && !tradeoffMapsToRelevant) {
		issues.push(
			`"${name}" tradeoff does not map to any relevant preference axis (matched: ${formatAxes(tradeoffAxes) || "none"}).`,
		);
	}

	return {
		name,
		relevantAxes: rel,
		axisEvidence,
		addressedAxes,
		missingRelevantAxes,
		tradeoffText,
		tradeoffAxes,
		tradeoffRelevantAxes,
		tradeoffMapsToRelevant,
		tradeoffSeverity,
		fitsAtLeastOneRelevantAxis,
		fitRatio,
		issues,
	};
}

/** Score an entire shortlist and check menu-level preference coverage. */
export function scoreShortlistPreferenceFit(
	cards: SubDestination[],
	prefs: Partial<TravelPreferences>,
	options: ScoreShortlistOptions = {},
): ShortlistPreferenceFit {
	const requireTradeoffRelevance = options.requireTradeoffRelevance ?? true;
	const relevantAxes = derivePreferenceAxes(prefs);
	const themeAxes = THEME_AXES.filter((axis) => relevantAxes.includes(axis));
	const cardScores = cards.map((card) => scoreCardPreferenceFit(card, relevantAxes, { requireTradeoffRelevance }));

	const coverageByAxis = {} as Record<PreferenceAxis, number>;
	for (const axis of PREFERENCE_AXES) {
		coverageByAxis[axis] = cardScores.filter((score) => score.addressedAxes.includes(axis)).length;
	}
	const uncoveredThemeAxes = themeAxes.filter((axis) => coverageByAxis[axis] === 0);

	const issues: string[] = [];
	for (const axis of uncoveredThemeAxes) {
		issues.push(`No destination card addresses the "${AXIS_LABEL[axis]}" preference axis.`);
	}
	for (const score of cardScores) {
		issues.push(...score.issues);
	}

	return {
		relevantAxes,
		themeAxes,
		cardScores,
		coverageByAxis,
		uncoveredThemeAxes,
		issues,
		pass: issues.length === 0,
	};
}

/**
 * Render a shortlist preference-fit result as markdown bullet lines for an eval
 * report. Returns an empty array when there are no cards to score.
 */
export function formatShortlistPreferenceFit(fit: ShortlistPreferenceFit): string[] {
	const lines: string[] = [];
	if (fit.cardScores.length === 0) return lines;
	lines.push(`Relevant axes: ${formatAxes(fit.relevantAxes) || "none derived"}`);
	const coverage = PREFERENCE_AXES.filter((axis) => fit.relevantAxes.includes(axis))
		.map((axis) => `${AXIS_LABEL[axis]}=${fit.coverageByAxis[axis]}`)
		.join(", ");
	lines.push(`Menu coverage (cards/axis): ${coverage || "n/a"}`);
	if (fit.uncoveredThemeAxes.length > 0) {
		lines.push(`Uncovered theme axes: ${formatAxes(fit.uncoveredThemeAxes)}`);
	}
	const sevCounts = countSeverities(fit.cardScores);
	lines.push(`Tradeoff severity: high=${sevCounts.high}, medium=${sevCounts.medium}, low=${sevCounts.low}`);
	for (const score of fit.cardScores) {
		const tags = score.addressedAxes.length ? formatAxes(score.addressedAxes) : "none";
		const tradeoff =
			score.tradeoffText.length > 0
				? score.tradeoffMapsToRelevant
					? `tradeoff→${formatAxes(score.tradeoffRelevantAxes)} (${score.tradeoffSeverity})`
					: `tradeoff→(no relevant axis, ${score.tradeoffSeverity})`
				: "tradeoff→(missing)";
		lines.push(
			`- ${score.name}: fit ${(score.fitRatio * 100).toFixed(0)}% [${tags}] [${tradeoff}]${score.issues.length ? ` — ${score.issues.length} issue(s)` : ""}`,
		);
	}
	return lines;
}

// -----------------------------------------------------------------------------

function detectAxisEvidence(card: SubDestination, axis: PreferenceAxis): AxisEvidence {
	if (isThemeAxis(axis)) {
		const blob = themeScanText(card);
		const match = blob.match(AXIS_PATTERNS[axis]);
		return {
			axis,
			addressed: Boolean(match),
			snippet: match ? truncate(match[0]) : undefined,
		};
	}
	if (isStructuredAxis(axis)) {
		const field = STRUCTURED_FIELD[axis];
		const value = cardFieldText(card, field);
		return {
			axis,
			addressed: structuredFieldMeaningful(axis, value),
			field,
		};
	}
	// Unreachable: every canonical axis is either a theme or structured axis.
	return { axis, addressed: false };
}

/**
 * Whether a structured field meaningfully addresses its axis. For logistics/
 * budget/season this matches the save-time rule (>= 6 chars). For tripLength the
 * schema only guarantees `roughDays` contains a digit (e.g. "2-3"), so a digit
 * is sufficient and short ranges are not penalized.
 */
function structuredFieldMeaningful(axis: StructuredAxis, value: string): boolean {
	const trimmed = value.trim();
	if (axis === "tripLength") return trimmed.length > 0 && /\d/.test(trimmed);
	return trimmed.length >= MIN_STRUCTURED_FIELD_LENGTH;
}

function isThemeAxis(axis: PreferenceAxis): axis is ThemeAxis {
	return (THEME_AXES as readonly string[]).includes(axis);
}

function isStructuredAxis(axis: PreferenceAxis): axis is StructuredAxis {
	return (STRUCTURED_AXES as readonly string[]).includes(axis);
}

/** Text from the descriptive fields used to detect theme/group axes. */
function themeScanText(card: SubDestination): string {
	return [
		cardFieldText(card, "name"),
		cardFieldText(card, "description"),
		cardFieldText(card, "bestFor"),
		cardFieldText(card, "why"),
		cardFieldText(card, "themes"),
		cardFieldText(card, "suitableForGroups"),
		cardFieldText(card, "imageQuery"),
	]
		.join(" ")
		.toLowerCase();
}

/** Return all axes whose pattern matches the given text. */
function matchAxes(text: string): PreferenceAxis[] {
	const lower = text.toLowerCase();
	return PREFERENCE_AXES.filter((axis) => AXIS_PATTERNS[axis].test(lower));
}

/** Count cards at each tradeoff severity for the report summary. */
function countSeverities(scores: CardPreferenceScore[]): Record<TradeoffSeverity, number> {
	const counts: Record<TradeoffSeverity, number> = { low: 0, medium: 0, high: 0 };
	for (const score of scores) counts[score.tradeoffSeverity] += 1;
	return counts;
}

function cardFieldText(card: SubDestination, field: keyof SubDestination): string {
	const value = card[field];
	if (Array.isArray(value)) return value.join(" ");
	return typeof value === "string" ? value : "";
}

function cardName(card: SubDestination): string {
	const name = cardFieldText(card, "name").trim();
	return name.length > 0 ? name : "unnamed card";
}

function formatAxes(axes: readonly PreferenceAxis[]): string {
	return axes.map((axis) => AXIS_LABEL[axis]).join(", ");
}

function truncate(value: string): string {
	const trimmed = value.trim();
	return trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed;
}
