import { FinishReason } from "@google/genai";
import { afterEach, expect, test, vi } from "vitest";
import { getModel } from "../src/models.js";
import { streamGoogle } from "../src/providers/google.js";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

test.each([FinishReason.MALFORMED_FUNCTION_CALL, FinishReason.SAFETY, FinishReason.OTHER])(
	"retains Google finish reason %s without exposing raw finish text",
	async (reason) => {
		const chunk = {
			candidates: [
				{
					content: {
						parts: [
							{ text: "Partial answer" },
							...(reason === FinishReason.MALFORMED_FUNCTION_CALL
								? [{ functionCall: { name: "save_destination_shortlist", args: {} } }]
								: []),
						],
					},
					finishReason: reason,
					finishMessage: "sensitive provider payload",
				},
			],
		};
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					new Response(`data: ${JSON.stringify(chunk)}\n\n`, { headers: { "content-type": "text/event-stream" } }),
				),
		);
		const result = await streamGoogle(
			getModel("google", "gemini-2.5-flash"),
			{ messages: [{ role: "user", content: "Test planning response", timestamp: 0 }] },
			{ apiKey: "offline-test" },
		).result();
		expect(result.stopReason).toBe("error");
		expect(result.errorMessage).toBe(`Google generation stopped: ${reason}`);
		expect(result.errorMessage).not.toContain("sensitive");
	},
);
