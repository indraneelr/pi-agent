import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	advanceChecklist,
	type ChecklistPhaseConfig,
	createChecklist,
	formatChecklist,
	getActivePhase,
	getMandatoryPendingPreferences,
	goBackToPhase,
	isComplete,
	loadChecklistConfig,
} from "../src/core/checklist.js";

const TEST_DIR = join(tmpdir(), `travel-checklist-test-${Date.now()}`);

const SAMPLE_CONFIG: ChecklistPhaseConfig[] = [
	{ id: "gather_preferences", label: "Gather Preferences", description: "Collect travel requirements" },
	{ id: "shortlist_destinations", label: "Shortlist Destinations", description: "Research 8-10 destinations" },
	{ id: "select_destinations", label: "Select Destinations", description: "Let user choose" },
	{ id: "research_experiences", label: "Research Experiences", description: "Find activities" },
	{ id: "plan_itinerary", label: "Plan Itinerary", description: "Build daily plan" },
	{
		id: "research_accommodation_flights",
		label: "Research Accommodation & Flights",
		description: "Find hotels and flights",
	},
	{ id: "final_plan", label: "Final Plan", description: "Present complete plan" },
];

describe("Checklist", () => {
	beforeAll(() => {
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterAll(() => {
		try {
			rmSync(TEST_DIR, { recursive: true, force: true });
		} catch {}
	});

	describe("loadChecklistConfig", () => {
		it("should load config from a JSON file", () => {
			const configPath = join(TEST_DIR, "checklist.json");
			writeFileSync(configPath, JSON.stringify(SAMPLE_CONFIG));

			const config = loadChecklistConfig(configPath);
			expect(config).toHaveLength(7);
			expect(config[0].id).toBe("gather_preferences");
			expect(config[6].id).toBe("final_plan");
		});

		it("should reject empty config", () => {
			const configPath = join(TEST_DIR, "empty.json");
			writeFileSync(configPath, "[]");

			expect(() => loadChecklistConfig(configPath)).toThrow("non-empty array");
		});

		it("should reject duplicate ids", () => {
			const configPath = join(TEST_DIR, "dup.json");
			const dup = [SAMPLE_CONFIG[0], SAMPLE_CONFIG[0]];
			writeFileSync(configPath, JSON.stringify(dup));

			expect(() => loadChecklistConfig(configPath)).toThrow("Duplicate phase id");
		});

		it("should reject phases missing required fields", () => {
			const configPath = join(TEST_DIR, "invalid.json");
			writeFileSync(configPath, JSON.stringify([{ id: "x" }]));

			expect(() => loadChecklistConfig(configPath)).toThrow("Invalid phase config");
		});
	});

	describe("createChecklist", () => {
		it("should create checklist with first phase active", () => {
			const checklist = createChecklist(SAMPLE_CONFIG);
			expect(checklist.phases).toHaveLength(7);
			expect(checklist.activePhaseIndex).toBe(0);
			expect(checklist.phases[0].status).toBe("active");
			expect(checklist.phases[1].status).toBe("pending");
			expect(checklist.phases[6].status).toBe("pending");
		});
	});

	describe("getActivePhase", () => {
		it("should return the active phase", () => {
			const checklist = createChecklist(SAMPLE_CONFIG);
			const active = getActivePhase(checklist);
			expect(active).not.toBeNull();
			expect(active!.id).toBe("gather_preferences");
		});

		it("should return null when all phases are done", () => {
			let checklist = createChecklist(SAMPLE_CONFIG);
			for (let i = 0; i < SAMPLE_CONFIG.length; i++) {
				checklist = advanceChecklist(checklist);
			}
			expect(getActivePhase(checklist)).toBeNull();
		});
	});

	describe("advanceChecklist", () => {
		it("should advance from first to second phase", () => {
			const checklist = createChecklist(SAMPLE_CONFIG);
			const advanced = advanceChecklist(checklist);

			expect(advanced.activePhaseIndex).toBe(1);
			expect(advanced.phases[0].status).toBe("done");
			expect(advanced.phases[1].status).toBe("active");
			expect(advanced.phases[2].status).toBe("pending");
		});

		it("should advance through all phases sequentially", () => {
			let checklist = createChecklist(SAMPLE_CONFIG);
			for (let i = 0; i < SAMPLE_CONFIG.length; i++) {
				expect(checklist.phases[i].status).toBe("active");
				checklist = advanceChecklist(checklist);
				expect(checklist.phases[i].status).toBe("done");
			}
			expect(isComplete(checklist)).toBe(true);
		});

		it("should throw when no active phase", () => {
			let checklist = createChecklist(SAMPLE_CONFIG);
			for (let i = 0; i < SAMPLE_CONFIG.length; i++) {
				checklist = advanceChecklist(checklist);
			}
			expect(() => advanceChecklist(checklist)).toThrow("No active phase");
		});
	});

	describe("goBackToPhase", () => {
		it("should go back to a previous phase and invalidate downstream", () => {
			let checklist = createChecklist(SAMPLE_CONFIG);
			checklist = advanceChecklist(checklist); // 0 done, 1 active
			checklist = advanceChecklist(checklist); // 0,1 done, 2 active
			checklist = advanceChecklist(checklist); // 0,1,2 done, 3 active

			const goBack = goBackToPhase(checklist, "shortlist_destinations");
			expect(goBack.activePhaseIndex).toBe(1);
			expect(goBack.phases[0].status).toBe("done");
			expect(goBack.phases[1].status).toBe("active");
			expect(goBack.phases[2].status).toBe("invalidated");
			expect(goBack.phases[3].status).toBe("invalidated");
			expect(goBack.phases[4].status).toBe("invalidated");
		});

		it("should throw when going to a non-existent phase", () => {
			const checklist = createChecklist(SAMPLE_CONFIG);
			expect(() => goBackToPhase(checklist, "nonexistent")).toThrow("Phase not found");
		});

		it("should throw when going forward instead of back", () => {
			const checklist = createChecklist(SAMPLE_CONFIG);
			expect(() => goBackToPhase(checklist, "select_destinations")).toThrow("Can only go back");
		});

		it("should preserve phases before the target", () => {
			let checklist = createChecklist(SAMPLE_CONFIG);
			checklist = advanceChecklist(checklist);
			checklist = advanceChecklist(checklist);
			checklist = advanceChecklist(checklist);
			checklist = advanceChecklist(checklist); // 0,1,2,3 done, 4 active

			const goBack = goBackToPhase(checklist, "select_destinations");
			expect(goBack.phases[0].status).toBe("done");
			expect(goBack.phases[1].status).toBe("done");
			expect(goBack.phases[2].status).toBe("active");
			expect(goBack.phases[3].status).toBe("invalidated");
			expect(goBack.phases[4].status).toBe("invalidated");
		});
	});

	describe("isComplete", () => {
		it("should return false for fresh checklist", () => {
			expect(isComplete(createChecklist(SAMPLE_CONFIG))).toBe(false);
		});

		it("should return true when all phases are done", () => {
			let checklist = createChecklist(SAMPLE_CONFIG);
			for (let i = 0; i < SAMPLE_CONFIG.length; i++) {
				checklist = advanceChecklist(checklist);
			}
			expect(isComplete(checklist)).toBe(true);
		});
	});

	describe("formatChecklist", () => {
		it("should format with correct status indicators", () => {
			let checklist = createChecklist(SAMPLE_CONFIG);
			checklist = advanceChecklist(checklist);
			checklist = advanceChecklist(checklist);
			// 0,1 done, 2 active, rest pending

			const formatted = formatChecklist(checklist);
			expect(formatted).toContain("[x] 1.");
			expect(formatted).toContain("[x] 2.");
			expect(formatted).toContain("[>] 3.");
			expect(formatted).toContain("[ ] 4.");
		});

		it("should show invalidated indicator", () => {
			let checklist = createChecklist(SAMPLE_CONFIG);
			checklist = advanceChecklist(checklist);
			checklist = advanceChecklist(checklist);
			checklist = advanceChecklist(checklist);
			checklist = goBackToPhase(checklist, "shortlist_destinations");

			const formatted = formatChecklist(checklist);
			expect(formatted).toContain("[!]");
		});
	});

	describe("getMandatoryPendingPreferences", () => {
		it("should return all fields when prefs are empty", () => {
			const pending = getMandatoryPendingPreferences({});
			expect(pending).toHaveLength(8);
			expect(pending).toContain("destination");
			expect(pending).toContain("budget");
		});

		it("should return empty array when all mandatory fields are filled", () => {
			const prefs = {
				destination: "Tokyo",
				origin: "NYC",
				from_date: "2026-06-01",
				to_date: "2026-06-10",
				num_nights: 9,
				group_size: 2,
				group_type: "couple",
				budget: { amount: 5000, currency: "USD", category: "mid-range" },
			};
			expect(getMandatoryPendingPreferences(prefs)).toHaveLength(0);
		});

		it("should detect empty string fields as pending", () => {
			const prefs = {
				destination: "",
				origin: "NYC",
				from_date: "2026-06-01",
				to_date: "2026-06-10",
				num_nights: 9,
				group_size: 2,
				group_type: "couple",
				budget: { amount: 5000, currency: "USD", category: "mid-range" },
			};
			const pending = getMandatoryPendingPreferences(prefs);
			expect(pending).toEqual(["destination"]);
		});
	});
});
