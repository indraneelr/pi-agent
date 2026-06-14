/**
 * Travel session manager.
 *
 * Manages the lifecycle of travel agent sessions: creation, lookup,
 * and message dispatch. Decouples the HTTP layer from the travel SDK.
 */

import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { KnownProvider, TextContent } from "@mariozechner/pi-ai";
import { getModels } from "@mariozechner/pi-ai";
import {
	createTravelSession,
	createTravelState,
	detectSearchProvider,
	loadChecklistConfig,
	saveTravelState,
	type TravelSession,
	type TravelState,
} from "@mariozechner/pi-travel-agent";
import type { ServerConfig } from "./config.js";

const DEFAULT_CHECKLIST_CONFIG = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	"travel-agent",
	"checklist-config.json",
);

// =============================================================================
// Types
// =============================================================================

export type SessionStatus = "idle" | "busy";

export interface CreateSessionResult {
	sessionId: string;
	state: TravelState;
	status: "idle";
}

export interface GetSessionResult {
	sessionId: string;
	state: TravelState;
	status: SessionStatus;
}

export interface SendMessageResult {
	sessionId: string;
	assistantMessage: string;
	state: TravelState;
	status: "idle";
}

// =============================================================================
// Errors
// =============================================================================

export class SessionNotFoundError extends Error {
	constructor(public readonly sessionId: string) {
		super(`Session not found: ${sessionId}`);
		this.name = "SessionNotFoundError";
	}
}

export class SessionBusyError extends Error {
	constructor(public readonly sessionId: string) {
		super(`Session is busy: ${sessionId}`);
		this.name = "SessionBusyError";
	}
}

export class SessionConfigurationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SessionConfigurationError";
	}
}

// =============================================================================
// Manager
// =============================================================================

interface SessionRecord {
	state: TravelState;
	status: SessionStatus;
}

export class TravelSessionManager {
	private readonly sessions = new Map<string, SessionRecord>();
	private readonly activeSessions = new Map<string, TravelSession>();
	private readonly checklistConfig = loadChecklistConfig(DEFAULT_CHECKLIST_CONFIG);

	constructor(private readonly config: ServerConfig) {}

	/**
	 * Create a new inert travel session.
	 *
	 * Session creation deliberately does not initialize the LLM/search-backed
	 * agent. This lets web clients create/resume UI sessions even when provider
	 * configuration is missing; configuration failures surface on first run.
	 */
	async createSession(): Promise<CreateSessionResult> {
		const sessionId = randomUUID();
		const state = createTravelState(sessionId, this.checklistConfig);
		this.sessions.set(sessionId, { state, status: "idle" });
		saveTravelState(state, { dataDir: this.config.dataDir });
		return { sessionId, state, status: "idle" };
	}

	/**
	 * Look up a session by ID.
	 *
	 * Returns session info if the ID is known (created via createSession).
	 * Throws SessionNotFoundError if the ID was never created.
	 */
	getSession(sessionId: string): GetSessionResult {
		const record = this.sessions.get(sessionId);
		if (!record) {
			throw new SessionNotFoundError(sessionId);
		}
		const activeSession = this.activeSessions.get(sessionId);
		return {
			sessionId,
			state: activeSession?.state ?? record.state,
			status: record.status,
		};
	}

	/**
	 * Send a message to a session and wait for the agent's response.
	 *
	 * Validates the message is non-empty, rejects if the session is busy,
	 * initializes the agent lazily, then dispatches the prompt.
	 * Returns the extracted assistant text and updated state.
	 */
	async sendMessage(sessionId: string, message: string): Promise<SendMessageResult> {
		if (!message || message.trim().length === 0) {
			throw new Error("Message must not be empty");
		}
		const record = this.sessions.get(sessionId);
		if (!record) {
			throw new SessionNotFoundError(sessionId);
		}
		if (record.status === "busy") {
			throw new SessionBusyError(sessionId);
		}

		record.status = "busy";
		try {
			let session = this.activeSessions.get(sessionId);
			if (!session) {
				session = await this.buildSession(sessionId);
				this.activeSessions.set(sessionId, session);
			}
			await session.agent.prompt(message);
			const assistantMessage = extractAssistantText(session.agent.state.messages);
			record.state = session.state;
			saveTravelState(record.state, { dataDir: this.config.dataDir });
			return {
				sessionId,
				assistantMessage,
				state: record.state,
				status: "idle",
			};
		} finally {
			record.status = "idle";
		}
	}

	/**
	 * Build a TravelSession from config, resolving model and search provider.
	 * Wraps all setup failures in SessionConfigurationError with a safe message.
	 */
	private async buildSession(sessionId: string): Promise<TravelSession> {
		const model = this.resolveModel();
		const searchProvider = detectSearchProvider(
			this.config.apiKey ? { stagehandFallbackApiKey: this.config.apiKey } : {},
		);
		if (!searchProvider) {
			throw new SessionConfigurationError(
				"No search provider detected. Set BRAVE_API_KEY, LINKUP_API_KEY, or GEMINI_API_KEY.",
			);
		}
		try {
			return await createTravelSession({
				model,
				apiKey: this.config.apiKey,
				sessionId,
				searchProvider,
				dataDir: this.config.dataDir,
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			throw new SessionConfigurationError(`Failed to create travel session: ${msg}`);
		}
	}

	/**
	 * Resolve a Model from the configured provider/modelId.
	 * Throws SessionConfigurationError if the provider or model is unknown.
	 */
	private resolveModel() {
		const models = getModels(this.config.provider as KnownProvider);
		const model = models.find((m) => m.id === this.config.modelId);
		if (!model) {
			throw new SessionConfigurationError(`Unknown model: ${this.config.provider}/${this.config.modelId}`);
		}
		return model;
	}
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract text from the last assistant message in the conversation.
 *
 * Scans messages from newest to oldest, finds the first assistant message,
 * and joins all text content parts. Returns empty string if no assistant
 * text is found.
 */
function extractAssistantText(messages: readonly AgentMessage[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === "assistant") {
			const texts = msg.content.filter((part): part is TextContent => part.type === "text").map((part) => part.text);
			if (texts.length > 0) {
				return texts.join("");
			}
		}
	}
	return "";
}
