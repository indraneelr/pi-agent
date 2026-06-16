import { afterEach, describe, expect, test, vi } from "vitest";
import { createTravelSession, getTravelSession, sendTravelMessage } from "../src/api.js";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("travel API client", () => {
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
