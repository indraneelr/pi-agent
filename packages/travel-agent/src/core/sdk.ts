/**
 * Travel Agent SDK
 *
 * Creates an Agent wired up with travel tools, search providers, and session persistence.
 * This is the main entry point for programmatic usage.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type AgentEvent,
	AgentHarness,
	type AgentMessage,
	type JsonlSessionMetadata,
	JsonlSessionRepo,
	type Session,
	type ThinkingLevel,
} from "@mariozechner/pi-agent-core";
import { NodeExecutionEnv } from "@mariozechner/pi-agent-core/node";
import type { ImageContent, Model, TextContent } from "@mariozechner/pi-ai";
import { loadChecklistConfig } from "./checklist.js";
import { cleanDestinationImageLinks } from "./image-validation.js";
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

export interface TravelConversationMessage {
	role: "user" | "assistant";
	content: string;
}

export interface TravelAgentFacadeState {
	messages: AgentMessage[];
	errorMessage?: string;
	isStreaming: boolean;
}

export interface TravelAgentFacade {
	state: TravelAgentFacadeState;
	prompt(input: string, images?: ImageContent[]): Promise<void>;
	subscribe(listener: (event: AgentEvent, signal?: AbortSignal) => Promise<void> | void): () => void;
	abort(): void;
	waitForIdle(): Promise<void>;
}

export interface TravelSession {
	/** Agent-compatible facade backed by AgentHarness + JsonlSessionRepo. */
	agent: TravelAgentFacade;
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
		cleanImageLinks: (cards) => cleanDestinationImageLinks(cards, { refetch: true }),
	});

	const env = new NodeExecutionEnv({ cwd: process.cwd() });
	const session = await openOrCreateHarnessSession(env, persistOpts.dataDir, options.sessionId);

	const harness = new AgentHarness({
		env,
		session,
		model: options.model,
		thinkingLevel: options.thinkingLevel ?? "medium",
		tools,
		systemPrompt: () => buildTravelSystemPrompt(stateRef.get(), options.promptOptions),
		...(options.apiKey ? { getApiKeyAndHeaders: async () => ({ apiKey: options.apiKey as string }) } : {}),
	});
	const agent = await TravelAgentHarnessFacade.create(harness, session);

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

// =============================================================================
// AgentHarness-backed compatibility facade
// =============================================================================

class TravelAgentHarnessFacade implements TravelAgentFacade {
	readonly state: TravelAgentFacadeState;

	private constructor(
		private readonly harness: AgentHarness,
		private readonly harnessSession: Session,
		messages: AgentMessage[],
	) {
		this.state = { messages, isStreaming: false };
		this.harness.subscribe(async (event) => {
			if (event.type === "agent_start") {
				this.state.isStreaming = true;
				this.state.errorMessage = undefined;
			}
			if (event.type === "message_end") {
				this.state.messages = [...this.state.messages, event.message];
			}
			if (event.type === "agent_end") {
				this.state.isStreaming = false;
				await this.refreshMessages();
			}
		});
	}

	static async create(harness: AgentHarness, harnessSession: Session): Promise<TravelAgentHarnessFacade> {
		const context = await harnessSession.buildContext();
		return new TravelAgentHarnessFacade(harness, harnessSession, context.messages);
	}

	async prompt(input: string, images?: ImageContent[]): Promise<void> {
		this.state.errorMessage = undefined;
		try {
			await this.harness.prompt(input, images ? { images } : undefined);
			await this.refreshMessages();
		} catch (e) {
			this.state.errorMessage = e instanceof Error ? e.message : String(e);
			throw e;
		} finally {
			this.state.isStreaming = false;
		}
	}

	subscribe(listener: (event: AgentEvent, signal?: AbortSignal) => Promise<void> | void): () => void {
		return this.harness.subscribe((event, signal) => listener(event as AgentEvent, signal));
	}

	abort(): void {
		void this.harness.abort();
	}

	async waitForIdle(): Promise<void> {
		await this.harness.waitForIdle();
		await this.refreshMessages();
	}

	private async refreshMessages(): Promise<void> {
		const context = await this.harnessSession.buildContext();
		this.state.messages = context.messages;
	}
}

async function openOrCreateHarnessSession(env: NodeExecutionEnv, dataDir: string, sessionId: string): Promise<Session> {
	const existing = await findHarnessSession(env, dataDir, sessionId);
	return existing
		? new JsonlSessionRepo({ fs: env, sessionsRoot: join(dataDir, "sessions") }).open(existing)
		: new JsonlSessionRepo({ fs: env, sessionsRoot: join(dataDir, "sessions") }).create({
				cwd: process.cwd(),
				id: sessionId,
			});
}

async function findHarnessSession(
	env: NodeExecutionEnv,
	dataDir: string,
	sessionId: string,
): Promise<JsonlSessionMetadata | undefined> {
	const repo = new JsonlSessionRepo({ fs: env, sessionsRoot: join(dataDir, "sessions") });
	return (await repo.list({ cwd: process.cwd() })).find((metadata: JsonlSessionMetadata) => metadata.id === sessionId);
}

export function extractTravelConversation(messages: readonly AgentMessage[]): TravelConversationMessage[] {
	const conversation: TravelConversationMessage[] = [];
	for (const message of messages) {
		if (message.role !== "user" && message.role !== "assistant") continue;
		const content = textContentFromMessageContent(message.content).trim();
		if (content) conversation.push({ role: message.role, content });
	}
	return conversation;
}

function textContentFromMessageContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter(
			(part): part is TextContent =>
				!!part && typeof part === "object" && (part as { type?: unknown }).type === "text",
		)
		.map((part) => part.text)
		.join("");
}

export async function loadTravelConversation(
	sessionId: string,
	dataDir = join(process.cwd(), "travel-data"),
): Promise<TravelConversationMessage[]> {
	const env = new NodeExecutionEnv({ cwd: process.cwd() });
	const metadata = await findHarnessSession(env, dataDir, sessionId);
	if (!metadata) return [];
	const repo = new JsonlSessionRepo({ fs: env, sessionsRoot: join(dataDir, "sessions") });
	const session = await repo.open(metadata);
	const context = await session.buildContext();
	return extractTravelConversation(context.messages);
}
