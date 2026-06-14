import { describe, expect, it } from "vitest";
import { deriveItineraryQualityAxes, scoreItineraryResearchQuality } from "../src/core/itinerary-fit.js";
import type { Activity, ItineraryResearch, TravelPreferences } from "../src/core/types.js";

const prefs: TravelPreferences = {
	destination: "Japan",
	origin: "San Francisco",
	from_date: "2026-04-05",
	to_date: "2026-04-14",
	num_nights: 9,
	group_size: 2,
	group_type: "couple",
	budget: { amount: 6000, currency: "USD", category: "mid-range" },
	travel_themes: ["food", "culture", "history"],
	pace_of_travel: "moderate",
};

const selected = [{ name: "Tokyo" }, { name: "Kyoto" }];
const approvedActivities: Activity[] = [
	makeActivity("Tsukiji Food Walk", "Tokyo"),
	makeActivity("Senso-ji Heritage Visit", "Tokyo"),
	makeActivity("Gion Evening Walk", "Kyoto"),
	makeActivity("Nishiki Market Food Tour", "Kyoto"),
];

describe("itinerary-fit", () => {
	it("derives itinerary quality axes from preferences", () => {
		expect(deriveItineraryQualityAxes(prefs)).toEqual([
			"dates",
			"selectedPlaces",
			"approvedActivities",
			"dailyLoad",
			"logistics",
			"budget",
			"season",
			"tripLength",
			"food",
			"culture",
		]);
	});

	it("passes a realistic day-by-day itinerary using selected places and approved activities", () => {
		const quality = scoreItineraryResearchQuality(makeGoodItinerary(), prefs, selected, approvedActivities);

		expect(quality.pass).toBe(true);
		expect(quality.issues).toEqual([]);
		expect(quality.coverageByAxis.selectedPlaces).toBeGreaterThanOrEqual(2);
		expect(quality.approvedActivityMatches).toHaveLength(4);
	});

	it("normalizes common persisted itinerary shapes from live tool calls", () => {
		const nested = { itinerary: { days: makeGoodItinerary().itinerary } } as any;
		const topLevelDays = { days: makeGoodItinerary().itinerary } as any;

		expect(scoreItineraryResearchQuality(nested, prefs, selected, approvedActivities).pass).toBe(true);
		expect(scoreItineraryResearchQuality(topLevelDays, prefs, selected, approvedActivities).pass).toBe(true);
	});

	it("fails itineraries that ignore selected places and overload days", () => {
		const bad: ItineraryResearch = {
			description: "Bad itinerary",
			itinerary: [
				{
					date: "2026-04-05",
					dayNumber: 1,
					place: "Osaka",
					activities: [
						makeItineraryActivity("Castle", "Osaka", 3),
						makeItineraryActivity("Aquarium", "Osaka", 3),
						makeItineraryActivity("Market", "Osaka", 3),
						makeItineraryActivity("Nightlife", "Osaka", 3),
					],
				},
			],
		};

		const quality = scoreItineraryResearchQuality(bad, prefs, selected, approvedActivities);

		expect(quality.pass).toBe(false);
		expect(quality.issues.join("\n")).toContain("No itinerary day clearly covers selected place Tokyo");
		expect(quality.issues.join("\n")).toContain("Day 1 is overloaded");
	});
});

function makeGoodItinerary(): ItineraryResearch {
	return {
		description:
			"9-night Japan route with Tokyo then Kyoto, balancing culture, food, budget, April crowds, and train logistics.",
		itinerary: [
			{
				date: "2026-04-05",
				dayNumber: 1,
				place: "Tokyo",
				activities: [
					makeItineraryActivity(
						"Arrive in Tokyo and settle near Shinjuku",
						"Tokyo",
						2,
						"Keep arrival day light after the long flight from San Francisco; use an IC card and avoid expensive taxis.",
					),
				],
			},
			{
				date: "2026-04-06",
				dayNumber: 2,
				place: "Tokyo",
				activities: [
					makeItineraryActivity(
						"Tsukiji Food Walk",
						"Tokyo",
						3,
						"Go before 8 AM because April crowds build fast; cap tastings to stay within the mid-range budget.",
					),
					makeItineraryActivity(
						"Senso-ji Heritage Visit",
						"Tokyo",
						2,
						"Pair nearby Asakusa sights to reduce transit time and avoid a rushed culture day.",
					),
				],
			},
			{
				date: "2026-04-07",
				dayNumber: 3,
				place: "Tokyo to Kyoto",
				activities: [
					makeItineraryActivity(
						"Shinkansen transfer Tokyo to Kyoto",
						"Tokyo to Kyoto",
						3,
						"Reserve seats in April peak season; this protects the 9-night route from a logistics squeeze.",
					),
				],
			},
			{
				date: "2026-04-08",
				dayNumber: 4,
				place: "Kyoto",
				activities: [
					makeItineraryActivity(
						"Gion Evening Walk",
						"Kyoto",
						3,
						"Evening pacing avoids temple fatigue and keeps culture time realistic after daytime crowds.",
					),
					makeItineraryActivity(
						"Nishiki Market Food Tour",
						"Kyoto",
						2,
						"Visit before lunch because many stalls close early; sample lightly to stay on budget.",
					),
				],
			},
		],
	};
}

function makeActivity(name: string, location: string): Activity {
	return {
		name,
		type: "food culture",
		description: `${name} in ${location}`,
		location,
		estimatedDurationHours: 2,
		reviews: {},
		sources: [],
	};
}

function makeItineraryActivity(
	name: string,
	location: string,
	hours: number,
	tips = "Plan transit and budget carefully for April crowds.",
) {
	return {
		name,
		type: "planned_activity",
		description: `${name} in ${location}. ${tips}`,
		location,
		estimatedDurationHours: hours,
		estimatedCost: 40,
		timeSlot: "Morning",
		tips,
		sources: ["https://example.com/itinerary"],
	};
}
