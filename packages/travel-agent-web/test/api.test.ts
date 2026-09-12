import { afterEach, describe, expect, test, vi } from "vitest";
import { createTravelSession, getTravelSession, sendTravelMessage, streamTravelMessage } from "../src/api.js";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("travel API client", () => {
	test("rejects a truncated stream instead of silently reporting success", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response('data: {"type":"text_delta","delta":"Partial"}\n\n'),
		);
		await expect(streamTravelMessage("s1", "Plan", () => {})).rejects.toThrow("Connection interrupted");
	});
	test("handles heartbeat frames and a completed stream", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(': heartbeat\n\ndata: {"type":"run_finished","assistantMessage":"Complete"}\n\n'),
		);
		const events: string[] = [];
		await streamTravelMessage("s1", "Plan", (event) => events.push(event.type));
		expect(events).toEqual(["run_finished"]);
	});
	test("creates a session and returns state", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse({ sessionId: "s1", state: { sessionId: "s1" }, uiBlocks: [], conversation: [], status: "idle" }),
		);

		const session = await createTravelSession();

		expect(fetch).toHaveBeenCalledWith("/api/travel/sessions", { method: "POST" });
		expect(session.sessionId).toBe("s1");
	});

	test("loads an existing session", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse({
				sessionId: "s1",
				state: { sessionId: "s1" },
				uiBlocks: [],
				conversation: [{ role: "user", content: "Hi" }],
				status: "idle",
			}),
		);

		const session = await getTravelSession("s1");

		expect(fetch).toHaveBeenCalledWith("/api/travel/sessions/s1");
		expect(session.state.sessionId).toBe("s1");
		expect(session.conversation[0].content).toBe("Hi");
	});

	test("sends a message and returns assistant response", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse({
				sessionId: "s1",
				assistantMessage: "Bonjour",
				state: { sessionId: "s1" },
				uiBlocks: [],
				conversation: [{ role: "assistant", content: "Bonjour" }],
				status: "idle",
			}),
		);

		const response = await sendTravelMessage("s1", "Plan Paris");

		expect(fetch).toHaveBeenCalledWith("/api/travel/sessions/s1/messages", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ message: "Plan Paris" }),
		});
		expect(response.assistantMessage).toBe("Bonjour");
		expect(response.conversation[0].content).toBe("Bonjour");
	});

	test("throws server error messages", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "Unknown model" }, 503));

		await expect(sendTravelMessage("s1", "Plan Paris")).rejects.toThrow("Unknown model");
	});
});

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}
