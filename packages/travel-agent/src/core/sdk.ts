/**
 * Travel Agent SDK
 *
 * Creates an Agent wired up with travel tools, search providers, and session persistence.
 * This is the main entry point for programmatic usage.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, type AgentMessage, type ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Message, Model } from "@mariozechner/pi-ai";
import { loadChecklistConfig } from "./checklist.js";
import { loadTravelState, type PersistenceOptions, saveTravelState } from "./persistence.js";
import type { SearchProvider } from "./search/types.js";
import { createTravelState, type TravelState } from "./state.js";
import { buildTravelSystemPrompt, type TravelSystemPromptOptions } from "./system-prompt.js";
import { createTravelTools } from "./tools/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CHECKLIST_CONFIG = join(__dirname, "..", "..", "checklist-config.json");

// =============================================================================
// Options & Session
// =============================================================================

export interface CreateTravelSessionOptions {
	/** LLM model to use. */
	model: Model<any>;
	/** Thinking level. Default: "medium" */
	thinkingLevel?: ThinkingLevel;
	/** API key for the model provider. */
	apiKey?: string;
	/** Session ID for persistence. */
	sessionId: string;
	/** Search provider (auto-detected from env if not provided). */
	searchProvider: SearchProvider;
	/** Persistence directory. Default: ./travel-data */
	dataDir?: string;
	/** Path to checklist config JSON. Default: built-in checklist-config.json */
	checklistConfigPath?: string;
	/** System prompt options. */
	promptOptions?: TravelSystemPromptOptions;
}

export interface TravelSession {
	/** The underlying Agent instance. */
	agent: Agent;
	/** Current travel state. */
	state: TravelState;
	/** Shut down the session. */
	shutdown(): Promise<void>;
}

// =============================================================================
// Session Creation
// =============================================================================

/**
 * Create a travel agent session.
 *
 * Loads or creates travel state from disk (resume support).
 * Wires up tools, search provider, and dynamic system prompt.
 */
export async function createTravelSession(options: CreateTravelSessionOptions): Promise<TravelSession> {
	const persistOpts: PersistenceOptions = {
		dataDir: options.dataDir ?? join(process.cwd(), "travel-data"),
	};

	// Load checklist config
	const configPath = options.checklistConfigPath ?? DEFAULT_CHECKLIST_CONFIG;
	const checklistConfig = loadChecklistConfig(configPath);

	// Load or create state
	let state = loadTravelState(options.sessionId, persistOpts) ?? createTravelState(options.sessionId, checklistConfig);

	// Mutable reference for tools
	const stateRef = {
		get: () => state,
		set: (s: TravelState) => {
			state = s;
		},
	};

	const tools = createTravelTools({
		getState: stateRef.get,
		setState: stateRef.set,
		searchProvider: options.searchProvider,
		persistOpts,
		model: options.model,
		getApiKey: options.apiKey ? () => options.apiKey as string : undefined,
	});

	// Build initial system prompt
	const systemPrompt = buildTravelSystemPrompt(state, options.promptOptions);

	// Create agent
	const agent = new Agent({
		initialState: {
			systemPrompt,
			model: options.model,
			thinkingLevel: options.thinkingLevel ?? "medium",
			tools,
		},
		convertToLlm: (messages: AgentMessage[]): Message[] => {
			return messages.filter(
				(m): m is Message => m.role === "user" || m.role === "assistant" || m.role === "toolResult",
			);
		},
		transformContext: async (messages: AgentMessage[]) => {
			// Rebuild system prompt with latest state before each LLM turn
			agent.state.systemPrompt = buildTravelSystemPrompt(stateRef.get(), options.promptOptions);
			return messages;
		},
		...(options.apiKey ? { getApiKey: () => options.apiKey } : {}),
	});

	// Save initial state
	saveTravelState(state, persistOpts);

	return {
		agent,
		get state() {
			return stateRef.get();
		},
		async shutdown() {
			// Save final state before shutdown
			saveTravelState(stateRef.get(), persistOpts);
			agent.abort();
			await agent.waitForIdle();
		},
	};
}
