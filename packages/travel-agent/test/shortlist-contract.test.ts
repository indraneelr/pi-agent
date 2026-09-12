import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Value } from "@sinclair/typebox/value";
import { afterEach, expect, test } from "vitest";
import { loadTravelState } from "../src/core/persistence.js";
import { createTravelState } from "../src/core/state.js";
import { createAdvanceChecklistTool } from "../src/core/tools/advance-checklist.js";
import { createSaveDestinationShortlistTool } from "../src/core/tools/save-destination-shortlist.js";
import { createUpdateStateTool } from "../src/core/tools/update-state.js";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function setup() {
	const dataDir = mkdtempSync(join(tmpdir(), "shortlist-contract-"));
	dirs.push(dataDir);
	let state = createTravelState("shortlist-contract", []);
	state.preferences = { destination: "Vietnam", num_nights: 14 };
	return {
		getState: () => state,
		setState: (next: typeof state) => {
			state = next;
		},
		persistOpts: { dataDir },
	};
}

function payload(roughDays: number | string) {
	return {
		subDestinations: [
			"Hoi An",
			"Da Nang",
			"Hue",
			"Nha Trang",
			"Phu Quoc",
			"Ho Chi Minh City",
			"Quy Nhon",
			"Mui Ne",
		].map((name) => ({
			name,
			description: `${name} offers a distinct base for exploring local culture and nearby beaches.`,
			bestFor: "Beach and history visits",
			why: "Matches the family's beach and history interests",
			roughDays,
			logisticsFit: "Allow travel time between regional stops",
			budgetFit: "Local meals suit the budget",
			seasonNote: "Check seasonal rain before booking",
			tradeoff: "Transfers reduce relaxed family time",
			imageLinks: [],
			sources: [],
		})),
	};
}

test.each([2, 1, 0.5, 3.5, "2-3 days", "Half-day visit (0.5 days)"])(
	"both save routes accept and persist roughDays %s",
	async (days) => {
		const deps = setup();
		const tool = createSaveDestinationShortlistTool(deps);
		const data = payload(days);
		expect(Value.Check(tool.parameters, data)).toBe(true);
		await tool.execute("save", data);
		const saved = loadTravelState("shortlist-contract", deps.persistOpts)!;
		expect(saved.destinationResearch?.subDestinations).toHaveLength(8);
		expect(saved.destinationResearch?.subDestinations[0].roughDays).toBe(
			typeof days === "number" ? `${days} ${days === 1 ? "day" : "days"}` : days,
		);
		await createUpdateStateTool(deps).execute("update", { field: "destination_research", data });
		expect(deps.getState().destinationResearch).toEqual(saved.destinationResearch);
		deps.getState().checklist = {
			activePhaseIndex: 0,
			phases: [
				{ id: "shortlist_destinations", label: "Shortlist", description: "", status: "active" },
				{ id: "select_destinations", label: "Select", description: "", status: "pending" },
			],
		};
		await createAdvanceChecklistTool(deps).execute("advance", {});
		expect(deps.getState().checklist.activePhaseIndex).toBe(1);
	},
);

test.each([0, -2, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, true, {}, ""])(
	"rejects invalid duration %s without modifying saved state",
	async (days) => {
		const deps = setup();
		const tool = createSaveDestinationShortlistTool(deps);
		await tool.execute("valid", payload(2));
		const before = structuredClone(deps.getState());
		const data = payload(2);
		Object.assign(data.subDestinations[0], { roughDays: days });
		await expect(
			createUpdateStateTool(deps).execute("invalid", { field: "destination_research", data }),
		).rejects.toThrow("positive number of days");
		expect(deps.getState()).toEqual(before);
	},
);
