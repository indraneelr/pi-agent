import type { TravelState } from "@mariozechner/pi-travel-agent";
import { describe, expect, test } from "vitest";
import { composeTravelUiBlocks } from "../src/ui-blocks.js";

describe("composeTravelUiBlocks", () => {
	test("forwards validated destination images so the web UI can render galleries", () => {
		const validatedImage = {
			kind: "image",
			url: "https://example.com/rome.jpg",
			finalUrl: "https://example.com/rome.jpg",
			provider: "searxng",
			retrievedAt: "2026-06-22T00:00:00.000Z",
			validatedAt: "2026-06-22T00:00:01.000Z",
			httpStatus: 200,
			contentType: "image/jpeg",
			width: 1280,
			height: 720,
			validationStatus: "valid",
		};
		const state = {
			sessionId: "s1",
			checklist: { activePhaseIndex: 0, phases: [] },
			preferences: {},
			selectedDestinations: [],
			destinationResearch: {
				destination: { name: "Italy" },
				overallSummary: "Rome options",
				subDestinations: [
					{
						name: "Rome",
						description: "Ancient city",
						imageLinks: ["https://example.com/rome.jpg"],
						validatedImages: [validatedImage],
					},
				],
			},
		} as unknown as TravelState;

		const destinationBlock = composeTravelUiBlocks(state).find((block) => block.kind === "destination_cards");

		expect(destinationBlock?.data.cards[0].validatedImages).toEqual([validatedImage]);
	});

	test("hides accommodation and flight blocks for alpha until booking links are validated", () => {
		const state = {
			sessionId: "s1",
			checklist: { activePhaseIndex: 0, phases: [] },
			preferences: {},
			selectedDestinations: [],
			accommodationResearch: {
				areasToStay: [
					{
						city: "Athens",
						areaToStay: "Plaka",
						description: "Central",
						highlights: "Walkable",
						typicalNightlyRate: {},
						nearbyTransport: "Metro",
					},
				],
			},
			flightResearch: {
				route_origin: "NYC",
				route_destination: "ATH",
				route_depart_date: "2026-07-01",
				route_return_date: "2026-07-10",
				fare_typical_per_person_round_trip: 900,
				fare_currency: "USD",
				sample_options: [],
				caveats: [],
			},
		} as unknown as TravelState;

		const kinds = composeTravelUiBlocks(state).map((block) => block.kind);

		expect(kinds).not.toContain("accommodation_cards");
		expect(kinds).not.toContain("flight_options");
	});
});
