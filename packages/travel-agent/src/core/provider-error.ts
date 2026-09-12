/** Safe, actionable provider errors. Raw provider payloads never reach the UI. */
export class TravelProviderError extends Error {
	readonly code: "invalid_tool_call" | "blocked_response" | "quota" | "authentication" | "provider_error";

	constructor(detail: string | undefined) {
		let code: TravelProviderError["code"] = "provider_error";
		let message =
			"The AI provider stopped before finishing your plan. Your saved progress is kept. Retry the last message.";
		if (/MALFORMED_FUNCTION_CALL|UNEXPECTED_TOOL_CALL/.test(detail ?? "")) {
			code = "invalid_tool_call";
			message =
				"The AI provider returned an invalid planning action. Your saved progress is kept. Retry the last message.";
		} else if (
			/Google generation stopped: (SAFETY|RECITATION|BLOCKLIST|PROHIBITED_CONTENT|SPII)/.test(detail ?? "")
		) {
			code = "blocked_response";
			message =
				"The AI provider blocked this response. Your saved progress is kept. Try rephrasing your last request.";
		} else if (/\b429\b|RESOURCE_EXHAUSTED|quota exhausted/i.test(detail ?? "")) {
			code = "quota";
			message = "The AI provider's quota or rate limit was reached. Check your provider quota, wait, then retry.";
		} else if (/\b401\b|API_KEY_INVALID|invalid api key/i.test(detail ?? "")) {
			code = "authentication";
			message = "The AI provider rejected your API key. Check it in API key & account, then retry.";
		}
		super(message);
		this.name = "TravelProviderError";
		this.code = code;
	}
}
