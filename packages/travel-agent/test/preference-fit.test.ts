import { describe, expect, it } from "vitest";
import {
	AXIS_LABEL,
	classifyTradeoffSeverity,
	derivePreferenceAxes,
	formatShortlistPreferenceFit,
	PREFERENCE_AXES,
	type PreferenceAxis,
	type ShortlistPreferenceFit,
	scoreCardPreferenceFit,
	scoreShortlistPreferenceFit,
} from "../src/core/preference-fit.js";
import type { SubDestination, TravelPreferences } from "../src/core/types.js";

const FAMILY_GREECE_PREFS: TravelPreferences = {
	destination: "Greece",
	origin: "Berlin",
	from_date: "2026-06-20",
	to_date: "2026-06-30",
	num_nights: 10,
	group_size: 4,
	group_type: "family with kids",
	budget: { amount: 6500, currency: "EUR", category: "mid-range" },
	travel_themes: ["beaches", "culture", "food", "easy logistics"],
};

const COUPLE_SURPRISE_PREFS: TravelPreferences = {
	destination: "surprise me",
	origin: "Berlin",
	from_date: "2026-09-01",
	to_date: "2026-09-08",
	num_nights: 7,
	group_size: 2,
	group_type: "couple",
	budget: { amount: 3500, currency: "EUR", category: "mid-range" },
	travel_themes: ["food", "beaches", "culture", "easy logistics"],
};

function makeCard(overrides: Partial<SubDestination> = {}): SubDestination {
	return {
		name: "Naxos",
		type: "place",
		description: "Sandy beaches with shallow water, seaside tavernas, and a handsome old town.",
		bestFor: "best for beaches and families",
		why: "Shallow beaches suit the kids and the food scene matches the couple's tastes.",
		roughDays: "3 days",
		logisticsFit: "Easy direct ferry from Athens, short transfer to the hotel.",
		budgetFit: "Mid-range friendly; cheaper than Santorini, verify live nightly rates.",
		seasonNote: "Late June is warm, beach-friendly, and less crowded than peak August.",
		tradeoff: "Adds ferry time, so pair it with nearby islands to avoid backtracking.",
		imageQuery: "destination travel highlights",
		imageLinks: ["https://example.com/images/destination.jpg"],
		selected: false,
		reviews: {},
		sources: ["https://example.com/naxos"],
		...overrides,
	};
}

describe("derivePreferenceAxes", () => {
	it("derives structured axes from a fully-specified family trip", () => {
		const axes = derivePreferenceAxes(FAMILY_GREECE_PREFS);
		expect(axes).toEqual(
			expect.arrayContaining(["beaches", "culture", "food", "logistics", "kids", "budget", "season", "tripLength"]),
		);
		expect(axes).toHaveLength(8);
	});

	it("flags the kids axis from group_type and child ages, not just keywords", () => {
		const axes = derivePreferenceAxes({
			...COUPLE_SURPRISE_PREFS,
			group_type: "family",
			ages_in_group: [40, 38, 8, 4],
		});
		expect(axes).toContain("kids");
	});

	it("does not flag kids for an adult couple with no child ages", () => {
		const axes = derivePreferenceAxes(COUPLE_SURPRISE_PREFS);
		expect(axes).not.toContain("kids");
	});

	it("returns no theme axes when themes/interests are absent", () => {
		const axes = derivePreferenceAxes({
			origin: "Berlin",
			from_date: "2026-09-01",
			to_date: "2026-09-08",
			num_nights: 7,
			budget: { amount: 3500, currency: "EUR", category: "mid-range" },
		});
		const themeSubset = axes.filter((a) => ["beaches", "culture", "food", "kids"].includes(a));
		expect(themeSubset).toEqual([]);
		expect(axes).toEqual(expect.arrayContaining(["budget", "season", "tripLength", "logistics"]));
	});
});

describe("scoreCardPreferenceFit", () => {
	const relevant = derivePreferenceAxes(FAMILY_GREECE_PREFS);

	it("addresses beaches, culture, food, kids, and all structured axes for a strong card", () => {
		const score = scoreCardPreferenceFit(makeCard(), relevant);
		expect(score.fitsAtLeastOneRelevantAxis).toBe(true);
		expect(score.fitRatio).toBeGreaterThan(0.6);
		expect(score.addressedAxes).toEqual(
			expect.arrayContaining(["beaches", "food", "kids", "logistics", "budget", "season", "tripLength"]),
		);
		expect(score.tradeoffMapsToRelevant).toBe(true);
		expect(score.issues).toEqual([]);
	});

	it("maps a logistics tradeoff to a relevant axis", () => {
		const score = scoreCardPreferenceFit(makeCard({ tradeoff: "Requires a long ferry ride from Athens." }), relevant);
		expect(score.tradeoffAxes).toContain("logistics");
		expect(score.tradeoffRelevantAxes).toContain("logistics");
		expect(score.tradeoffMapsToRelevant).toBe(true);
	});

	it("maps a budget+season tradeoff to multiple relevant axes", () => {
		const score = scoreCardPreferenceFit(
			makeCard({ tradeoff: "Pricier and more crowded in peak August." }),
			relevant,
		);
		expect(score.tradeoffAxes).toEqual(expect.arrayContaining(["budget", "season"]));
		expect(score.tradeoffRelevantAxes).toEqual(expect.arrayContaining(["budget", "season"]));
		expect(score.tradeoffMapsToRelevant).toBe(true);
	});

	it("flags a tradeoff that does not map to any relevant axis", () => {
		const score = scoreCardPreferenceFit(makeCard({ tradeoff: "Limited nightlife after midnight." }), relevant);
		expect(score.tradeoffMapsToRelevant).toBe(false);
		expect(score.issues.some((m) => /tradeoff does not map/.test(m))).toBe(true);
	});

	it("does not flag a non-mapping tradeoff when the rule is disabled", () => {
		const score = scoreCardPreferenceFit(makeCard({ tradeoff: "Limited nightlife after midnight." }), relevant, {
			requireTradeoffRelevance: false,
		});
		expect(score.tradeoffMapsToRelevant).toBe(false);
		expect(score.issues.some((m) => /tradeoff/.test(m))).toBe(false);
	});

	it("flags a card that addresses no relevant axis", () => {
		const orphan = makeCard({
			name: "Generic Spot",
			description: "A place to stay with rooms and a view.",
			bestFor: "best for something",
			why: "It exists and has rooms.",
			roughDays: "0",
			logisticsFit: "",
			budgetFit: "",
			seasonNote: "",
			tradeoff: "Some tradeoff applies here.",
		});
		const score = scoreCardPreferenceFit(orphan, [
			"beaches",
			"culture",
			"food",
			"kids",
			"logistics",
			"budget",
			"season",
		]);
		expect(score.fitsAtLeastOneRelevantAxis).toBe(false);
		expect(score.issues.some((m) => /addresses none of the relevant/.test(m))).toBe(true);
	});

	it("falls back to all axes when relevantAxes is empty", () => {
		const score = scoreCardPreferenceFit(makeCard(), []);
		expect(score.relevantAxes).toEqual([...PREFERENCE_AXES]);
		expect(score.fitsAtLeastOneRelevantAxis).toBe(true);
	});

	it("addresses the tripLength axis from a short roughDays range like '2-3'", () => {
		const score = scoreCardPreferenceFit(makeCard({ roughDays: "2-3" }), derivePreferenceAxes(FAMILY_GREECE_PREFS));
		expect(score.addressedAxes).toContain("tripLength");
		expect(score.axisEvidence.find((e) => e.axis === "tripLength")?.addressed).toBe(true);
	});

	it("does not address tripLength when roughDays has no digit", () => {
		const score = scoreCardPreferenceFit(makeCard({ roughDays: "a few" }), ["tripLength"]);
		expect(score.addressedAxes).not.toContain("tripLength");
	});

	it("classifies a high-magnitude tradeoff as high severity", () => {
		const score = scoreCardPreferenceFit(
			makeCard({ tradeoff: "Adds a long ferry ride, which raises travel time significantly." }),
			relevant,
		);
		expect(score.tradeoffSeverity).toBe("high");
	});

	it("classifies a softened tradeoff as low severity", () => {
		const score = scoreCardPreferenceFit(
			makeCard({ tradeoff: "Minor detour from the main route, easily managed." }),
			relevant,
		);
		expect(score.tradeoffSeverity).toBe("low");
	});

	it("classifies a neutral tradeoff as medium severity", () => {
		const score = scoreCardPreferenceFit(makeCard({ tradeoff: "Adds a short ferry hop to the route." }), relevant);
		expect(score.tradeoffSeverity).toBe("medium");
	});
});

describe("classifyTradeoffSeverity", () => {
	it("classifies strong negative language as high", () => {
		expect(classifyTradeoffSeverity("Long ferry ride from Athens adds significant travel time.")).toBe("high");
		expect(classifyTradeoffSeverity("Very expensive and overcrowded in peak August.")).toBe("high");
		expect(classifyTradeoffSeverity("Difficult to reach, with a steep climb to the site.")).toBe("high");
	});

	it("classifies softening language as low", () => {
		expect(classifyTradeoffSeverity("Minor inconvenience, easily managed.")).toBe("low");
		expect(classifyTradeoffSeverity("A slight detour, but worth it.")).toBe("low");
		expect(classifyTradeoffSeverity("Manageable with a quick stop along the way.")).toBe("low");
	});

	it("defaults neutral tradeoffs to medium", () => {
		expect(classifyTradeoffSeverity("Adds a short ferry hop to the route.")).toBe("medium");
		expect(classifyTradeoffSeverity("Pricier than the nearby islands.")).toBe("medium");
	});

	it("returns medium when high and low signals conflict (downside mitigated)", () => {
		expect(classifyTradeoffSeverity("Long drive but manageable with a short break.")).toBe("medium");
		expect(classifyTradeoffSeverity("Significant detour, though worth it in the end.")).toBe("medium");
	});

	it("returns medium for empty or whitespace-only tradeoff text", () => {
		expect(classifyTradeoffSeverity("")).toBe("medium");
		expect(classifyTradeoffSeverity("   ")).toBe("medium");
	});

	it("is case-insensitive", () => {
		expect(classifyTradeoffSeverity("VERY EXPENSIVE")).toBe("high");
		expect(classifyTradeoffSeverity("MINOR ISSUE")).toBe("low");
	});
});

describe("scoreShortlistPreferenceFit", () => {
	it("passes a balanced Greece family shortlist that covers every theme axis", () => {
		const cards: SubDestination[] = [
			makeCard({ name: "Naxos", bestFor: "best for beaches and families" }),
			makeCard({
				name: "Athens",
				description: "Historic ruins, museums, and the Acropolis for culture lovers.",
				bestFor: "best for culture and history",
				why: "The Acropolis and museums match the culture preference.",
				tradeoff: "Busy and hot in summer, so keep the city stay short.",
			}),
			makeCard({
				name: "Crete",
				description: "Beaches, mountain villages, and an outstanding food scene.",
				bestFor: "best for food and variety",
				why: "Diverse food and beaches fit the family.",
				tradeoff: "Large island means long drives between highlights.",
			}),
		];
		const fit = scoreShortlistPreferenceFit(cards, FAMILY_GREECE_PREFS);
		expect(fit.pass).toBe(true);
		expect(fit.uncoveredThemeAxes).toEqual([]);
		expect(fit.coverageByAxis.beaches).toBeGreaterThanOrEqual(1);
		expect(fit.coverageByAxis.culture).toBeGreaterThanOrEqual(1);
		expect(fit.coverageByAxis.food).toBeGreaterThanOrEqual(1);
		expect(fit.coverageByAxis.kids).toBeGreaterThanOrEqual(1);
		expect(fit.issues).toEqual([]);
	});

	it("fails when no card covers a relevant theme axis", () => {
		const cards: SubDestination[] = [
			makeCard({
				name: "Athens",
				description: "Historic ruins, museums, and ancient sites for culture.",
				bestFor: "best for culture",
				why: "Matches the culture preference.",
				themes: ["culture"],
				tradeoff: "Busy and hot in peak summer season.",
			}),
		];
		const fit = scoreShortlistPreferenceFit(cards, FAMILY_GREECE_PREFS);
		expect(fit.pass).toBe(false);
		expect(fit.uncoveredThemeAxes).toEqual(expect.arrayContaining(["beaches", "food", "kids"]));
		expect(fit.issues.some((m) => /No destination card addresses the "beaches"/.test(m))).toBe(true);
	});

	it("fails when any card has a non-mapping tradeoff", () => {
		const cards: SubDestination[] = [
			makeCard({ name: "Naxos", bestFor: "best for beaches and families" }),
			makeCard({
				name: "Athens",
				description: "Historic ruins and museums for culture.",
				bestFor: "best for culture",
				why: "Culture match.",
				tradeoff: "Limited nightlife after midnight.",
			}),
			makeCard({
				name: "Crete",
				description: "Beaches and an outstanding food scene.",
				bestFor: "best for food",
				why: "Food match.",
				tradeoff: "Long drives between beaches and restaurants.",
			}),
		];
		const fit = scoreShortlistPreferenceFit(cards, FAMILY_GREECE_PREFS);
		expect(fit.pass).toBe(false);
		expect(fit.issues.some((m) => /Athens.*tradeoff does not map/.test(m))).toBe(true);
	});

	it("scores a broad surprise-me country menu against the couple preferences", () => {
		const cards: SubDestination[] = [
			makeCard({
				name: "Portugal",
				description: "Coastline, seafood cuisine, and historic Lisbon neighborhoods.",
				bestFor: "best for food and beaches",
				why: "Seafood and coast fit the food and beach themes.",
				roughDays: "7 days",
				logisticsFit: "Direct flights from Berlin keep transfers simple.",
				budgetFit: "Affordable mid-range options across the coast.",
				seasonNote: "September is warm and less crowded than August.",
				tradeoff: "Coast is spread out, so pick one or two bases.",
			}),
			makeCard({
				name: "Sicily",
				description: "Ancient ruins, street food markets, and beaches.",
				bestFor: "best for culture and food",
				why: "Ruins and street food match culture and food.",
				roughDays: "7 days",
				logisticsFit: "One-stop flights from Berlin add a transfer.",
				budgetFit: "Good value, though car rental adds cost.",
				seasonNote: "September sea is warm; summer crowds ease off.",
				tradeoff: "Island driving distances are long between sites.",
			}),
		];
		const fit = scoreShortlistPreferenceFit(cards, COUPLE_SURPRISE_PREFS);
		expect(fit.pass).toBe(true);
		expect(fit.themeAxes).toEqual(expect.arrayContaining(["beaches", "culture", "food"]));
	});

	it("reports no coverage numbers and empty lines for an empty shortlist", () => {
		const fit = scoreShortlistPreferenceFit([], FAMILY_GREECE_PREFS);
		expect(fit.cardScores).toEqual([]);
		expect(formatShortlistPreferenceFit(fit)).toEqual([]);
	});

	it("formatter emits per-card fit, coverage, and tradeoff lines", () => {
		const cards: SubDestination[] = [
			makeCard({ name: "Naxos", bestFor: "best for beaches and families" }),
			makeCard({
				name: "Athens",
				description: "Historic ruins and museums for culture.",
				bestFor: "best for culture",
				why: "Culture match.",
				tradeoff: "Busy and hot in peak summer season.",
			}),
		];
		const fit = scoreShortlistPreferenceFit(cards, FAMILY_GREECE_PREFS);
		const lines = formatShortlistPreferenceFit(fit);
		expect(lines.some((l) => l.startsWith("Relevant axes:"))).toBe(true);
		expect(lines.some((l) => l.startsWith("Menu coverage"))).toBe(true);
		expect(lines.some((l) => l.startsWith("Tradeoff severity:"))).toBe(true);
		expect(lines.some((l) => /Naxos: fit/.test(l))).toBe(true);
		expect(lines.some((l) => /tradeoff→/.test(l))).toBe(true);
	});

	it("AXIS_LABEL covers every canonical axis", () => {
		for (const axis of PREFERENCE_AXES) {
			expect(typeof AXIS_LABEL[axis as PreferenceAxis]).toBe("string");
			expect(AXIS_LABEL[axis as PreferenceAxis].length).toBeGreaterThan(0);
		}
	});
});

describe("scoreShortlistPreferenceFit type snapshot", () => {
	it("returns a serializable result suitable for an eval report", () => {
		const fit: ShortlistPreferenceFit = scoreShortlistPreferenceFit([makeCard()], FAMILY_GREECE_PREFS);
		const json = JSON.parse(JSON.stringify(fit));
		expect(typeof json.pass).toBe("boolean");
		expect(Array.isArray(json.issues)).toBe(true);
		expect(typeof json.coverageByAxis.beaches).toBe("number");
		expect(json.cardScores[0]).toHaveProperty("fitRatio");
	});
});
