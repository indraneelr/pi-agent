import { describe, expect, it } from "vitest";
import type { ChecklistPhaseConfig } from "../src/core/checklist.js";
import { advanceChecklist } from "../src/core/checklist.js";
import { createTravelState, formatStateForPrompt, invalidateDownstream } from "../src/core/state.js";
import type { DestinationResearch } from "../src/core/types.js";

const SAMPLE_CONFIG: ChecklistPhaseConfig[] = [
	{ id: "gather_preferences", label: "Gather Preferences", description: "Collect requirements" },
	{ id: "shortlist_destinations", label: "Shortlist", description: "Research destinations" },
	{ id: "select_destinations", label: "Select", description: "User picks" },
	{ id: "research_experiences", label: "Experiences", description: "Find activities" },
	{ id: "plan_itinerary", label: "Itinerary", description: "Build plan" },
	{ id: "research_accommodation_flights", label: "Accommodation & Flights", description: "Hotels and flights" },
	{ id: "final_plan", label: "Final", description: "Complete plan" },
];

describe("TravelState", () => {
	describe("createTravelState", () => {
		it("should create a fresh state with given session id", () => {
			const state = createTravelState("session-123", SAMPLE_CONFIG);
			expect(state.sessionId).toBe("session-123");
			expect(state.checklist.phases).toHaveLength(7);
			expect(state.preferences).toEqual({});
			expect(state.destinationResearch).toBeNull();
			expect(state.selectedDestinations).toEqual([]);
			expect(state.activitiesResearch).toBeNull();
			expect(state.itineraryResearch).toBeNull();
			expect(state.accommodationResearch).toBeNull();
			expect(state.flightResearch).toBeNull();
		});
	});

	describe("invalidateDownstream", () => {
		it("should clear preferences when invalidating from gather_preferences", () => {
			const state = createTravelState("s1", SAMPLE_CONFIG);
			state.preferences = { destination: "Tokyo", origin: "NYC" };

			const cleared = invalidateDownstream(state, "gather_preferences");
			expect(cleared.preferences).toEqual({});
		});

		it("should clear destination research and downstream when invalidating from shortlist", () => {
			const state = createTravelState("s1", SAMPLE_CONFIG);
			state.preferences = { destination: "Tokyo" };
			state.destinationResearch = makeMinimalDestinationResearch();
			state.selectedDestinations = [{ name: "Shibuya", type: "area", description: "", reviews: {}, sources: [] }];
			state.activitiesResearch = { activities: [] };

			const cleared = invalidateDownstream(state, "shortlist_destinations");
			expect(cleared.preferences).toEqual({ destination: "Tokyo" }); // preserved
			expect(cleared.destinationResearch).toBeNull();
			expect(cleared.selectedDestinations).toEqual([]);
			expect(cleared.activitiesResearch).toBeNull();
		});

		it("should only clear from target phase onward", () => {
			const state = createTravelState("s1", SAMPLE_CONFIG);
			state.preferences = { destination: "Tokyo" };
			state.destinationResearch = makeMinimalDestinationResearch();
			state.selectedDestinations = [{ name: "Shibuya", type: "area", description: "", reviews: {}, sources: [] }];
			state.activitiesResearch = {
				activities: [
					{
						name: "Temple",
						type: "landmark",
						description: "x",
						location: "Shibuya",
						estimatedDurationHours: 2,
						reviews: {},
						sources: [],
					},
				],
			};
			state.itineraryResearch = { itinerary: [] };

			const cleared = invalidateDownstream(state, "research_experiences");
			// preferences, destinations, selectedDestinations should be preserved
			expect(cleared.preferences.destination).toBe("Tokyo");
			expect(cleared.destinationResearch).not.toBeNull();
			expect(cleared.selectedDestinations).toHaveLength(1);
			// activitiesResearch and downstream should be cleared
			expect(cleared.activitiesResearch).toBeNull();
			expect(cleared.itineraryResearch).toBeNull();
		});

		it("should handle unknown phase id gracefully", () => {
			const state = createTravelState("s1", SAMPLE_CONFIG);
			state.preferences = { destination: "Tokyo" };

			const result = invalidateDownstream(state, "nonexistent");
			expect(result.preferences.destination).toBe("Tokyo");
		});
	});

	describe("formatStateForPrompt", () => {
		it("should include checklist progress", () => {
			const state = createTravelState("s1", SAMPLE_CONFIG);
			const formatted = formatStateForPrompt(state);
			expect(formatted).toContain("[>] 1. Gather Preferences");
			expect(formatted).toContain("[ ] 2. Shortlist");
		});

		it("should include preferences when set", () => {
			const state = createTravelState("s1", SAMPLE_CONFIG);
			state.preferences = { destination: "Tokyo", origin: "NYC", num_nights: 7 };

			const formatted = formatStateForPrompt(state);
			expect(formatted).toContain("destination: Tokyo");
			expect(formatted).toContain("origin: NYC");
			expect(formatted).toContain("num_nights: 7");
		});

		it("should include destination research when available", () => {
			const state = createTravelState("s1", SAMPLE_CONFIG);
			state.checklist = advanceChecklist(state.checklist);
			state.destinationResearch = makeMinimalDestinationResearch();

			const formatted = formatStateForPrompt(state);
			expect(formatted).toContain("Tokyo");
			expect(formatted).toContain("Destination Research");
		});

		it("should include selected destinations", () => {
			const state = createTravelState("s1", SAMPLE_CONFIG);
			state.selectedDestinations = [
				{
					name: "Shibuya",
					type: "area",
					description: "Shopping",
					city: "Tokyo",
					country: "Japan",
					reviews: {},
					sources: [],
				},
			];

			const formatted = formatStateForPrompt(state);
			expect(formatted).toContain("Shibuya");
			expect(formatted).toContain("Tokyo");
		});
	});
});

function makeMinimalDestinationResearch(): DestinationResearch {
	return {
		destination: {
			title: "Explore Tokyo",
			name: "Tokyo",
			description: "Japan's capital",
			bestTimeToVisit: "Spring",
			reviews: {},
			sources: [],
		},
		subDestinations: [
			{
				name: "Shibuya",
				type: "neighborhood",
				description: "Famous for its crossing and nightlife",
				reviews: {},
				sources: [],
			},
		],
		overallSummary: "Great city for culture and food",
		tripHighlights: ["Temples", "Food", "Shopping"],
		travelTips: ["Get a rail pass"],
		preferencesUsed: { themes: ["cultural"], groupType: "couple" },
	};
}
