import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChecklistPhaseConfig } from "../src/core/checklist.js";
import { deleteTravelState, loadTravelState, saveTravelState } from "../src/core/persistence.js";
import { createTravelState } from "../src/core/state.js";

const TEST_DIR = join(tmpdir(), `travel-persistence-test-${Date.now()}`);

const SAMPLE_CONFIG: ChecklistPhaseConfig[] = [
	{ id: "gather_preferences", label: "Gather", description: "Collect" },
	{ id: "shortlist_destinations", label: "Shortlist", description: "Research" },
	{ id: "final_plan", label: "Final", description: "Done" },
];

describe("Persistence", () => {
	beforeAll(() => {
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterAll(() => {
		try {
			rmSync(TEST_DIR, { recursive: true, force: true });
		} catch {}
	});

	it("should save and load state round-trip", () => {
		const state = createTravelState("test-session-1", SAMPLE_CONFIG);
		state.preferences = { destination: "Tokyo", origin: "NYC", num_nights: 7 };

		saveTravelState(state, { dataDir: TEST_DIR });
		const loaded = loadTravelState("test-session-1", { dataDir: TEST_DIR });

		expect(loaded).not.toBeNull();
		expect(loaded!.sessionId).toBe("test-session-1");
		expect(loaded!.preferences.destination).toBe("Tokyo");
		expect(loaded!.preferences.num_nights).toBe(7);
		expect(loaded!.checklist.phases).toHaveLength(3);
	});

	it("should return null for non-existent session", () => {
		const loaded = loadTravelState("nonexistent", { dataDir: TEST_DIR });
		expect(loaded).toBeNull();
	});

	it("should delete saved state", () => {
		const state = createTravelState("to-delete", SAMPLE_CONFIG);
		saveTravelState(state, { dataDir: TEST_DIR });

		expect(loadTravelState("to-delete", { dataDir: TEST_DIR })).not.toBeNull();

		deleteTravelState("to-delete", { dataDir: TEST_DIR });
		expect(loadTravelState("to-delete", { dataDir: TEST_DIR })).toBeNull();
	});

	it("should handle delete of non-existent session gracefully", () => {
		expect(() => deleteTravelState("never-existed", { dataDir: TEST_DIR })).not.toThrow();
	});

	it("should create dataDir if it does not exist", () => {
		const subDir = join(TEST_DIR, "sub", "nested");
		const state = createTravelState("nested-session", SAMPLE_CONFIG);

		saveTravelState(state, { dataDir: subDir });
		expect(existsSync(subDir)).toBe(true);

		const loaded = loadTravelState("nested-session", { dataDir: subDir });
		expect(loaded!.sessionId).toBe("nested-session");
	});

	it("should sanitize session id for filenames", () => {
		const state = createTravelState("bad/session:id", SAMPLE_CONFIG);
		saveTravelState(state, { dataDir: TEST_DIR });

		// Should be stored with sanitized filename
		const loaded = loadTravelState("bad/session:id", { dataDir: TEST_DIR });
		expect(loaded!.sessionId).toBe("bad/session:id");
	});

	it("should overwrite existing state on save", () => {
		const state = createTravelState("overwrite-test", SAMPLE_CONFIG);
		state.preferences = { destination: "Tokyo" };
		saveTravelState(state, { dataDir: TEST_DIR });

		state.preferences = { destination: "Paris" };
		saveTravelState(state, { dataDir: TEST_DIR });

		const loaded = loadTravelState("overwrite-test", { dataDir: TEST_DIR });
		expect(loaded!.preferences.destination).toBe("Paris");
	});
});
