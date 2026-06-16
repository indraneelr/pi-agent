import { describe, expect, it } from "vitest";
import { scoreAccommodationFlightResearchQuality } from "../src/core/accommodation-flight-fit.js";
import type {
	AccommodationArea,
	AccommodationResearch,
	FlightResearch,
	ItineraryResearch,
	TravelPreferences,
} from "../src/core/types.js";

const prefs: TravelPreferences = {
	origin: "Berlin",
	destination: "Greece",
	from_date: "2026-06-20",
	to_date: "2026-06-30",
	num_nights: 10,
	group_size: 4,
	group_type: "family",
	ages_in_group: [8, 11],
	budget: { amount: 6500, currency: "EUR", category: "mid-range" },
	travel_themes: ["beaches", "culture", "food", "easy logistics"],
};

const itinerary: ItineraryResearch = {
	itinerary: [
		{ date: "2026-06-20", dayNumber: 1, place: "Athens", activities: [] },
		{ date: "2026-06-21", dayNumber: 2, place: "Athens", activities: [] },
		{ date: "2026-06-22", dayNumber: 3, place: "Naxos", activities: [] },
		{ date: "2026-06-30", dayNumber: 11, place: "Naxos → Athens → Berlin", activities: [] },
	],
};

describe("accommodation-flight-fit", () => {
	it("passes complete accommodation and flight research", () => {
		const quality = scoreAccommodationFlightResearchQuality(
			makeAccommodationResearch(),
			makeFlightResearch(),
			prefs,
			itinerary,
		);
		expect(quality.issues).toEqual([]);
		expect(quality.pass).toBe(true);
		expect(quality.accommodationCountsByCity).toEqual({ Athens: 4, Naxos: 4 });
		expect(quality.flightOptionCount).toBe(4);
	});

	it("fails missing per-city accommodation coverage and weak flight artifacts", () => {
		const accommodation = makeAccommodationResearch();
		accommodation.areasToStay = accommodation.areasToStay.slice(0, 2);
		const flight = makeFlightResearch();
		flight.sample_options = flight.sample_options.slice(0, 3);
		flight.caveats = [];
		flight.route_depart_date = "2026-06-21";

		const quality = scoreAccommodationFlightResearchQuality(accommodation, flight, prefs, itinerary);
		expect(quality.pass).toBe(false);
		expect(quality.issues.join("\n")).toContain("City Athens has 2 accommodation option");
		expect(quality.issues.join("\n")).toContain("City Naxos has 0 accommodation option");
		expect(quality.issues.join("\n")).toContain("expected 4-6");
		expect(quality.issues.join("\n")).toContain("Flight depart date does not match preferences");
		expect(quality.issues.join("\n")).toContain("missing caveats");
	});
});

function makeAccommodationResearch(): AccommodationResearch {
	return {
		description: "Accommodation areas for Athens and Naxos.",
		areasToStay: ["Plaka", "Koukaki", "Syntagma", "Psyrri"]
			.map((area) => makeArea("Athens", area))
			.concat(["Naxos Chora", "Agios Prokopios", "Agia Anna", "Stelida"].map((area) => makeArea("Naxos", area))),
	};
}

function makeArea(city: string, areaToStay: string): AccommodationArea {
	return {
		city,
		country: "Greece",
		itineraryPlacesCovered: [city],
		areaToStay,
		description: `${areaToStay} is a practical family base in ${city}, close to restaurants, transit, and the planned culture/food/beach activities.`,
		highlights: "Easy walks, reliable dining, and simple access to planned activities.",
		typicalNightlyRate: { budget: "€90", midRange: "€160", luxury: "€280" },
		tips: "Book refundable rooms early for late June and compare total fees before choosing.",
		safetyTips: ["Use well-lit streets at night and keep valuables secure in crowded areas."],
		bookingTips: ["Prioritize cancellable rates near metro, ferry, or beach transport."],
		nearbyTransport: "Metro/bus/taxi access within 5-15 minutes, with easy airport or ferry links.",
		reviews: { rating: 4.5, reviewSummary: "Well-rated on booking sites." },
		accommodationLinks: ["https://example.com/hotels"],
		sources: ["https://example.com/accommodation"],
	};
}

function makeFlightResearch(): FlightResearch {
	return {
		route_origin: "Berlin",
		route_origin_airport_code: "BER",
		route_destination: "Athens",
		route_destination_airport_code: "ATH",
		route_depart_date: "2026-06-20",
		route_return_date: "2026-06-30",
		fare_currency: "EUR",
		fare_min_per_person_round_trip: 180,
		fare_typical_per_person_round_trip: 260,
		fare_max_per_person_round_trip: 420,
		fare_group_round_trip_total: 1040,
		fare_volatility: "medium",
		fare_assumptions: ["Web-search estimates only; verify live fares before booking."],
		typical_carriers: [
			{
				carrier_name: "Aegean",
				carrier_iata_code: "A3",
				service_pattern: "nonstop_common",
				confidence_score: 0.8,
				source_urls: ["https://example.com/flights"],
			},
		],
		sample_options: [1, 2, 3, 4].map((rank) => ({
			option_id: `opt-${rank}`,
			option_rank: rank,
			carrier_names_csv: rank === 1 ? "Aegean" : "Lufthansa",
			stops: rank === 1 ? "nonstop" : "1_stop",
			duration_hours: rank === 1 ? 2.8 : 5.2,
			estimated_fare_amount: 180 + rank * 30,
			estimated_fare_currency: "EUR",
			booking_provider: "google_flights",
			booking_label: "Google Flights",
			booking_url: "https://www.google.com/travel/flights",
			booking_deep_link: false,
			option_notes: "Verify live price and baggage before booking.",
			source_urls: ["https://www.google.com/travel/flights"],
		})),
		quick_booking_links: [
			{
				booking_provider: "google_flights",
				booking_label: "Google Flights",
				booking_url: "https://www.google.com/travel/flights",
				booking_deep_link: false,
			},
		],
		caveats: ["Fares are estimates from web search; prices and availability change quickly."],
		meta_provider_type: "web_search",
		meta_generated_at: "2026-06-15T12:00:00.000Z",
		meta_confidence: "medium",
		schema_version: "1.0.0",
	};
}
