import { expect, test } from "vitest";
import type { TravelState, TravelUiBlock } from "../src/api.js";
import { buildPlanText } from "../src/plan-export.js";

test("exports every canonical itinerary activity and structured budget", () => {
	const state = { preferences: { destination: "Japan" } } as unknown as TravelState;
	const blocks: TravelUiBlock[] = [
		{
			id: "itinerary",
			kind: "itinerary_timeline",
			version: 1,
			title: "Itinerary",
			actions: [],
			sourceStatePath: "itineraryResearch",
			data: {
				days: [
					{
						dayNumber: 1,
						date: "2026-11-10",
						place: "Kyoto",
						activityCount: 5,
						activities: ["Arrival", "Temple", "Lunch", "Garden", "Dinner"],
					},
				],
			},
		},
		{
			id: "budget",
			kind: "budget_summary",
			version: 1,
			title: "Budget",
			actions: [],
			sourceStatePath: "preferences.budget",
			data: { budget: { amount: 2000, currency: "USD" } },
		},
	];
	const text = buildPlanText(state, blocks);
	expect(text).toContain("Day 1: Kyoto");
	expect(text).toContain("- Dinner");
	expect(text).toContain("amount: 2000 · currency: USD");
	expect(text).not.toContain("[object Object]");
});
