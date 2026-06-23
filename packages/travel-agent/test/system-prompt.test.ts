import { describe, expect, it } from "vitest";
import type { ChecklistPhaseConfig } from "../src/core/checklist.js";
import { createTravelState } from "../src/core/state.js";
import { buildTravelSystemPrompt } from "../src/core/system-prompt.js";

const checklist: ChecklistPhaseConfig[] = [
	{ id: "gather_preferences", label: "Preferences", description: "" },
	{ id: "shortlist_destinations", label: "Shortlist", description: "" },
	{ id: "research_experiences", label: "Activities", description: "" },
	{ id: "plan_itinerary", label: "Itinerary", description: "" },
	{ id: "final_plan", label: "Final", description: "" },
];

describe("travel system prompt image rendering rules", () => {
	it("forbids Markdown images in final-plan prose", () => {
		const state = createTravelState("s1", checklist);
		state.checklist.activePhaseIndex = 4;
		const prompt = buildTravelSystemPrompt(state);

		expect(prompt).toContain("Never include Markdown image syntax");
		expect(prompt).toContain("images are rendered only by validated UI galleries");
		expect(prompt).not.toContain("render the image links using Markdown syntax");
	});

	it("treats image URLs as structured state only, not conversational Markdown", () => {
		const state = createTravelState("s1", checklist);
		state.checklist.activePhaseIndex = 1;
		const prompt = buildTravelSystemPrompt(state);

		expect(prompt).toContain("Never place image URLs in conversational Markdown");
		expect(prompt).toContain("Do not include image Markdown in your user-facing prose");
		expect(prompt).not.toContain("Include source URLs and image URLs when available");
	});
});
