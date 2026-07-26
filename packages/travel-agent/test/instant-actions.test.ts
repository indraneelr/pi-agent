import { describe, expect, it } from "vitest";
import { applyInstantAction, InstantActionError } from "../src/core/instant-actions.js";
import { createTravelState, type TravelState } from "../src/core/state.js";

function baseState(): TravelState {
	const state = createTravelState("s1", [{ id: "gather_preferences", label: "Prefs", description: "" }]);
	state.destinationResearch = {
		destination: { name: "Greece" },
		overallSummary: "",
		subDestinations: [
			{ name: "Naxos", type: "island", description: "" },
			{ name: "Milos", type: "island", description: "" },
		],
	} as unknown as TravelState["destinationResearch"];
	state.activitiesResearch = {
		activities: [
			{
				name: "Sea kayaking",
				type: "outdoor",
				description: "",
				location: "Milos",
				estimatedDurationHours: 3,
				reviews: {},
				sources: [],
			},
		],
	} as unknown as TravelState["activitiesResearch"];
	return state;
}

describe("applyInstantAction — places", () => {
	it("selects a place that exists in the shortlist", () => {
		const next = applyInstantAction(baseState(), { type: "select_place", name: "Naxos" });
		expect(next.selectedDestinations.map((p) => p.name)).toEqual(["Naxos"]);
	});

	it("is idempotent and case-insensitive on select", () => {
		let state = applyInstantAction(baseState(), { type: "select_place", name: "naxos" });
		state = applyInstantAction(state, { type: "select_place", name: "NAXOS" });
		expect(state.selectedDestinations).toHaveLength(1);
	});

	it("throws when selecting a place not in the shortlist", () => {
		expect(() => applyInstantAction(baseState(), { type: "select_place", name: "Santorini" })).toThrow(
			InstantActionError,
		);
	});

	it("deselects a selected place", () => {
		let state = applyInstantAction(baseState(), { type: "select_place", name: "Naxos" });
		state = applyInstantAction(state, { type: "deselect_place", name: "Naxos" });
		expect(state.selectedDestinations).toEqual([]);
	});

	it("remove_place drops it from both the shortlist and selections", () => {
		let state = applyInstantAction(baseState(), { type: "select_place", name: "Naxos" });
		state = applyInstantAction(state, { type: "remove_place", name: "Naxos" });
		expect(state.selectedDestinations).toEqual([]);
		expect(state.destinationResearch?.subDestinations.map((p) => p.name)).toEqual(["Milos"]);
	});

	it("does not mutate the input state (pure)", () => {
		const state = baseState();
		applyInstantAction(state, { type: "select_place", name: "Naxos" });
		expect(state.selectedDestinations).toEqual([]);
	});
});

describe("applyInstantAction — activities", () => {
	it("selects an activity that exists", () => {
		const next = applyInstantAction(baseState(), { type: "select_activity", name: "Sea kayaking" });
		expect(next.selectedActivityNames).toEqual(["Sea kayaking"]);
	});

	it("throws when selecting an unknown activity", () => {
		expect(() => applyInstantAction(baseState(), { type: "select_activity", name: "Bungee" })).toThrow(
			InstantActionError,
		);
	});

	it("remove_activity drops it from research and selections", () => {
		let state = applyInstantAction(baseState(), { type: "select_activity", name: "Sea kayaking" });
		state = applyInstantAction(state, { type: "remove_activity", name: "Sea kayaking" });
		expect(state.selectedActivityNames).toEqual([]);
		expect(state.activitiesResearch?.activities).toEqual([]);
	});
});
