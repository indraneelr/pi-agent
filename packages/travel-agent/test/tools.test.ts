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
});
