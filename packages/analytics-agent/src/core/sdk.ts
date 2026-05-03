/**
 * Analytics Agent SDK
 *
 * Creates an Agent wired up with the Python runtime and analytics tools.
 * This is the main entry point for programmatic usage.
 */

import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, type AgentMessage, type ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Message, Model } from "@mariozechner/pi-ai";
import { PythonRuntime, type PythonRuntimeOptions } from "./python-runtime.js";
import { type AnalyticsSystemPromptOptions, buildAnalyticsSystemPrompt } from "./system-prompt.js";
import { createAnalyticsTools } from "./tools/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = join(__dirname, "..", "..", "analytics-agent.log");

function log(message: string): void {
	const timestamp = new Date().toISOString();
	try {
		appendFileSync(LOG_FILE, `[${timestamp}] [sdk] ${message}\n`);
	} catch {
		// ignore
	}
}

export interface CreateAnalyticsSessionOptions {
	/** LLM model to use. */
	model: Model<any>;
	/** Thinking level. Default: "medium" */
	thinkingLevel?: ThinkingLevel;
	/** API key for the model provider. */
	apiKey?: string;
	/** Python runtime options (python path, timeout, etc.) */
	pythonOptions?: PythonRuntimeOptions;
	/** System prompt options (guidelines, context files, etc.) */
	promptOptions?: AnalyticsSystemPromptOptions;
	/** Additional tools to register alongside analytics tools. */
	additionalTools?: Agent["state"]["tools"];
	/** Working directory. Default: process.cwd() */
	cwd?: string;
}

export interface AnalyticsSession {
	/** The underlying Agent instance. */
	agent: Agent;
	/** The Python runtime managing DataFrames. */
	runtime: PythonRuntime;
	/** Shut down the session (agent + Python runtime). */
	shutdown(): Promise<void>;
}

/**
 * Create an analytics agent session.
 *
 * @example
 * ```typescript
 * import { createAnalyticsSession } from "@mariozechner/pi-analytics-agent";
 * import { getModel } from "@mariozechner/pi-ai";
 *
 * const session = await createAnalyticsSession({
 *   model: getModel("anthropic", "claude-sonnet-4-20250514"),
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 * });
 *
 * session.agent.subscribe((event) => {
 *   if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
 *     process.stdout.write(event.assistantMessageEvent.delta);
 *   }
 * });
 *
 * await session.agent.prompt("Load sales.csv and show me monthly revenue trends");
 * await session.shutdown();
 * ```
 */
export async function createAnalyticsSession(options: CreateAnalyticsSessionOptions): Promise<AnalyticsSession> {
	const cwd = options.cwd ?? process.cwd();
	log(`createAnalyticsSession called, cwd=${cwd}`);
	log(
		`Model: ${options.model ? `id=${options.model.id}, api=${options.model.api}, provider=${options.model.provider}` : "undefined!"}`,
	);
	log(`API key provided: ${options.apiKey ? "yes" : "no"}`);

	// Start Python runtime
	log("Starting Python runtime...");
	const runtime = new PythonRuntime(options.pythonOptions);
	await runtime.start();
	log("Python runtime ready");

	// Create analytics tools
	log("Creating analytics tools...");
	const analyticsTools = createAnalyticsTools(runtime, cwd);
	const allTools = [...analyticsTools, ...(options.additionalTools ?? [])];
	log(`Created ${allTools.length} tools`);

	// Build system prompt
	log("Building system prompt...");
	const systemPrompt = buildAnalyticsSystemPrompt({
		...options.promptOptions,
		cwd,
	});
	log(`System prompt length: ${systemPrompt.length} chars`);

	// Create agent
	log("Creating Agent instance...");
	const agent = new Agent({
		initialState: {
			systemPrompt,
			model: options.model,
			thinkingLevel: options.thinkingLevel ?? "medium",
			tools: allTools,
		},
		convertToLlm: (messages: AgentMessage[]): Message[] => {
			return messages.filter(
				(m): m is Message => m.role === "user" || m.role === "assistant" || m.role === "toolResult",
			);
		},
		...(options.apiKey ? { getApiKey: () => options.apiKey } : {}),
	});
	log("Agent created successfully");

	return {
		agent,
		runtime,
		async shutdown() {
			agent.abort();
			await agent.waitForIdle();
			await runtime.shutdown();
		},
	};
}
