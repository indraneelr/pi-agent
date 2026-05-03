import { randomUUID } from "node:crypto";
import { getEnvApiKey, getModel } from "@mariozechner/pi-ai";
import { createTravelSession } from "./src/core/sdk.js";
import { detectSearchProvider } from "./src/core/search/index.js";
import { appendFileSync } from "node:fs";

function log(msg: string) {
	const line = `[${new Date().toISOString()}] ${msg}\n`;
	appendFileSync("agent-debug.log", line);
	console.log(msg);
}

async function run() {
	log("Starting debug run...");
	
	const provider = "google";
	const modelId = "gemini-2.5-flash";
	const apiKey = getEnvApiKey(provider);
	
	if (!apiKey) {
		log("No Gemini API key found!");
		return;
	}

	const model = getModel(provider as any, modelId as any);
	const searchProvider = detectSearchProvider();
	if (!searchProvider) {
		log("No search provider");
		return;
	}

	const session = await createTravelSession({
		model: model!,
		apiKey,
		sessionId: "debug-session-" + randomUUID(),
		searchProvider,
	});

	session.agent.subscribe((event) => {
		if (event.type === "message_update") return; // Too noisy
		let msg = `Event: ${event.type}`;
		if (event.type === "tool_execution_start" || event.type === "tool_execution_end") {
			msg += ` | Tool: ${(event as any).toolName}`;
			if (event.type === "tool_execution_end") {
				msg += ` | Error: ${(event as any).isError}`;
			}
		}
		if (event.type === "message_end" || event.type === "message_start") {
			const m = (event as any).message;
			msg += ` | Role: ${m.role}`;
			if (m.role === "assistant") {
				const toolCalls = m.content.filter((c: any) => c.type === "toolCall").map((c: any) => c.name);
				msg += ` | Tools: ${toolCalls.join(", ")}`;
			}
		}
		log(msg);
	});

	log("Sending prompt...");
	try {
		await session.agent.prompt("I want to plan a family trip to Greece with my 4 year old in June. We like history, mythology, and relaxing on beaches. Go through your checklist and do the web research.");
		log("Prompt completed successfully.");
	} catch (err) {
		log(`Error: ${err}`);
	}
}

run();
