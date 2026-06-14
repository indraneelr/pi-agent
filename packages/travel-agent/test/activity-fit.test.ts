import { describe, expect, it } from "vitest";
import {
	deriveActivityQualityAxes,
	matchSelectedDestination,
	scoreActivityQuality,
	scoreActivityResearchQuality,
} from "../src/core/activity-fit.js";
import type { Activity, SubDestination, TravelPreferences } from "../src/core/types.js";

const prefs: Partial<TravelPreferences> = {
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

const selected: Pick<SubDestination, "name">[] = [{ name: "Athens" }, { name: "Naxos" }];

describe("activity-fit", () => {
	it("derives activity-quality axes from preferences", () => {
		expect(deriveActivityQualityAxes(prefs)).toEqual([
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
		]);
	});

	it("matches activities to selected destination aliases", () => {
		expect(matchSelectedDestination(makeActivity({ location: "Naxos Town" }), selected)).toBe("Naxos");
		expect(matchSelectedDestination(makeActivity({ location: "Plaka Beach, Naxos" }), selected)).toBe("Naxos");
		expect(
			matchSelectedDestination(
				makeActivity({
					name: "Chania old town walk",
					location: "Crete",
					description: "A family-friendly activity in Chania old town.",
				}),
				selected,
			),
		).toBeUndefined();
	});

	it("scores a strong selected-place activity with contextual caveat", () => {
		const score = scoreActivityQuality(makeActivity(), prefs, selected);

		expect(score.matchedDestination).toBe("Naxos");
		expect(score.fitRatio).toBeGreaterThanOrEqual(0.8);
		expect(score.tradeoffRelevantAxes).toEqual(expect.arrayContaining(["season"]));
		expect(score.issues).toEqual([]);
	});

	it("flags an activity that does not match selected destinations", () => {
		const score = scoreActivityQuality(
			makeActivity({
				name: "Santorini beach and culture walk",
				location: "Santorini",
				description: "A beach and culture walk in Santorini with local food stops.",
			}),
			prefs,
			selected,
		);

		expect(score.issues.join("\n")).toMatch(/does not clearly match any selected destination/);
	});

	it("flags missing contextual tradeoff/caveat", () => {
		const score = scoreActivityQuality(makeActivity({ tips: "" }), prefs, selected);

		expect(score.issues.join("\n")).toMatch(/missing a practical tradeoff/);
	});

	it("flags a caveat that does not map to relevant preferences", () => {
		const score = scoreActivityQuality(
			makeActivity({ tips: "Bring a blue hat because photos look nicer." }),
			prefs,
			selected,
		);

		expect(score.issues.join("\n")).toMatch(/does not map to a relevant preference axis/);
	});

	it("handles object suitableForGroups without crashing", () => {
		const activity = makeActivity({
			suitableForGroups: { families: true, kids: true } as unknown as string[],
		});

		const score = scoreActivityQuality(activity, prefs, selected);

		expect(score.matchedDestination).toBe("Naxos");
		expect(score.fitRatio).toBeGreaterThanOrEqual(0.8);
		expect(score.issues).toEqual([]);
	});

	it("reads tips from array without crashing", () => {
		const activity = makeActivity({
			tips: [
				"Start in the morning in June heat",
				"Beach crowds and short bus logistics are the main tradeoff for kids",
			] as unknown as string,
		});

		const score = scoreActivityQuality(activity, prefs, selected);

		expect(score.addressedAxes).toContain("practicalTips");
		expect(score.tradeoffText.length).toBeGreaterThan(8);
		expect(score.tradeoffRelevantAxes.length).toBeGreaterThan(0);
	});

	it("reads budget info from estimatedCost object without crashing", () => {
		const activity = makeActivity({
			estimatedCost: { amount: 45, currency: "EUR", note: "entry fee per person" } as unknown as number,
		});

		const score = scoreActivityQuality(activity, prefs, selected);

		expect(score.addressedAxes).toContain("budget");
	});

	it("aggregates activity research quality and axis coverage", () => {
		const result = scoreActivityResearchQuality(
			[
				makeActivity({ name: "Naxos Beach Morning", location: "Naxos" }),
				makeActivity({
					name: "Athens Food Walk",
					location: "Athens",
					description:
						"A family-friendly cultural food walk through Athens markets and ancient neighborhoods with easy metro access.",
					type: "food tour",
					tips: "Go early in June heat; market crowds and walking time are the main season and logistics tradeoff for kids.",
				}),
			],
			prefs,
			selected,
		);

		expect(result.pass).toBe(true);
		expect(result.coverageByAxis.destination).toBe(2);
		expect(result.coverageByAxis.food).toBeGreaterThanOrEqual(1);
	});
});

function makeActivity(overrides: Partial<Activity> = {}): Activity {
	return {
		name: "Naxos shallow beach and old town food walk",
		type: "beach culture food experience",
		description:
			"A family-friendly Naxos activity combining shallow beach swimming, a short old-town cultural walk, and easy taverna food stops.",
		location: "Naxos",
		estimatedDurationHours: 4,
		estimatedCost: 45,
		reviews: { rating: 4.6, reviewSummary: "Popular with families." },
		suitableForGroups: ["families with kids"],
		themes: ["beaches", "culture", "food", "easy logistics"],
		tips: "Start in the morning in June heat; beach crowds and short bus/taxi logistics are the main tradeoff for kids.",
		bestTimeToVisit: "Morning in late June for cooler weather and lighter crowds.",
		sources: ["https://example.com/naxos"],
		...overrides,
	};
}
