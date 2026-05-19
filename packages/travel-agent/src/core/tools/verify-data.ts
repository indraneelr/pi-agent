import { Agent, type AgentMessage, type AgentTool, type AgentToolResult } from "@mariozechner/pi-agent-core";
import type { Message, Model } from "@mariozechner/pi-ai";
import { type Static, Type } from "@sinclair/typebox";
import type { SearchProvider } from "../search/types.js";
import { createWebSearchTool } from "./web-search.js";

const verifyDataSchema = Type.Object({
	data: Type.Any({ description: "The JSON data object to verify." }),
	contextDescription: Type.String({
		description: "Description of what this data is (e.g., 'destination research', 'flight options')",
	}),
});

type VerifyDataInput = Static<typeof verifyDataSchema>;

export interface VerifyDataDeps {
	model: Model<any>;
	getApiKey?: () => string;
	searchProvider: SearchProvider;
}

export function createVerifyDataTool(deps: VerifyDataDeps): AgentTool<typeof verifyDataSchema, any> {
	return {
		name: "verify_research_data",
		label: "Verify Research Data",
		description:
			"A sub-agent tool to verify research data before saving it. Use this tool after researching destinations, activities, itineraries, accommodations, and flights. It checks the live web to ensure links, costs, times, and availability are accurate.",
		parameters: verifyDataSchema,
		async execute(_toolCallId: string, params: VerifyDataInput): Promise<AgentToolResult<any>> {
			const systemPrompt = `You are a strict verification sub-agent. Your task is to verify the following ${params.contextDescription} data.
You MUST use the web_search tool to check the live web for:
- Validity of all URLs (image links, booking links, source links)
- Accuracy of all costs/prices
- Accuracy of all times/durations
- Availability

If any information is incorrect, hallucinated, or broken, fix it. If you cannot find the exact price, state that it is an estimate or unknown.
Once you have fully verified the data, you MUST return the corrected data inside a single JSON code block like this:
\`\`\`json
{ ... }
\`\`\`
Do not include any conversational text outside the JSON block.`;

			const subAgent = new Agent({
				initialState: {
					model: deps.model,
					systemPrompt,
					tools: [createWebSearchTool(deps.searchProvider)],
					thinkingLevel: "low",
				},
				convertToLlm: (messages: AgentMessage[]): Message[] => {
					return messages.filter(
						(m): m is Message => m.role === "user" || m.role === "assistant" || m.role === "toolResult",
					);
				},
				...(deps.getApiKey ? { getApiKey: deps.getApiKey } : {}),
			});

			try {
				await subAgent.prompt(`Verify this data:\n\`\`\`json\n${JSON.stringify(params.data, null, 2)}\n\`\`\``);

				// Find the last assistant message
				const lastMessage = subAgent.state.messages[subAgent.state.messages.length - 1];
				if (lastMessage?.role !== "assistant") {
					throw new Error("Sub-agent did not return an assistant message.");
				}

				const textContent = lastMessage.content
					.filter((c): c is { type: "text"; text: string } => c.type === "text")
					.map((c) => c.text)
					.join("\n");

				// Extract JSON block
				const jsonMatch = textContent.match(/```json\n([\s\S]*?)\n```/);
				let correctedData: any = params.data;

				if (jsonMatch?.[1]) {
					try {
						correctedData = JSON.parse(jsonMatch[1]);
					} catch (e) {
						console.error("Sub-agent returned invalid JSON", e);
						// Fallback to original data if JSON is malformed
					}
				} else {
					// Fallback to original data if no JSON block is found
					console.error("Sub-agent did not return a JSON block.");
				}

				await subAgent.abort();

				return {
					content: [{ type: "text", text: JSON.stringify(correctedData) }],
					details: correctedData,
				};
			} catch (err) {
				await subAgent.abort();
				return {
					content: [
						{
							type: "text",
							text: `Verification failed: ${err instanceof Error ? err.message : String(err)}. Falling back to original data.`,
						},
					],
					details: params.data,
				};
			}
		},
	};
}
