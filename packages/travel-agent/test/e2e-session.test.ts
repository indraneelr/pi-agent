/**
 * End-to-end test for createTravelSession.
 *
 * Uses the faux provider from pi-ai to simulate LLM responses,
 * verifying the full agent loop: prompt -> tool calls -> state updates -> response.
 */

import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxText, fauxToolCall, registerFauxProvider } from "@mariozechner/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import { createTravelSession, type TravelSession } from "../src/core/sdk.js";
import type { SearchProvider, SearchResult } from "../src/core/search/types.js";

const TEST_DIR = join(tmpdir(), `travel-e2e-test-${Date.now()}`);
const TEST_TIMEOUT = 30_000;

/** Fake search provider that returns canned results. */
function createFakeSearchProvider(): SearchProvider {
	return {
		name: "fake",
		async search(query: string): Promise<SearchResult[]> {
			return [
				{ title: `Result for: ${query}`, url: "https://example.com", snippet: `Info about ${query}` },
				{ title: `More about: ${query}`, url: "https://example.com/2", snippet: `Details on ${query}` },
			];
		},
	};
}

describe("Travel Session E2E", () => {
	let session: TravelSession | null = null;

	afterEach(async () => {
		if (session) {
			await session.shutdown();
			session = null;
		}
		try {
			rmSync(TEST_DIR, { recursive: true, force: true });
		} catch {}
	});

	it("should gather preferences and advance checklist", { timeout: TEST_TIMEOUT }, async () => {
		const faux = registerFauxProvider();
		const model = faux.getModel();

		// 1. LLM responds by saving preferences
		faux.setResponses([
			fauxAssistantMessage(
				[
					fauxToolCall("update_travel_state", {
						field: "preferences",
						data: {
							destination: "Tokyo",
							origin: "New York",
							from_date: "2026-07-01",
							to_date: "2026-07-10",
							num_nights: 9,
							group_size: 2,
							group_type: "couple",
							budget: { amount: 5000, currency: "USD", category: "mid-range" },
						},
					}),
				],
				{ stopReason: "toolUse" },
			),
		]);

		session = await createTravelSession({
			model,
			thinkingLevel: "off",
			sessionId: "e2e-test-1",
			searchProvider: createFakeSearchProvider(),
			dataDir: TEST_DIR,
		});

		// 2. After saving prefs, LLM advances the checklist
		faux.appendResponses([fauxAssistantMessage([fauxToolCall("advance_checklist", {})], { stopReason: "toolUse" })]);

		// 3. Final text
		faux.appendResponses([
			fauxAssistantMessage([
				fauxText("Great! I've saved your preferences. Let me now research destinations for you."),
			]),
		]);

		// Collect events
		const events: string[] = [];
		session.agent.subscribe((event) => {
			events.push(event.type);
		});

		await session.agent.prompt("I want to go to Tokyo from New York, July 1-10, couple, $5000 budget");

		// Verify preferences were saved
		expect(session.state.preferences.destination).toBe("Tokyo");
		expect(session.state.preferences.origin).toBe("New York");
		expect(session.state.preferences.budget?.amount).toBe(5000);

		// Verify checklist advanced
		expect(session.state.checklist.phases[0].status).toBe("done");
		expect(session.state.checklist.phases[1].status).toBe("active");
		expect(session.state.checklist.activePhaseIndex).toBe(1);

		// Verify events
		expect(events).toContain("agent_start");
		expect(events).toContain("tool_execution_start");
		expect(events).toContain("tool_execution_end");
		expect(events).toContain("agent_end");

		faux.unregister();
	});

	it("should support go-back and invalidate downstream", { timeout: TEST_TIMEOUT }, async () => {
		const faux = registerFauxProvider();
		const model = faux.getModel();

		session = await createTravelSession({
			model,
			thinkingLevel: "off",
			sessionId: "e2e-test-2",
			searchProvider: createFakeSearchProvider(),
			dataDir: TEST_DIR,
		});

		// Pre-populate state to simulate being at phase 3
		const state = session.state;
		state.preferences = {
			destination: "Tokyo",
			origin: "NYC",
			from_date: "2026-07-01",
			to_date: "2026-07-10",
			num_nights: 9,
			group_size: 2,
			group_type: "couple",
			budget: { amount: 5000, currency: "USD", category: "mid-range" },
		};
		state.destinationResearch = {
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
		state.selectedDestinations = [{ name: "Shibuya", type: "area", description: "d", reviews: {}, sources: [] }];

		// Manually advance checklist to phase 3 (research_experiences)
		const { advanceChecklist } = await import("../src/core/checklist.js");
		state.checklist = advanceChecklist(state.checklist); // -> shortlist
		state.checklist = advanceChecklist(state.checklist); // -> select
		state.checklist = advanceChecklist(state.checklist); // -> experiences

		// 1. LLM goes back to shortlist phase
		faux.setResponses([
			fauxAssistantMessage(
				[
					fauxToolCall("go_back_to_phase", {
						phase_id: "shortlist_destinations",
						reason: "User wants different destinations",
					}),
				],
				{ stopReason: "toolUse" },
			),
		]);

		// 2. Final text
		faux.appendResponses([
			fauxAssistantMessage([
				fauxText(
					"I've gone back to the shortlist phase. Your destination research and selections have been cleared.",
				),
			]),
		]);

		await session.agent.prompt("I want to see different destinations, not Tokyo");

		// Verify go-back happened
		expect(session.state.checklist.activePhaseIndex).toBe(1);
		expect(session.state.checklist.phases[1].status).toBe("active");
		expect(session.state.checklist.phases[2].status).toBe("invalidated");
		expect(session.state.checklist.phases[3].status).toBe("invalidated");

		// Verify downstream data was cleared
		expect(session.state.destinationResearch).toBeNull();
		expect(session.state.selectedDestinations).toEqual([]);

		// Verify upstream data preserved
		expect(session.state.preferences.destination).toBe("Tokyo");

		faux.unregister();
	});
});
