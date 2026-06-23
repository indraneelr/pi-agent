import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ChecklistPhaseConfig } from "../src/core/checklist.js";
import { advanceChecklist } from "../src/core/checklist.js";
import type { PersistenceOptions } from "../src/core/persistence.js";
import { loadTravelState } from "../src/core/persistence.js";
import type { TravelState } from "../src/core/state.js";
import { createTravelState } from "../src/core/state.js";
import { createAdvanceChecklistTool } from "../src/core/tools/advance-checklist.js";
import { createGoBackTool } from "../src/core/tools/go-back.js";
import { createSaveDestinationShortlistTool } from "../src/core/tools/save-destination-shortlist.js";
import { createShowChecklistTool } from "../src/core/tools/show-checklist.js";
import { createUpdateStateTool } from "../src/core/tools/update-state.js";

const TEST_DIR = join(tmpdir(), `travel-tools-test-${Date.now()}`);

const SAMPLE_CONFIG: ChecklistPhaseConfig[] = [
	{ id: "gather_preferences", label: "Gather Preferences", description: "Collect requirements" },
	{ id: "shortlist_destinations", label: "Shortlist", description: "Research destinations" },
	{ id: "select_destinations", label: "Select", description: "User picks" },
	{ id: "research_experiences", label: "Experiences", description: "Find activities" },
	{ id: "plan_itinerary", label: "Itinerary", description: "Build plan" },
	{ id: "research_accommodation_flights", label: "Accommodation", description: "Hotels/flights" },
	{ id: "final_plan", label: "Final", description: "Complete plan" },
];

describe("Travel Tools", () => {
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

	beforeAll(() => {
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterAll(() => {
		try {
			rmSync(TEST_DIR, { recursive: true, force: true });
		} catch {}
	});

	beforeEach(() => {
		state = createTravelState("tool-test", SAMPLE_CONFIG);
		persistOpts = { dataDir: TEST_DIR };
	});

	describe("show_checklist", () => {
		it("should return formatted checklist", async () => {
			const tool = createShowChecklistTool(() => state.checklist);
			const result = await tool.execute("t1", {});

			expect((result.content[0] as any).text).toContain("[>] 1.");
			expect(result.details.activePhase).toBe("gather_preferences");
			expect(result.details.completedCount).toBe(0);
			expect(result.details.totalCount).toBe(7);
		});

		it("should reflect advancement", async () => {
			state.checklist = advanceChecklist(state.checklist);
			const tool = createShowChecklistTool(() => state.checklist);
			const result = await tool.execute("t2", {});

			expect(result.details.activePhase).toBe("shortlist_destinations");
			expect(result.details.completedCount).toBe(1);
		});
	});

	describe("update_travel_state", () => {
		it("should merge preferences", async () => {
			const tool = createUpdateStateTool(makeDeps());
			await tool.execute("t1", { field: "preferences", data: { destination: "Tokyo" } });
			expect(state.preferences.destination).toBe("Tokyo");

			await tool.execute("t2", { field: "preferences", data: { origin: "NYC" } });
			expect(state.preferences.destination).toBe("Tokyo");
			expect(state.preferences.origin).toBe("NYC");
		});

		it("should set destination_research", async () => {
			const tool = createUpdateStateTool(makeDeps());
			const research = {
				destination: {
					title: "T",
					name: "Tokyo",
					description: "d",
					bestTimeToVisit: "Spring",
					reviews: {},
					sources: [],
				},
				subDestinations: [],
				overallSummary: "s",
				tripHighlights: [],
				travelTips: [],
				preferencesUsed: { themes: [], groupType: "couple" },
			};
			await tool.execute("t3", { field: "destination_research", data: research });
			expect(state.destinationResearch).not.toBeNull();
			expect(state.destinationResearch!.destination.name).toBe("Tokyo");
		});

		it("should reject invalid field", async () => {
			const tool = createUpdateStateTool(makeDeps());
			await expect(tool.execute("t4", { field: "invalid_field", data: {} })).rejects.toThrow("Invalid field");
		});

		it("should persist to disk after update", async () => {
			const tool = createUpdateStateTool(makeDeps());
			await tool.execute("t5", { field: "preferences", data: { destination: "Paris" } });

			const loaded = loadTravelState("tool-test", persistOpts);
			expect(loaded).not.toBeNull();
			expect(loaded!.preferences.destination).toBe("Paris");
		});

		it("should reject activities_research when activity caveats do not map to stated preferences", async () => {
			fillMandatoryPreferences();
			state.preferences.travel_themes = ["food", "culture", "history"];
			state.selectedDestinations = [
				{ name: "Tokyo", type: "place", description: "Selected", reviews: {}, sources: [] },
			];
			const tool = createUpdateStateTool(makeDeps());
			const activities = [
				makeActivity("Tokyo Food Market", "Tokyo", {
					tips: "Bring a blue hat because photos look nicer.",
				}),
				makeActivity("Tokyo Museum Walk", "Tokyo"),
				makeActivity("Tokyo Izakaya Evening", "Tokyo"),
				makeActivity("Tokyo Temple Morning", "Tokyo"),
			];

			await expect(tool.execute("t6", { field: "activities_research", data: { activities } })).rejects.toThrow(
				/activity-quality.*does not map to a relevant preference axis/,
			);
		});

		it("should accept activities_research when all activities meet selected-place quality gates", async () => {
			fillMandatoryPreferences();
			state.preferences.travel_themes = ["food", "culture", "history"];
			state.selectedDestinations = [
				{ name: "Tokyo", type: "place", description: "Selected", reviews: {}, sources: [] },
			];
			const tool = createUpdateStateTool(makeDeps());
			const activities = [
				makeActivity("Tokyo Food Market", "Tokyo"),
				makeActivity("Tokyo Museum Walk", "Tokyo"),
				makeActivity("Tokyo Izakaya Evening", "Tokyo"),
				makeActivity("Tokyo Temple Morning", "Tokyo"),
			];

			await tool.execute("t7", { field: "activities_research", data: { activities } });

			expect(state.activitiesResearch!.activities).toHaveLength(4);
		});

		it("should normalize grouped recommended/switchable activities into the persisted activities array", async () => {
			fillMandatoryPreferences();
			state.preferences.travel_themes = ["food", "culture", "history"];
			state.selectedDestinations = [
				{ name: "Tokyo", type: "place", description: "Selected", reviews: {}, sources: [] },
			];
			const tool = createUpdateStateTool(makeDeps());

			await tool.execute("t8", {
				field: "activities_research",
				data: {
					Tokyo: {
						recommended: [makeActivity("Tokyo Food Market", "", { location: undefined })],
						switchable: [
							makeActivity("Tokyo Museum Walk", "", { location: undefined }),
							makeActivity("Tokyo Izakaya Evening", "", { location: undefined }),
							makeActivity("Tokyo Temple Morning", "", { location: undefined }),
						],
					},
				},
			});

			expect(state.activitiesResearch!.activities).toHaveLength(4);
			expect(state.activitiesResearch!.activities.map((activity) => activity.location)).toEqual([
				"Tokyo",
				"Tokyo",
				"Tokyo",
				"Tokyo",
			]);
			expect((state.activitiesResearch!.activities[0] as any).priority).toBe("recommended");
			expect((state.activitiesResearch!.activities[1] as any).priority).toBe("switchable");
		});

		it("should normalize destinations array activities without saving the destination wrapper as an activity", async () => {
			fillMandatoryPreferences();
			state.preferences.travel_themes = ["food", "culture", "history"];
			state.selectedDestinations = [
				{ name: "Tokyo", type: "place", description: "Selected", reviews: {}, sources: [] },
			];
			const tool = createUpdateStateTool(makeDeps());

			await tool.execute("t9", {
				field: "activities_research",
				data: {
					destinations: [
						{
							name: "Tokyo",
							activities: [
								makeActivity("Tokyo Food Market", "", { location: undefined }),
								makeActivity("Tokyo Museum Walk", "", { location: undefined }),
								makeActivity("Tokyo Izakaya Evening", "", { location: undefined }),
								makeActivity("Tokyo Temple Morning", "", { location: undefined }),
							],
						},
					],
				},
			});

			expect(state.activitiesResearch!.activities).toHaveLength(4);
			expect(state.activitiesResearch!.activities.map((activity) => activity.name)).toEqual([
				"Tokyo Food Market",
				"Tokyo Museum Walk",
				"Tokyo Izakaya Evening",
				"Tokyo Temple Morning",
			]);
			expect(state.activitiesResearch!.activities.map((activity) => activity.location)).toEqual([
				"Tokyo",
				"Tokyo",
				"Tokyo",
				"Tokyo",
			]);
		});
	});

	describe("save_destination_shortlist", () => {
		beforeEach(() => {
			fillMandatoryPreferences();
		});

		it("should save destinationResearch from a narrow schema", async () => {
			const tool = createSaveDestinationShortlistTool(makeDeps());
			const result = await tool.execute("t1", {
				subDestinations: Array.from({ length: 8 }, (_, i) => makeSubDestination(`Place ${i}`)),
			});

			expect(state.destinationResearch).not.toBeNull();
			expect(state.destinationResearch!.subDestinations).toHaveLength(8);
			expect(state.destinationResearch!.subDestinations[0].name).toBe("Place 0");
			expect((result.content[0] as any).text).toContain("8 option card");
			expect(result.details.optionCount).toBe(8);
		});

		it("should persist to disk after save", async () => {
			const tool = createSaveDestinationShortlistTool(makeDeps());
			await tool.execute("t2", {
				subDestinations: Array.from({ length: 8 }, (_, i) => makeSubDestination(`Place ${i}`)),
			});

			const loaded = loadTravelState("tool-test", persistOpts);
			expect(loaded).not.toBeNull();
			expect(loaded!.destinationResearch).not.toBeNull();
			expect(loaded!.destinationResearch!.subDestinations).toHaveLength(8);
		});

		it("should normalize option cards and infer nextUserAction", async () => {
			const tool = createSaveDestinationShortlistTool(makeDeps());
			await tool.execute("t3", {
				subDestinations: Array.from({ length: 8 }, (_, i) => makeSubDestination(`Place ${i}`)),
				overallSummary: "A curated Japan menu.",
			});

			expect(state.destinationResearch!.overallSummary).toBe("A curated Japan menu.");
			expect(state.destinationResearch!.nextUserAction).toContain("Choose");
			expect(state.destinationResearch!.schemaVersion).toBe("2.0.0");
		});

		it("should reject too few option cards (reuses validation)", async () => {
			const tool = createSaveDestinationShortlistTool(makeDeps());
			await expect(
				tool.execute("t4", {
					subDestinations: [makeSubDestination("Only One")],
				}),
			).rejects.toThrow(/8-10 option cards.*received 1/);
		});

		it("should accept concise numeric roughDays values", async () => {
			const tool = createSaveDestinationShortlistTool(makeDeps());
			const cards = Array.from({ length: 8 }, (_, i) => makeSubDestination(`Place ${i}`));
			cards[0].roughDays = "2";
			cards[1].roughDays = "3–4";

			await tool.execute("t5", { subDestinations: cards });

			expect(state.destinationResearch!.subDestinations[0].roughDays).toBe("2");
		});

		it("should reject thin option cards missing required fields", async () => {
			const tool = createSaveDestinationShortlistTool(makeDeps());
			const cards = Array.from({ length: 8 }, (_, i) => makeSubDestination(`Place ${i}`));
			delete (cards[3] as any).tradeoff;
			await expect(tool.execute("t5", { subDestinations: cards })).rejects.toThrow(/missing.*tradeoff/);
		});

		it("should reject destination option cards without image links", async () => {
			const tool = createSaveDestinationShortlistTool(makeDeps());
			const cards = Array.from({ length: 8 }, (_, i) => makeSubDestination(`Place ${i}`));
			delete (cards[2] as any).imageLinks;

			await expect(tool.execute("t6", { subDestinations: cards })).rejects.toThrow(/imageLinks/);
		});

		it("should reject destination option cards without validated image evidence", async () => {
			const tool = createSaveDestinationShortlistTool(makeDeps());
			const cards = Array.from({ length: 8 }, (_, i) => makeSubDestination(`Place ${i}`));
			delete (cards[2] as any).validatedImages;

			await expect(tool.execute("t7", { subDestinations: cards })).rejects.toThrow(/validatedImages/);
		});
	});

	describe("advance_checklist", () => {
		it("should fail when mandatory prefs are missing", async () => {
			const tool = createAdvanceChecklistTool(makeDeps());
			await expect(tool.execute("t1", {})).rejects.toThrow("mandatory preferences still missing");
		});

		it("should advance when mandatory prefs are filled", async () => {
			fillMandatoryPreferences();
			const tool = createAdvanceChecklistTool(makeDeps());
			const result = await tool.execute("t2", {});

			expect(result.details.previousPhase).toBe("gather_preferences");
			expect(result.details.newActivePhase).toBe("shortlist_destinations");
			expect(state.checklist.activePhaseIndex).toBe(1);
		});

		it("should fail when shortlist has no destinations", async () => {
			fillMandatoryPreferences();
			state.checklist = advanceChecklist(state.checklist); // move to shortlist
			const tool = createAdvanceChecklistTool(makeDeps());
			await expect(tool.execute("t3", {})).rejects.toThrow("no destinations have been researched");
		});

		it("should persist after advancing", async () => {
			fillMandatoryPreferences();
			const tool = createAdvanceChecklistTool(makeDeps());
			await tool.execute("t4", {});

			const loaded = loadTravelState("tool-test", persistOpts);
			expect(loaded!.checklist.phases[0].status).toBe("done");
			expect(loaded!.checklist.phases[1].status).toBe("active");
		});
	});

	describe("go_back_to_phase", () => {
		it("should go back and invalidate downstream", async () => {
			// Advance to phase 3
			fillMandatoryPreferences();
			state.checklist = advanceChecklist(state.checklist);
			state.destinationResearch = makeMinimalResearch();
			state.checklist = advanceChecklist(state.checklist);
			state.selectedDestinations = [{ name: "X", type: "area", description: "", reviews: {}, sources: [] }];
			state.checklist = advanceChecklist(state.checklist); // now at phase 3

			const tool = createGoBackTool(makeDeps());
			const result = await tool.execute("t1", {
				phase_id: "shortlist_destinations",
				reason: "User wants different destinations",
			});

			expect(result.details.targetPhase).toBe("shortlist_destinations");
			expect(result.details.invalidatedPhases).toContain("select_destinations");
			expect(result.details.invalidatedPhases).toContain("research_experiences");
			expect(state.checklist.activePhaseIndex).toBe(1);
			expect(state.destinationResearch).toBeNull();
			expect(state.selectedDestinations).toEqual([]);
		});

		it("should throw when trying to go forward", async () => {
			const tool = createGoBackTool(makeDeps());
			await expect(tool.execute("t2", { phase_id: "shortlist_destinations", reason: "test" })).rejects.toThrow(
				"Can only go back",
			);
		});

		it("should persist after going back", async () => {
			fillMandatoryPreferences();
			state.checklist = advanceChecklist(state.checklist);
			state.destinationResearch = makeMinimalResearch();
			state.checklist = advanceChecklist(state.checklist);

			const tool = createGoBackTool(makeDeps());
			await tool.execute("t3", {
				phase_id: "gather_preferences",
				reason: "Change prefs",
			});

			const loaded = loadTravelState("tool-test", persistOpts);
			expect(loaded!.checklist.phases[0].status).toBe("active");
			expect(loaded!.checklist.phases[1].status).toBe("invalidated");
		});
	});

	function fillMandatoryPreferences(): void {
		state.preferences = {
			destination: "Tokyo",
			origin: "NYC",
			from_date: "2026-06-01",
			to_date: "2026-06-10",
			num_nights: 9,
			group_size: 2,
			group_type: "couple",
			budget: { amount: 5000, currency: "USD", category: "mid-range" },
		};
	}

	function makeMinimalResearch() {
		return {
			destination: {
				title: "T",
				name: "Tokyo",
				description: "d",
				bestTimeToVisit: "Spring",
				reviews: {},
				sources: [],
			},
			subDestinations: [{ name: "Shibuya", type: "area", description: "d", reviews: {}, sources: [] }],
			overallSummary: "s",
			tripHighlights: ["a"],
			travelTips: ["b"],
			preferencesUsed: { themes: ["cultural"], groupType: "couple" },
		};
	}

	function makeSubDestination(name: string) {
		return {
			name,
			type: "place",
			description: `Description of ${name} for trip planning purposes.`,
			bestFor: "best for cultural exploration and local cuisine experiences",
			why: `${name} is an excellent choice for travelers seeking authentic cultural experiences`,
			roughDays: "2 to 3 days recommended for a thorough visit",
			logisticsFit: "Well connected by train and bus routes from major hubs",
			budgetFit: "Fits a mid-range budget comfortably with good value options",
			seasonNote: "Good weather with occasional afternoon rain showers",
			tradeoff: "Can be very crowded during peak tourist season months",
			imageQuery: `${name} travel highlights`,
			imageLinks: [`https://example.com/images/${encodeURIComponent(name)}.jpg`],
			validatedImages: [
				{
					kind: "image",
					url: `https://example.com/images/${encodeURIComponent(name)}.jpg`,
					finalUrl: `https://example.com/images/${encodeURIComponent(name)}.jpg`,
					provider: "searxng",
					retrievedAt: "2026-06-22T00:00:00.000Z",
					validatedAt: "2026-06-22T00:00:01.000Z",
					httpStatus: 200,
					contentType: "image/jpeg",
					width: 1280,
					height: 720,
					validationStatus: "valid",
				},
			],
			reviews: { rating: 4.5, reviewSummary: "Highly rated by visitors", sources: [] },
			sources: [],
		};
	}

	function makeActivity(name: string, location: string, overrides: Record<string, unknown> = {}) {
		return {
			name,
			type: "food culture history experience",
			description: `${name} is a Tokyo cultural food experience with historic neighborhoods, local cuisine, easy transit access, and a realistic pace for the trip.`,
			location,
			estimatedDurationHours: 3,
			estimatedCost: 45,
			reviews: { rating: 4.6, reviewSummary: "Well reviewed by travelers", sources: [] },
			suitableForGroups: ["couple"],
			themes: ["food", "culture", "history"],
			tips: "Book an early morning slot in April because peak-season crowds and queues can eat into the 9-night trip pace.",
			bestTimeToVisit: "Morning in April for lighter crowds and manageable queues.",
			sources: ["https://example.com/activity"],
			...overrides,
		};
	}
});
