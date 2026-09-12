import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import { createTravelState, type TravelSession } from "@mariozechner/pi-travel-agent";

/** Deterministic browser fixture. Never used by the production entry point. */
export async function createScriptedSession(sessionId: string): Promise<TravelSession> {
	let state = createTravelState(sessionId, [
		{ id: "gather_preferences", label: "Your trip", description: "Choose your places and experiences" },
	]);
	const listeners = new Set<(event: AgentEvent) => void | Promise<void>>();
	let aborted = false;
	const messages: AgentMessage[] = [];
	return {
		get state() {
			return state;
		},
		setState(next) {
			state = next;
		},
		async shutdown() {},
		agent: {
			state: { messages, isStreaming: false },
			subscribe(listener) {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
			abort() {
				aborted = true;
			},
			async waitForIdle() {},
			async prompt(input) {
				aborted = false;
				messages.push({ role: "user", content: input, timestamp: Date.now() });
				for (const listener of listeners)
					await listener({
						type: "tool_execution_start",
						toolCallId: "fixture",
						toolName: "web_search",
						args: { query: "Japan places" },
					});
				await new Promise((resolve) => setTimeout(resolve, input.includes("slow") ? 1500 : 80));
				if (aborted) throw new Error("Stopped");
				let text: string;
				if (!state.destinationResearch) {
					state.preferences = {
						destination: "Japan",
						origin: "Jakarta",
						num_nights: 5,
						group_size: 2,
						group_type: "couple",
						budget: { amount: 2000, currency: "USD", category: "mid-range" },
					};
					state.destinationResearch = {
						destination: {
							title: "Japan",
							name: "Japan",
							description: "",
							bestTimeToVisit: "Autumn",
							reviews: {},
							sources: [],
						},
						overallSummary: "Choose a base for culture and food.",
						tripHighlights: [],
						travelTips: [],
						preferencesUsed: { themes: ["culture"], groupType: "couple" },
						subDestinations: ["Kyoto", "Tokyo"].map((name) => ({
							name,
							type: "city",
							description: `${name} has great food and walkable cultural districts.`,
							why: "Culture and food",
							tradeoff: "Busy around the main sights",
							reviews: {},
							sources: [],
						})),
					};
					text = "Here are your place options. Select Kyoto or Tokyo, then explore activities.";
				} else if (!state.activitiesResearch) {
					state.activitiesResearch = {
						activities: ["Temple walk", "Market tasting", "Garden visit", "Tea workshop", "Riverside dinner"].map(
							(name) => ({
								name,
								type: "Culture",
								location: "Kyoto",
								description: "A relaxed experience with time to explore.",
								estimatedDurationHours: 2,
								estimatedCost: 20,
								tips: "Book ahead during autumn.",
								reviews: {},
								sources: [],
							}),
						),
					};
					text = "These activity options fit your trip. Select your favorites and build the itinerary.";
				} else {
					state.itineraryResearch = {
						description: "Your Kyoto itinerary",
						itinerary: [
							{
								dayNumber: 1,
								date: "2026-11-10",
								place: "Kyoto",
								activities: state.activitiesResearch.activities.map((activity) => ({
									...activity,
									estimatedCost: 20,
								})),
							},
						],
					};
					text = "Your itinerary is ready. Download your plan or ask for a change.";
				}
				for (const listener of listeners)
					await listener({
						type: "tool_execution_end",
						toolCallId: "fixture",
						toolName: "web_search",
						result: {},
						isError: false,
					});
				messages.push({ role: "assistant", content: [{ type: "text", text }] } as AgentMessage);
			},
		},
	};
}
