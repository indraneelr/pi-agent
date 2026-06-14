import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ChecklistPhaseConfig } from "../src/core/checklist.js";
import { advanceChecklist } from "../src/core/checklist.js";
import type { PersistenceOptions } from "../src/core/persistence.js";
import type { TravelState } from "../src/core/state.js";
import { createTravelState } from "../src/core/state.js";
import { createAdvanceChecklistTool } from "../src/core/tools/advance-checklist.js";
import { createUpdateStateTool } from "../src/core/tools/update-state.js";

const TEST_DIR = join(tmpdir(), `travel-eval-guardrails-${Date.now()}`);

const SAMPLE_CONFIG: ChecklistPhaseConfig[] = [
	{ id: "gather_preferences", label: "Gather Preferences", description: "Collect requirements" },
	{ id: "shortlist_destinations", label: "Shortlist", description: "Research destinations" },
	{ id: "select_destinations", label: "Select", description: "User picks" },
	{ id: "research_experiences", label: "Experiences", description: "Find activities" },
	{ id: "plan_itinerary", label: "Itinerary", description: "Build plan" },
	{ id: "research_accommodation_flights", label: "Accommodation", description: "Hotels/flights" },
	{ id: "final_plan", label: "Final", description: "Complete plan" },
];

describe("travel eval guardrails", () => {
	let state: TravelState;
	let persistOpts: PersistenceOptions;

	function deps() {
		return {
			getState: () => state,
			setState: (s: TravelState) => {
				state = s;
			},
			persistOpts,
		};
	}

	beforeAll(() => mkdirSync(TEST_DIR, { recursive: true }));
	afterAll(() => rmSync(TEST_DIR, { recursive: true, force: true }));

	beforeEach(() => {
		state = createTravelState("guardrails", SAMPLE_CONFIG);
		state.preferences = {
			destination: "Greece",
			origin: "Berlin",
			from_date: "2026-09-01",
			to_date: "2026-09-13",
			num_nights: 12,
			group_size: 2,
			group_type: "couple",
			budget: { amount: 5000, currency: "EUR", category: "mid-range" },
			travel_themes: ["beaches", "food", "ruins"],
		};
		state.checklist = advanceChecklist(state.checklist);
		persistOpts = { dataDir: TEST_DIR };
	});

	it("normalizes complete Greece place cards and persists next user action", async () => {
		const tool = createUpdateStateTool(deps());
		await tool.execute("t1", { field: "destination_research", data: makeDestinationResearch(8) });

		expect(state.destinationResearch?.subDestinations).toHaveLength(8);
		expect(state.destinationResearch?.subDestinations[0].bestFor).toContain("best for");
		expect(state.destinationResearch?.nextUserAction).toContain("Choose");
	});

	it("rejects thin saved Stage 2 outputs that lack option-card checklist fields", async () => {
		const tool = createUpdateStateTool(deps());
		const thinFixture = JSON.parse(
			readFileSync(new URL("../travel-data/8959f4f0-dc0a-4c6b-a035-15a58add8465.json", import.meta.url), "utf-8"),
		).destinationResearch;

		await expect(tool.execute("t2", { field: "destination_research", data: thinFixture })).rejects.toThrow(
			/missing a useful (why|roughDays|budgetFit|seasonNote|bestFor|logisticsFit|tradeoff)/,
		);
	});

	it("rejects duplicate destination options before saving", async () => {
		const tool = createUpdateStateTool(deps());
		const research = makeDestinationResearch(8);
		research.subDestinations[7].name = research.subDestinations[0].name;

		await expect(tool.execute("t3", { field: "destination_research", data: research })).rejects.toThrow(
			/Duplicate destination option/,
		);
	});

	it("blocks checklist advancement when destination research lacks nextUserAction", async () => {
		state.destinationResearch = makeDestinationResearch(8) as NonNullable<TravelState["destinationResearch"]>;
		delete state.destinationResearch.nextUserAction;

		const tool = createAdvanceChecklistTool(deps());
		await expect(tool.execute("t4", {})).rejects.toThrow(/nextUserAction/);
	});

	it("requires 4-6 flight options when flight research is present", async () => {
		const tool = createUpdateStateTool(deps());
		await expect(
			tool.execute("t5", {
				field: "flight_research",
				data: { sample_options: [{ option_id: "one" }], typical_carriers: [], quick_booking_links: [] },
			}),
		).rejects.toThrow(/4-6 viable flight options/);
	});
});

function makeDestinationResearch(count: number) {
	return {
		destination: {
			title: "Greece place menu",
			name: "Greece",
			description: "Curated Greece options",
			bestTimeToVisit: "September is warm and easier than peak August.",
			reviews: {},
			sources: ["https://example.com/greece"],
		},
		subDestinations: Array.from({ length: count }, (_, i) => ({
			name: `Place ${i + 1}`,
			type: "place",
			description: `Compact description for place ${i + 1} with beaches, food, and ruins.`,
			bestFor: i % 2 === 0 ? "best for beaches" : "best for history",
			why: "Matches the couple's beaches, food, ruins, and relaxed pacing preferences.",
			roughDays: i < 2 ? "2-3 days" : "1-2 days",
			logisticsFit: "Works as part of a simple Athens-plus-islands route without zigzagging.",
			budgetFit: "Likely mid-range friendly; exact prices need live verification.",
			seasonNote: "September is warm, beach-friendly, and less crowded than August.",
			tradeoff: "Adds ferry or transfer time, so it should be paired with nearby stops.",
			imageQuery: `Greece Place ${i + 1} travel beaches ruins`,
			imageLinks: [`https://example.com/images/greece-place-${i + 1}.jpg`],
			reviews: {},
			sources: ["https://example.com/place"],
		})),
		overallSummary: "A compact Greece menu for choosing places before activities.",
		tripHighlights: ["beaches", "ruins", "food"],
		travelTips: ["Group islands by ferry route."],
		preferencesUsed: { themes: ["beaches", "food", "ruins"], groupType: "couple", numNights: 12 },
		nextUserAction: "Choose 3-4 places to continue.",
	};
}
