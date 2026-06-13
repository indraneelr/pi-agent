import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ChecklistPhaseConfig } from "../src/core/checklist.js";
import { advanceChecklist } from "../src/core/checklist.js";
import type { PersistenceOptions } from "../src/core/persistence.js";
import type { TravelState } from "../src/core/state.js";
import { createTravelState } from "../src/core/state.js";
import { buildTravelSystemPrompt } from "../src/core/system-prompt.js";
import { createAdvanceChecklistTool } from "../src/core/tools/advance-checklist.js";
import { createUpdateStateTool } from "../src/core/tools/update-state.js";

const TEST_DIR = join(tmpdir(), `travel-choice-first-test-${Date.now()}`);

const SAMPLE_CONFIG: ChecklistPhaseConfig[] = [
	{ id: "gather_preferences", label: "Gather Preferences", description: "Collect requirements" },
	{ id: "shortlist_destinations", label: "Shortlist", description: "Research destinations" },
	{ id: "select_destinations", label: "Select", description: "User picks" },
	{ id: "research_experiences", label: "Experiences", description: "Find activities" },
	{ id: "plan_itinerary", label: "Itinerary", description: "Build plan" },
	{ id: "research_accommodation_flights", label: "Accommodation", description: "Hotels/flights" },
	{ id: "final_plan", label: "Final", description: "Complete plan" },
];

function fillMandatoryPreferences(overrides: Record<string, unknown> = {}): void {
	state.preferences = {
		destination: "Japan",
		origin: "NYC",
		from_date: "2026-07-01",
		to_date: "2026-07-14",
		num_nights: 13,
		group_size: 2,
		group_type: "couple",
		budget: { amount: 8000, currency: "USD", category: "mid-range" },
		...overrides,
	};
}

function makeSubDestination(name: string, extra: Record<string, unknown> = {}) {
	return {
		name,
		type: "city",
		description: `Description of ${name} for the trip planning purposes`,
		bestFor: `Best for cultural exploration and local cuisine experiences`,
		why: `${name} is an excellent choice for travelers seeking authentic cultural experiences`,
		roughDays: "2 to 3 days recommended for a thorough visit",
		logisticsFit: "Well connected by train and bus routes from major hubs",
		budgetFit: "Fits a mid-range budget comfortably with good value options",
		seasonNote: "Good weather in July with occasional afternoon rain showers",
		tradeoff: "Can be very crowded during peak tourist season months",
		reviews: { rating: 4.5, reviewSummary: "Highly rated by visitors from around the world", sources: [] },
		sources: [],
		...extra,
	};
}

function makeActivity(name: string, location: string) {
	return {
		name,
		type: "landmark",
		description: `Visit ${name}`,
		location,
		estimatedDurationHours: 3,
		estimatedCost: 25,
		reviews: {},
		sources: [],
	};
}

function makeAccommodationArea(areaToStay: string, city: string, extra: Record<string, unknown> = {}) {
	return {
		areaToStay,
		city,
		country: "Japan",
		description: `A great area to stay in ${city} with convenient access to attractions`,
		highlights: "Central location, good restaurants",
		typicalNightlyRate: { budget: "$50-80", midRange: "$120-180", luxury: "$300-500" },
		tips: "Book early for better rates",
		safetyTips: ["Generally safe area"],
		bookingTips: ["Compare prices across platforms"],
		nearbyTransport: "Metro and bus stops nearby",
		reviews: { rating: 4.3, reviewSummary: "Good location", sources: [] },
		sources: [],
		...extra,
	};
}

function makeFlightOption(id: string) {
	return {
		option_id: id,
		option_rank: 1,
		option_notes: `Flight option ${id}`,
		carrier_names_csv: "Japan Airlines",
		duration_hours: 14,
		estimated_fare_amount: 1200,
		estimated_fare_currency: "USD",
		stops: 1,
		source_urls: [],
		booking_url: "https://example.com",
		booking_provider: "Skyscanner",
		booking_label: "Book on Skyscanner",
	};
}

let state: TravelState;
let persistOpts: PersistenceOptions;

function makeDeps() {
	return {
		getState: () => state,
		setState: (s: TravelState) => {
			state = s;
		},
		persistOpts,
	};
}

describe("Choice-first validations", () => {
	beforeAll(() => {
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterAll(() => {
		try {
			rmSync(TEST_DIR, { recursive: true, force: true });
		} catch {}
	});

	beforeEach(() => {
		state = createTravelState("choice-first-test", SAMPLE_CONFIG);
		persistOpts = { dataDir: TEST_DIR };
	});

	describe("Destination option cards — surprise intent (3-5)", () => {
		it("should accept 3 options for surprise-me destination", async () => {
			fillMandatoryPreferences({ destination: "surprise me with options" });
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				destination: {
					title: "T",
					name: "Options",
					description: "d",
					bestTimeToVisit: "Spring",
					reviews: {},
					sources: [],
				},
				subDestinations: [
					makeSubDestination("Spain"),
					makeSubDestination("Thailand"),
					makeSubDestination("Portugal"),
				],
				overallSummary: "s",
				tripHighlights: [],
				travelTips: [],
				preferencesUsed: { themes: [], groupType: "couple" },
			};
			await expect(tool.execute("t1", { field: "destination_research", data: research })).resolves.toBeDefined();
			expect(state.destinationResearch!.subDestinations).toHaveLength(3);
		});

		it("should accept 5 options for surprise-me destination", async () => {
			fillMandatoryPreferences({ destination: "anywhere warm" });
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				destination: {
					title: "T",
					name: "Options",
					description: "d",
					bestTimeToVisit: "Spring",
					reviews: {},
					sources: [],
				},
				subDestinations: [
					makeSubDestination("Spain"),
					makeSubDestination("Thailand"),
					makeSubDestination("Portugal"),
					makeSubDestination("Greece"),
					makeSubDestination("Morocco"),
				],
				overallSummary: "s",
				tripHighlights: [],
				travelTips: [],
				preferencesUsed: { themes: [], groupType: "couple" },
			};
			await expect(tool.execute("t1", { field: "destination_research", data: research })).resolves.toBeDefined();
			expect(state.destinationResearch!.subDestinations).toHaveLength(5);
		});

		it("should reject 2 options for surprise-me destination", async () => {
			fillMandatoryPreferences({ destination: "not sure, give me options" });
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				destination: {
					title: "T",
					name: "Options",
					description: "d",
					bestTimeToVisit: "Spring",
					reviews: {},
					sources: [],
				},
				subDestinations: [makeSubDestination("Spain"), makeSubDestination("Thailand")],
				overallSummary: "s",
				tripHighlights: [],
				travelTips: [],
				preferencesUsed: { themes: [], groupType: "couple" },
			};
			await expect(tool.execute("t1", { field: "destination_research", data: research })).rejects.toThrow(
				/3-5 option cards.*received 2/,
			);
		});

		it("should reject 6 options for surprise-me destination", async () => {
			fillMandatoryPreferences({ destination: "surprise me" });
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				destination: {
					title: "T",
					name: "Options",
					description: "d",
					bestTimeToVisit: "Spring",
					reviews: {},
					sources: [],
				},
				subDestinations: Array.from({ length: 6 }, (_, i) => makeSubDestination(`Place ${i}`)),
				overallSummary: "s",
				tripHighlights: [],
				travelTips: [],
				preferencesUsed: { themes: [], groupType: "couple" },
			};
			await expect(tool.execute("t1", { field: "destination_research", data: research })).rejects.toThrow(
				/3-5 option cards.*received 6/,
			);
		});
	});

	describe("Destination option cards — specific country (8-10)", () => {
		it("should accept 8 options for a specific country", async () => {
			fillMandatoryPreferences({ destination: "Japan" });
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				destination: {
					title: "T",
					name: "Japan",
					description: "d",
					bestTimeToVisit: "Spring",
					reviews: {},
					sources: [],
				},
				subDestinations: Array.from({ length: 8 }, (_, i) => makeSubDestination(`Place ${i}`)),
				overallSummary: "s",
				tripHighlights: [],
				travelTips: [],
				preferencesUsed: { themes: [], groupType: "couple" },
			};
			await expect(tool.execute("t1", { field: "destination_research", data: research })).resolves.toBeDefined();
			expect(state.destinationResearch!.subDestinations).toHaveLength(8);
		});

		it("should accept 10 options for a specific country", async () => {
			fillMandatoryPreferences({ destination: "Greece" });
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				destination: {
					title: "T",
					name: "Greece",
					description: "d",
					bestTimeToVisit: "Spring",
					reviews: {},
					sources: [],
				},
				subDestinations: Array.from({ length: 10 }, (_, i) => makeSubDestination(`Place ${i}`)),
				overallSummary: "s",
				tripHighlights: [],
				travelTips: [],
				preferencesUsed: { themes: [], groupType: "couple" },
			};
			await expect(tool.execute("t1", { field: "destination_research", data: research })).resolves.toBeDefined();
		});

		it("should accept 12 options for a specific country with 15+ nights", async () => {
			fillMandatoryPreferences({ destination: "Japan", num_nights: 16 });
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				destination: {
					title: "T",
					name: "Japan",
					description: "d",
					bestTimeToVisit: "Spring",
					reviews: {},
					sources: [],
				},
				subDestinations: Array.from({ length: 12 }, (_, i) => makeSubDestination(`Place ${i}`)),
				overallSummary: "s",
				tripHighlights: [],
				travelTips: [],
				preferencesUsed: { themes: [], groupType: "couple" },
			};
			await expect(tool.execute("t1", { field: "destination_research", data: research })).resolves.toBeDefined();
		});

		it("should reject 7 options for a specific country", async () => {
			fillMandatoryPreferences({ destination: "Japan" });
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				destination: {
					title: "T",
					name: "Japan",
					description: "d",
					bestTimeToVisit: "Spring",
					reviews: {},
					sources: [],
				},
				subDestinations: Array.from({ length: 7 }, (_, i) => makeSubDestination(`Place ${i}`)),
				overallSummary: "s",
				tripHighlights: [],
				travelTips: [],
				preferencesUsed: { themes: [], groupType: "couple" },
			};
			await expect(tool.execute("t1", { field: "destination_research", data: research })).rejects.toThrow(
				/8-10 option cards.*received 7/,
			);
		});

		it("should reject 11 options for a specific country with <=14 nights", async () => {
			fillMandatoryPreferences({ destination: "Greece", num_nights: 12 });
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				destination: {
					title: "T",
					name: "Greece",
					description: "d",
					bestTimeToVisit: "Spring",
					reviews: {},
					sources: [],
				},
				subDestinations: Array.from({ length: 11 }, (_, i) => makeSubDestination(`Place ${i}`)),
				overallSummary: "s",
				tripHighlights: [],
				travelTips: [],
				preferencesUsed: { themes: [], groupType: "couple" },
			};
			await expect(tool.execute("t1", { field: "destination_research", data: research })).rejects.toThrow(
				/8-10 option cards.*received 11/,
			);
		});

		it("should reject duplicate destination option names", async () => {
			fillMandatoryPreferences({ destination: "Japan" });
			const tool = createUpdateStateTool(makeDeps());
			const options = Array.from({ length: 8 }, (_, i) => makeSubDestination(`Place ${i}`));
			options[1] = {
				...options[1],
				name: options[0].name,
				description: `Unique description for the second duplicate entry that is different from the first one`,
			};
			const research = {
				destination: {
					title: "T",
					name: "Japan",
					description: "d",
					bestTimeToVisit: "Spring",
					reviews: {},
					sources: [],
				},
				subDestinations: options,
				overallSummary: "s",
				tripHighlights: [],
				travelTips: [],
				preferencesUsed: { themes: [], groupType: "couple" },
			};
			await expect(tool.execute("t1", { field: "destination_research", data: research })).rejects.toThrow(
				/Duplicate destination option/,
			);
		});

		it("should reject destination option with missing tradeoff field", async () => {
			fillMandatoryPreferences({ destination: "Japan" });
			const tool = createUpdateStateTool(makeDeps());
			const options = Array.from({ length: 8 }, (_, i) => makeSubDestination(`Place ${i}`));
			delete (options[3] as any).tradeoff;
			const research = {
				destination: {
					title: "T",
					name: "Japan",
					description: "d",
					bestTimeToVisit: "Spring",
					reviews: {},
					sources: [],
				},
				subDestinations: options,
				overallSummary: "s",
				tripHighlights: [],
				travelTips: [],
				preferencesUsed: { themes: [], groupType: "couple" },
			};
			await expect(tool.execute("t1", { field: "destination_research", data: research })).rejects.toThrow(
				/missing.*tradeoff/,
			);
		});
	});

	describe("Activity option cards (4-6 per destination)", () => {
		beforeEach(() => {
			fillMandatoryPreferences();
			state.selectedDestinations = [
				{ name: "Tokyo", type: "city", description: "Capital of Japan", reviews: {}, sources: [] },
				{ name: "Kyoto", type: "city", description: "Ancient capital", reviews: {}, sources: [] },
			];
		});

		it("should accept 4 activities per destination", async () => {
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				activities: [
					makeActivity("Temple", "Tokyo"),
					makeActivity("Park", "Tokyo"),
					makeActivity("Market", "Tokyo"),
					makeActivity("Museum", "Tokyo"),
					makeActivity("Shrine", "Kyoto"),
					makeActivity("Garden", "Kyoto"),
					makeActivity("Tea House", "Kyoto"),
					makeActivity("Bamboo Forest", "Kyoto"),
				],
			};
			await expect(tool.execute("t1", { field: "activities_research", data: research })).resolves.toBeDefined();
		});

		it("should accept 6 activities per destination", async () => {
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				activities: [
					...Array.from({ length: 6 }, (_, i) => makeActivity(`Activity ${i}`, "Tokyo")),
					...Array.from({ length: 6 }, (_, i) => makeActivity(`Activity ${i + 6}`, "Kyoto")),
				],
			};
			await expect(tool.execute("t1", { field: "activities_research", data: research })).resolves.toBeDefined();
		});

		it("should reject 3 activities for a destination", async () => {
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				activities: [
					makeActivity("Temple", "Tokyo"),
					makeActivity("Park", "Tokyo"),
					makeActivity("Market", "Tokyo"),
					makeActivity("Shrine", "Kyoto"),
					makeActivity("Garden", "Kyoto"),
					makeActivity("Tea House", "Kyoto"),
					makeActivity("Bamboo Forest", "Kyoto"),
				],
			};
			await expect(tool.execute("t1", { field: "activities_research", data: research })).rejects.toThrow(
				/Expected 4-6 activity options for Tokyo.*received 3/,
			);
		});

		it("should reject 7 activities for a destination", async () => {
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				activities: [
					...Array.from({ length: 7 }, (_, i) => makeActivity(`Activity ${i}`, "Tokyo")),
					...Array.from({ length: 4 }, (_, i) => makeActivity(`Activity ${i + 7}`, "Kyoto")),
				],
			};
			await expect(tool.execute("t1", { field: "activities_research", data: research })).rejects.toThrow(
				/Expected 4-6 activity options for Tokyo.*received 7/,
			);
		});

		it("should reject selected destinations with 0 activities once activity research is saved", async () => {
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				activities: [
					makeActivity("Temple", "Tokyo"),
					makeActivity("Park", "Tokyo"),
					makeActivity("Market", "Tokyo"),
					makeActivity("Museum", "Tokyo"),
				],
			};
			await expect(tool.execute("t1", { field: "activities_research", data: research })).rejects.toThrow(
				/Kyoto.*received 0/,
			);
		});
	});

	describe("Flight options (4-6)", () => {
		it("should accept 4 flight options", async () => {
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				sample_options: [
					makeFlightOption("1"),
					makeFlightOption("2"),
					makeFlightOption("3"),
					makeFlightOption("4"),
				],
				schema_version: "1.0",
				meta_generated_at: new Date().toISOString(),
				meta_provider_type: "web_search",
				meta_confidence: "estimate",
				route_origin: "NYC",
				route_destination: "Tokyo",
				route_depart_date: "2026-07-01",
				route_return_date: "2026-07-14",
				route_travelers: 2,
				route_cabin_class: "economy",
				fare_currency: "USD",
				fare_assumptions: "Round trip, economy",
				fare_volatility: "moderate",
				caveats: ["Prices are estimates"],
				typical_carriers: [],
				quick_booking_links: [],
			};
			await expect(tool.execute("t1", { field: "flight_research", data: research })).resolves.toBeDefined();
		});

		it("should accept 6 flight options", async () => {
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				sample_options: Array.from({ length: 6 }, (_, i) => makeFlightOption(String(i))),
				schema_version: "1.0",
				meta_generated_at: new Date().toISOString(),
				meta_provider_type: "web_search",
				meta_confidence: "estimate",
				route_origin: "NYC",
				route_destination: "Tokyo",
				route_depart_date: "2026-07-01",
				route_return_date: "2026-07-14",
				route_travelers: 2,
				route_cabin_class: "economy",
				fare_currency: "USD",
				fare_assumptions: "Round trip, economy",
				fare_volatility: "moderate",
				caveats: ["Prices are estimates"],
				typical_carriers: [],
				quick_booking_links: [],
			};
			await expect(tool.execute("t1", { field: "flight_research", data: research })).resolves.toBeDefined();
		});

		it("should reject 3 flight options", async () => {
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				sample_options: [makeFlightOption("1"), makeFlightOption("2"), makeFlightOption("3")],
				schema_version: "1.0",
			};
			await expect(tool.execute("t1", { field: "flight_research", data: research })).rejects.toThrow(
				/4-6 viable flight options.*received 3/,
			);
		});

		it("should reject 7 flight options", async () => {
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				sample_options: Array.from({ length: 7 }, (_, i) => makeFlightOption(String(i))),
				schema_version: "1.0",
			};
			await expect(tool.execute("t1", { field: "flight_research", data: research })).rejects.toThrow(
				/4-6 viable flight options.*received 7/,
			);
		});

		it("should accept 0 flight options (deferred)", async () => {
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				sample_options: [],
				schema_version: "1.0",
			};
			await expect(tool.execute("t1", { field: "flight_research", data: research })).resolves.toBeDefined();
		});
	});

	describe("Accommodation options per city", () => {
		it("should accept 4-6 accommodation options per city", async () => {
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				areasToStay: [
					makeAccommodationArea("Shibuya", "Tokyo"),
					makeAccommodationArea("Shinjuku", "Tokyo"),
					makeAccommodationArea("Ginza", "Tokyo"),
					makeAccommodationArea("Ueno", "Tokyo"),
					makeAccommodationArea("Gion", "Kyoto"),
					makeAccommodationArea("Downtown", "Kyoto"),
					makeAccommodationArea("Arashiyama", "Kyoto"),
					makeAccommodationArea("Kyoto Station", "Kyoto"),
				],
			};
			await expect(tool.execute("t1", { field: "accommodation_research", data: research })).resolves.toBeDefined();
		});

		it("should reject area with empty name", async () => {
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				areasToStay: [
					makeAccommodationArea("", "Tokyo"),
					makeAccommodationArea("Shinjuku", "Tokyo"),
					makeAccommodationArea("Ginza", "Tokyo"),
					makeAccommodationArea("Ueno", "Tokyo"),
				],
			};
			await expect(tool.execute("t1", { field: "accommodation_research", data: research })).rejects.toThrow(
				/non-empty areaToStay/,
			);
		});

		it("should reject area with missing description", async () => {
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				areasToStay: [
					{ ...makeAccommodationArea("Shibuya", "Tokyo"), description: "short" },
					makeAccommodationArea("Shinjuku", "Tokyo"),
					makeAccommodationArea("Ginza", "Tokyo"),
					makeAccommodationArea("Ueno", "Tokyo"),
				],
			};
			await expect(tool.execute("t1", { field: "accommodation_research", data: research })).rejects.toThrow(
				/missing a useful description/,
			);
		});

		it("should reject when a city has fewer than 4 options", async () => {
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				areasToStay: [
					makeAccommodationArea("Shibuya", "Tokyo"),
					makeAccommodationArea("Gion", "Kyoto"),
					makeAccommodationArea("Downtown", "Kyoto"),
				],
			};
			await expect(tool.execute("t1", { field: "accommodation_research", data: research })).rejects.toThrow(
				/Tokyo.*has 1.*4-6/i,
			);
		});

		it("should reject empty areasToStay", async () => {
			const tool = createUpdateStateTool(makeDeps());
			await expect(
				tool.execute("t1", { field: "accommodation_research", data: { areasToStay: [] } }),
			).rejects.toThrow(/must include areasToStay/);
		});

		it("should reject areasToStay without the array", async () => {
			const tool = createUpdateStateTool(makeDeps());
			await expect(tool.execute("t1", { field: "accommodation_research", data: {} })).rejects.toThrow(
				/must include areasToStay/,
			);
		});
	});

	describe("Phase advance guards", () => {
		it("should block advance from gather_preferences when mandatory fields missing", async () => {
			const tool = createAdvanceChecklistTool(makeDeps());
			await expect(tool.execute("t1", {})).rejects.toThrow("mandatory preferences still missing");
		});

		it("should block advance from shortlist with no destination research", async () => {
			fillMandatoryPreferences();
			state.checklist = advanceChecklist(state.checklist);
			const tool = createAdvanceChecklistTool(makeDeps());
			await expect(tool.execute("t1", {})).rejects.toThrow("no destinations have been researched");
		});

		it("should block advance from shortlist with too few options", async () => {
			fillMandatoryPreferences();
			state.checklist = advanceChecklist(state.checklist);
			state.destinationResearch = {
				destination: {
					title: "T",
					name: "Japan",
					description: "d",
					bestTimeToVisit: "Spring",
					reviews: {},
					sources: [],
				},
				subDestinations: [makeSubDestination("Tokyo"), makeSubDestination("Kyoto"), makeSubDestination("Osaka")],
				overallSummary: "s",
				tripHighlights: [],
				travelTips: [],
				preferencesUsed: { themes: [], groupType: "couple" },
			};
			const tool = createAdvanceChecklistTool(makeDeps());
			await expect(tool.execute("t1", {})).rejects.toThrow(/8-10 curated options.*found 3/);
		});

		it("should block advance from select with no selected destinations", async () => {
			fillMandatoryPreferences();
			state.checklist = advanceChecklist(state.checklist);
			state.destinationResearch = {
				destination: {
					title: "T",
					name: "Japan",
					description: "d",
					bestTimeToVisit: "Spring",
					reviews: {},
					sources: [],
				},
				subDestinations: Array.from({ length: 8 }, (_, i) => makeSubDestination(`Place ${i}`)),
				overallSummary: "s",
				tripHighlights: [],
				travelTips: [],
				preferencesUsed: { themes: [], groupType: "couple" },
				nextUserAction: "Pick your places",
			};
			state.checklist = advanceChecklist(state.checklist);
			const tool = createAdvanceChecklistTool(makeDeps());
			await expect(tool.execute("t1", {})).rejects.toThrow("no destinations have been selected");
		});

		it("should block advance from experiences with too few activities", async () => {
			fillMandatoryPreferences();
			state.checklist = advanceChecklist(state.checklist);
			state.destinationResearch = {
				destination: {
					title: "T",
					name: "Japan",
					description: "d",
					bestTimeToVisit: "Spring",
					reviews: {},
					sources: [],
				},
				subDestinations: Array.from({ length: 8 }, (_, i) => makeSubDestination(`Place ${i}`)),
				overallSummary: "s",
				tripHighlights: [],
				travelTips: [],
				preferencesUsed: { themes: [], groupType: "couple" },
				nextUserAction: "Pick",
			};
			state.checklist = advanceChecklist(state.checklist);
			state.selectedDestinations = [{ name: "Tokyo", type: "city", description: "d", reviews: {}, sources: [] }];
			state.checklist = advanceChecklist(state.checklist);
			state.activitiesResearch = {
				activities: [makeActivity("Temple", "Tokyo"), makeActivity("Park", "Tokyo")],
			};
			const tool = createAdvanceChecklistTool(makeDeps());
			await expect(tool.execute("t1", {})).rejects.toThrow(/Tokyo needs 4-6 activity options.*found 2/);
		});

		it("should block advance from accommodation_flights with too few flight options", async () => {
			fillMandatoryPreferences();
			state.checklist = advanceChecklist(state.checklist);
			state.destinationResearch = {
				destination: {
					title: "T",
					name: "Japan",
					description: "d",
					bestTimeToVisit: "Spring",
					reviews: {},
					sources: [],
				},
				subDestinations: Array.from({ length: 8 }, (_, i) => makeSubDestination(`Place ${i}`)),
				overallSummary: "s",
				tripHighlights: [],
				travelTips: [],
				preferencesUsed: { themes: [], groupType: "couple" },
				nextUserAction: "Pick",
			};
			state.checklist = advanceChecklist(state.checklist);
			state.selectedDestinations = [{ name: "Tokyo", type: "city", description: "d", reviews: {}, sources: [] }];
			state.checklist = advanceChecklist(state.checklist);
			state.activitiesResearch = { activities: Array.from({ length: 4 }, (_, i) => makeActivity(`A${i}`, "Tokyo")) };
			state.checklist = advanceChecklist(state.checklist);
			state.itineraryResearch = {
				itinerary: [
					{ dayNumber: 1, date: "2026-07-01", city: "Tokyo", country: "Japan", place: "Tokyo", activities: [] },
				],
			};
			state.checklist = advanceChecklist(state.checklist);
			state.flightResearch = {
				sample_options: [makeFlightOption("1"), makeFlightOption("2"), makeFlightOption("3")],
				schema_version: "1.0",
			} as any;
			const tool = createAdvanceChecklistTool(makeDeps());
			await expect(tool.execute("t1", {})).rejects.toThrow(/4-6 flight options/);
		});

		it("should block advance from accommodation_flights when accommodation has fewer than 4 options per city", async () => {
			fillMandatoryPreferences();
			state.checklist = advanceChecklist(state.checklist);
			state.destinationResearch = {
				destination: {
					title: "T",
					name: "Japan",
					description: "d",
					bestTimeToVisit: "Spring",
					reviews: {},
					sources: [],
				},
				subDestinations: Array.from({ length: 8 }, (_, i) => makeSubDestination(`Place ${i}`)),
				overallSummary: "s",
				tripHighlights: [],
				travelTips: [],
				preferencesUsed: { themes: [], groupType: "couple" },
				nextUserAction: "Pick",
			};
			state.checklist = advanceChecklist(state.checklist);
			state.selectedDestinations = [{ name: "Tokyo", type: "city", description: "d", reviews: {}, sources: [] }];
			state.checklist = advanceChecklist(state.checklist);
			state.activitiesResearch = { activities: Array.from({ length: 4 }, (_, i) => makeActivity(`A${i}`, "Tokyo")) };
			state.checklist = advanceChecklist(state.checklist);
			state.itineraryResearch = {
				itinerary: [
					{ dayNumber: 1, date: "2026-07-01", city: "Tokyo", country: "Japan", place: "Tokyo", activities: [] },
				],
			};
			state.checklist = advanceChecklist(state.checklist);
			state.accommodationResearch = {
				areasToStay: [makeAccommodationArea("Shibuya", "Tokyo")],
			};
			state.flightResearch = {
				sample_options: Array.from({ length: 4 }, (_, i) => makeFlightOption(String(i))),
				schema_version: "1.0",
			} as any;
			const tool = createAdvanceChecklistTool(makeDeps());
			await expect(tool.execute("t1", {})).rejects.toThrow(/has 1 accommodation option/i);
		});

		it("should advance from accommodation_flights when all validations pass", async () => {
			fillMandatoryPreferences();
			state.checklist = advanceChecklist(state.checklist);
			state.destinationResearch = {
				destination: {
					title: "T",
					name: "Japan",
					description: "d",
					bestTimeToVisit: "Spring",
					reviews: {},
					sources: [],
				},
				subDestinations: Array.from({ length: 8 }, (_, i) => makeSubDestination(`Place ${i}`)),
				overallSummary: "s",
				tripHighlights: [],
				travelTips: [],
				preferencesUsed: { themes: [], groupType: "couple" },
				nextUserAction: "Pick",
			};
			state.checklist = advanceChecklist(state.checklist);
			state.selectedDestinations = [{ name: "Tokyo", type: "city", description: "d", reviews: {}, sources: [] }];
			state.checklist = advanceChecklist(state.checklist);
			state.activitiesResearch = { activities: Array.from({ length: 4 }, (_, i) => makeActivity(`A${i}`, "Tokyo")) };
			state.checklist = advanceChecklist(state.checklist);
			state.itineraryResearch = {
				itinerary: [
					{ dayNumber: 1, date: "2026-07-01", city: "Tokyo", country: "Japan", place: "Tokyo", activities: [] },
				],
			};
			state.checklist = advanceChecklist(state.checklist);
			state.accommodationResearch = {
				areasToStay: [
					makeAccommodationArea("Shibuya", "Tokyo"),
					makeAccommodationArea("Shinjuku", "Tokyo"),
					makeAccommodationArea("Ginza", "Tokyo"),
					makeAccommodationArea("Ueno", "Tokyo"),
				],
			};
			state.flightResearch = {
				sample_options: Array.from({ length: 4 }, (_, i) => makeFlightOption(String(i))),
				schema_version: "1.0",
			} as any;
			const tool = createAdvanceChecklistTool(makeDeps());
			const result = await tool.execute("t1", {});
			expect(result.details.newActivePhase).toBe("final_plan");
		});
	});

	describe("System prompt choice-first guidance", () => {
		it("should mention 4-6 activities in experiences prompt", () => {
			const state = createTravelState("prompt-test", SAMPLE_CONFIG);
			state.checklist = advanceChecklist(state.checklist);
			state.checklist = advanceChecklist(state.checklist);
			state.checklist = advanceChecklist(state.checklist);
			const prompt = buildTravelSystemPrompt(state);
			expect(prompt).toContain("4-6 activity options per selected destination");
		});

		it("should mention 4-6 accommodation areas per city in accommodation prompt", () => {
			const state = createTravelState("prompt-test", SAMPLE_CONFIG);
			for (let i = 0; i < 5; i++) {
				state.checklist = advanceChecklist(state.checklist);
			}
			const prompt = buildTravelSystemPrompt(state);
			expect(prompt).toContain("4-6 accommodation areas per overnight city");
		});

		it("should mention 4-6 flight options in accommodation prompt", () => {
			const state = createTravelState("prompt-test", SAMPLE_CONFIG);
			for (let i = 0; i < 5; i++) {
				state.checklist = advanceChecklist(state.checklist);
			}
			const prompt = buildTravelSystemPrompt(state);
			expect(prompt).toContain("4-6 flight options");
		});
	});
});
