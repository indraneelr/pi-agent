/**
 * Travel session manager.
 *
 * Manages the lifecycle of travel agent sessions: creation, lookup,
 * and message dispatch. Decouples the HTTP layer from the travel SDK.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { KnownProvider, Model, TextContent } from "@mariozechner/pi-ai";
import { getModels } from "@mariozechner/pi-ai";
import {
	createTravelSession,
	createTravelState,
	deleteTravelState,
	detectSearchProvider,
	extractTravelConversation,
	loadChecklistConfig,
	loadTravelConversation,
	loadTravelState,
	type SearchProvider,
	saveTravelState,
	type TravelConversationMessage,
	type TravelSession,
	type TravelState,
} from "@mariozechner/pi-travel-agent";
import type { ServerConfig } from "./config.js";
import type { CredentialStore } from "./credentials.js";
import { composeTravelUiBlocks, type TravelUiBlock } from "./ui-blocks.js";

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
	uiBlocks: TravelUiBlock[];
	conversation: TravelConversationMessage[];
	status: "idle";
}

export interface GetSessionResult {
	sessionId: string;
	state: TravelState;
	uiBlocks: TravelUiBlock[];
	conversation: TravelConversationMessage[];
	status: SessionStatus;
}

export interface SendMessageResult {
	sessionId: string;
	assistantMessage: string;
	state: TravelState;
	uiBlocks: TravelUiBlock[];
	conversation: TravelConversationMessage[];
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

export class SessionForbiddenError extends Error {
	constructor(public readonly sessionId: string) {
		super(`Session access denied: ${sessionId}`);
		this.name = "SessionForbiddenError";
	}
}

export class SessionConfigurationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SessionConfigurationError";
	}
}

export class SessionTimeoutError extends Error {
	constructor(
		public readonly sessionId: string,
		public readonly timeoutMs: number,
	) {
		super(`Travel agent request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
		this.name = "SessionTimeoutError";
	}
}

// =============================================================================
// Manager
// =============================================================================

interface SessionRecord {
	state: TravelState;
	status: SessionStatus;
	userId: string;
}

interface SessionLogger {
	info(obj: Record<string, unknown>, msg?: string): void;
	warn(obj: Record<string, unknown>, msg?: string): void;
	error(obj: unknown, msg?: string): void;
}

const noopLogger: SessionLogger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
};

export class TravelSessionManager {
	private readonly sessions = new Map<string, SessionRecord>();
	private readonly activeSessions = new Map<string, TravelSession>();
	private readonly checklistConfig = loadChecklistConfig(DEFAULT_CHECKLIST_CONFIG);

	constructor(
		private readonly config: ServerConfig,
		private readonly logger: SessionLogger = noopLogger,
		private readonly credentialStore?: CredentialStore,
	) {}

	/**
	 * Create a new inert travel session.
	 *
	 * Session creation deliberately does not initialize the LLM/search-backed
	 * agent. This lets web clients create/resume UI sessions even when provider
	 * configuration is missing; configuration failures surface on first run.
	 */
	async createSession(userId = "dev-user"): Promise<CreateSessionResult> {
		const sessionId = randomUUID();
		this.logger.info({ sessionId, userId }, "Creating travel session");
		const state = createTravelState(sessionId, this.checklistConfig);
		this.sessions.set(sessionId, { state, status: "idle", userId });
		saveTravelState(state, { dataDir: this.config.dataDir });
		saveSessionOwner(this.config.dataDir, sessionId, userId);
		this.logger.info({ sessionId, dataDir: this.config.dataDir }, "Travel session created and persisted");
		return { sessionId, state, uiBlocks: composeTravelUiBlocks(state), conversation: [], status: "idle" };
	}

	/**
	 * Look up a session by ID.
	 *
	 * Returns session info if the ID is known (created via createSession).
	 * Throws SessionNotFoundError if the ID was never created.
	 */
	async getSession(sessionId: string, userId = "dev-user"): Promise<GetSessionResult> {
		this.logger.info({ sessionId, userId }, "Loading travel session");
		let record = this.sessions.get(sessionId);
		if (!record) {
			const persistedState = loadTravelState(sessionId, { dataDir: this.config.dataDir });
			if (!persistedState) throw new SessionNotFoundError(sessionId);
			record = {
				state: persistedState,
				status: "idle",
				userId: loadSessionOwner(this.config.dataDir, sessionId) ?? "dev-user",
			};
			this.sessions.set(sessionId, record);
		}
		this.assertSessionOwner(record, sessionId, userId);
		const activeSession = this.activeSessions.get(sessionId);
		const state = activeSession?.state ?? record.state;
		const conversation = activeSession
			? extractTravelConversation(activeSession.agent.state.messages)
			: await loadTravelConversation(sessionId, this.config.dataDir);
		return {
			sessionId,
			state,
			uiBlocks: composeTravelUiBlocks(state),
			conversation,
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
	async deleteSession(sessionId: string, userId = "dev-user"): Promise<void> {
		let record = this.sessions.get(sessionId);
		if (!record) {
			const persistedState = loadTravelState(sessionId, { dataDir: this.config.dataDir });
			if (!persistedState) throw new SessionNotFoundError(sessionId);
			record = {
				state: persistedState,
				status: "idle",
				userId: loadSessionOwner(this.config.dataDir, sessionId) ?? "dev-user",
			};
		}
		this.assertSessionOwner(record, sessionId, userId);
		this.sessions.delete(sessionId);
		this.activeSessions.delete(sessionId);
		deleteTravelState(sessionId, { dataDir: this.config.dataDir });
		deleteSessionOwner(this.config.dataDir, sessionId);
	}

	async sendMessage(sessionId: string, message: string, userId = "dev-user"): Promise<SendMessageResult> {
		if (!message || message.trim().length === 0) {
			throw new Error("Message must not be empty");
		}
		let record = this.sessions.get(sessionId);
		if (!record) {
			const persistedState = loadTravelState(sessionId, { dataDir: this.config.dataDir });
			if (!persistedState) throw new SessionNotFoundError(sessionId);
			record = {
				state: persistedState,
				status: "idle",
				userId: loadSessionOwner(this.config.dataDir, sessionId) ?? "dev-user",
			};
			this.sessions.set(sessionId, record);
		}
		this.assertSessionOwner(record, sessionId, userId);
		if (record.status === "busy") {
			throw new SessionBusyError(sessionId);
		}

		record.status = "busy";
		const startedAt = Date.now();
		this.logger.info({ sessionId, messageLength: message.length }, "Received travel message");
		try {
			let session = this.activeSessions.get(sessionId);
			if (!session) {
				this.logger.info({ sessionId }, "Initializing travel agent session");
				session = await this.buildSession(sessionId, userId);
				this.activeSessions.set(sessionId, session);
				this.logger.info({ sessionId }, "Travel agent session initialized");
			}
			this.logger.info({ sessionId, timeoutMs: this.config.messageTimeoutMs }, "Starting agent prompt/research");
			await withTimeout(
				session.agent.prompt(message),
				this.config.messageTimeoutMs,
				() => new SessionTimeoutError(sessionId, this.config.messageTimeoutMs),
			);
			this.logger.info({ sessionId, durationMs: Date.now() - startedAt }, "Agent prompt/research finished");
			const assistantMessage = extractAssistantText(session.agent.state.messages);
			record.state = session.state;
			saveTravelState(record.state, { dataDir: this.config.dataDir });
			this.logger.info(
				{ sessionId, uiBlockCount: composeTravelUiBlocks(record.state).length },
				"Travel state persisted after message",
			);
			return {
				sessionId,
				assistantMessage,
				state: record.state,
				uiBlocks: composeTravelUiBlocks(record.state),
				conversation: extractTravelConversation(session.agent.state.messages),
				status: "idle",
			};
		} catch (e) {
			this.logger.error({ err: e, sessionId, durationMs: Date.now() - startedAt }, "Travel message failed");
			throw e;
		} finally {
			record.status = "idle";
			this.logger.info({ sessionId, durationMs: Date.now() - startedAt }, "Travel session returned to idle");
		}
	}

	/**
	 * Build a TravelSession from config, resolving model and search provider.
	 * Wraps all setup failures in SessionConfigurationError with a safe message.
	 */
	private assertSessionOwner(record: SessionRecord, sessionId: string, userId: string): void {
		if (record.userId !== userId) throw new SessionForbiddenError(sessionId);
	}

	private async buildSession(sessionId: string, userId: string): Promise<TravelSession> {
		const apiKey = this.resolveApiKey(userId);
		if (!apiKey) {
			throw new SessionConfigurationError(formatMissingApiKeyMessage(this.config.provider));
		}

		this.logger.info(
			{ sessionId, userId, provider: this.config.provider, modelId: this.config.modelId },
			"Resolving travel model",
		);
		const model = this.resolveModel();
		let searchProvider: SearchProvider | null | undefined;
		try {
			searchProvider = detectSearchProvider({ stagehandFallbackApiKey: apiKey });
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			throw new SessionConfigurationError(msg);
		}
		if (!searchProvider) {
			throw new SessionConfigurationError(
				"No search provider detected. Set BRAVE_API_KEY, LINKUP_API_KEY, or GEMINI_API_KEY.",
			);
		}
		this.logger.info({ sessionId }, "Detected search provider");
		try {
			return await createTravelSession({
				model,
				apiKey,
				sessionId,
				searchProvider,
				dataDir: this.config.dataDir,
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			throw new SessionConfigurationError(`Failed to create travel session: ${msg}`);
		}
	}

	private resolveApiKey(userId: string): string | undefined {
		const userKey = this.credentialStore?.getApiKeyForProvider(userId, this.config.provider);
		if (userKey) return userKey;
		if (this.credentialStore?.isServerKeyFallbackAllowed(userId) || !this.config.authRequired)
			return this.config.apiKey;
		return undefined;
	}

	/**
	 * Resolve a Model from the configured provider/modelId.
	 * Throws SessionConfigurationError if the provider or model is unknown.
	 */
	private resolveModel() {
		const customModel = resolveCustomModel(this.config.provider, this.config.modelId);
		if (customModel) return customModel;

		const models = getModels(this.config.provider as KnownProvider);
		const model = models.find((m) => m.id === this.config.modelId);
		if (!model) {
			throw new SessionConfigurationError(`Unknown model: ${this.config.provider}/${this.config.modelId}`);
		}
		return model;
	}
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorFactory: () => Error): Promise<T> {
	let timeout: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<T>((_, reject) => {
				timeout = setTimeout(() => reject(errorFactory()), timeoutMs);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

function formatMissingApiKeyMessage(provider: string): string {
	if (provider === "ollama") return "Ollama Cloud API key is not configured. Set OLLAMA_API_KEY.";
	return `API key is not configured for provider: ${provider}.`;
}

function sessionOwnerPath(dataDir: string, sessionId: string): string {
	return join(dataDir, `${sessionId}.owner.json`);
}

function saveSessionOwner(dataDir: string, sessionId: string, userId: string): void {
	mkdirSync(dataDir, { recursive: true });
	writeFileSync(sessionOwnerPath(dataDir, sessionId), `${JSON.stringify({ userId })}\n`, "utf-8");
}

function loadSessionOwner(dataDir: string, sessionId: string): string | null {
	const filePath = sessionOwnerPath(dataDir, sessionId);
	if (!existsSync(filePath)) return null;
	try {
		const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as { userId?: unknown };
		return typeof parsed.userId === "string" && parsed.userId.trim() ? parsed.userId : null;
	} catch {
		return null;
	}
}

function deleteSessionOwner(dataDir: string, sessionId: string): void {
	const filePath = sessionOwnerPath(dataDir, sessionId);
	if (existsSync(filePath)) rmSync(filePath);
}

function resolveCustomModel(provider: string, modelId: string): Model<"openai-completions"> | undefined {
	if (provider !== "ollama" || modelId !== "kimi-k2.6") return undefined;

	return {
		id: modelId,
		name: "Ollama Cloud: kimi-k2.6",
		api: "openai-completions",
		provider: "ollama",
		baseUrl: "https://ollama.com/v1",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 8_192,
		compat: {
			supportsStore: false,
			supportsDeveloperRole: false,
			supportsReasoningEffort: false,
			supportsUsageInStreaming: true,
			maxTokensField: "max_tokens",
			supportsStrictMode: false,
			supportsLongCacheRetention: false,
		},
	};
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
