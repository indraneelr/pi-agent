/**
 * Tests for the travel agent server.
 *
 * Uses Fastify's inject() to test routes without binding a port.
 * No real LLM calls are made — the happy-path tests use a mock
 * TravelSessionManager.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { createServer } from "../src/server.js";
import { TravelSessionManager, type TravelSessionManager as TravelSessionManagerType } from "../src/session-manager.js";

// =============================================================================
// No-LLM tests (default config, no model configured)
// =============================================================================

describe("server without LLM configured", () => {
	let app: FastifyInstance;
	let tmpDataDir: string;

	beforeAll(async () => {
		tmpDataDir = await mkdtemp(join(tmpdir(), "travel-agent-server-test-"));
		app = createServer(loadConfig({ TRAVEL_AGENT_DATA_DIR: tmpDataDir }));
		await app.ready();
	});

	afterAll(async () => {
		await app.close();
		await rm(tmpDataDir, { recursive: true, force: true });
	});

	test("GET /health returns 200", async () => {
		const res = await app.inject({ method: "GET", url: "/health" });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ status: "ok" });
	});

	test("POST /api/travel/sessions creates inert session without configured model", async () => {
		const res = await app.inject({ method: "POST", url: "/api/travel/sessions" });
		expect(res.statusCode).toBe(201);
		const body = res.json();
		expect(body.sessionId).toEqual(expect.any(String));
		expect(body.status).toBe("idle");
		expect(body.state.sessionId).toBe(body.sessionId);
		expect(body.state.preferences).toEqual({});
		expect(body.state.selectedDestinations).toEqual([]);
		expect(body.uiBlocks.map((block: { kind: string }) => block.kind)).toContain("checklist_progress");
		expect(body.uiBlocks.map((block: { kind: string }) => block.kind)).toContain("trip_preferences_summary");

		const persisted = JSON.parse(await readFile(join(tmpDataDir, `${body.sessionId}.json`), "utf-8"));
		expect(persisted.sessionId).toBe(body.sessionId);
	});

	test("POST message returns 503 when inert session cannot initialize agent", async () => {
		const createRes = await app.inject({ method: "POST", url: "/api/travel/sessions" });
		const { sessionId } = createRes.json();
		const res = await app.inject({
			method: "POST",
			url: `/api/travel/sessions/${sessionId}/messages`,
			payload: { message: "Plan a trip to Japan" },
		});
		expect(res.statusCode).toBe(503);
		const body = res.json();
		expect(body.error).toContain("Ollama Cloud API key");
	});

	test("GET unknown session returns 404", async () => {
		const res = await app.inject({ method: "GET", url: "/api/travel/sessions/nonexistent" });
		expect(res.statusCode).toBe(404);
		const body = res.json();
		expect(body.error).toContain("not found");
	});

	test("POST message with empty body returns 400", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/travel/sessions/any-id/messages",
			payload: { message: "" },
		});
		expect(res.statusCode).toBe(400);
		const body = res.json();
		expect(body.error).toContain("empty");
	});

	test("POST message with missing message field returns 400", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/travel/sessions/any-id/messages",
			payload: {},
		});
		expect(res.statusCode).toBe(400);
	});

	test("POST message to unknown session returns 404", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/travel/sessions/nonexistent/messages",
			payload: { message: "Plan a trip to Japan" },
		});
		expect(res.statusCode).toBe(404);
	});
});

// =============================================================================
// Model resolution
// =============================================================================

describe("server auth feature toggle", () => {
	test("defaults auth off for dev/test and on for Railway production-like environments", () => {
		expect(loadConfig({}).authRequired).toBe(false);
		expect(loadConfig({ NODE_ENV: "production" }).authRequired).toBe(true);
		expect(loadConfig({ RAILWAY_ENVIRONMENT: "production" }).authRequired).toBe(true);
		expect(loadConfig({ AUTH_REQUIRED: "false", RAILWAY_ENVIRONMENT: "production" }).authRequired).toBe(false);
		expect(loadConfig({ AUTH_REQUIRED: "true" }).authRequired).toBe(true);
	});

	test("exposes a dev current-user response when auth is disabled", async () => {
		const app = createServer(loadConfig({ AUTH_REQUIRED: "false" }));
		await app.ready();
		try {
			const res = await app.inject({ method: "GET", url: "/api/auth/current-user" });
			expect(res.statusCode).toBe(200);
			expect(res.json()).toMatchObject({ authRequired: false, authenticated: false, user: { id: "dev-user" } });
		} finally {
			await app.close();
		}
	});

	test("blocks travel APIs when auth is required before Google OIDC is configured", async () => {
		const app = createServer(loadConfig({ AUTH_REQUIRED: "true" }));
		await app.ready();
		try {
			const health = await app.inject({ method: "GET", url: "/health" });
			expect(health.statusCode).toBe(200);
			const res = await app.inject({ method: "POST", url: "/api/travel/sessions" });
			expect(res.statusCode).toBe(501);
			expect(res.json().error).toContain("Authentication is required");
		} finally {
			await app.close();
		}
	});
});

// =============================================================================
// Model resolution
// =============================================================================

describe("TravelSessionManager model resolution", () => {
	test("supports the Ollama Cloud kimi-k2.6 model used by travel evals", () => {
		const manager = new TravelSessionManager(
			loadConfig({
				TRAVEL_AGENT_PROVIDER: "ollama",
				TRAVEL_AGENT_MODEL: "kimi-k2.6",
				TRAVEL_AGENT_DATA_DIR: "/tmp/travel-agent-server-model-test",
			}),
		);

		const model = (
			manager as unknown as { resolveModel: () => { id: string; provider: string; baseUrl?: string } }
		).resolveModel();

		expect(model.provider).toBe("ollama");
		expect(model.id).toBe("kimi-k2.6");
		expect(model.baseUrl).toBe("https://ollama.com/v1");
	});
});

// =============================================================================
// Happy-path tests with mock manager
// =============================================================================

describe("server with mock manager", () => {
	let app: FastifyInstance;

	const mockState = { sessionId: "mock-session" };
	const mockUiBlocks = [{ id: "mock-block", kind: "checklist_progress" }];
	const mockConversation = [{ role: "user", content: "Plan a trip" }];
	const mockManager = {
		createSession: vi.fn().mockResolvedValue({
			sessionId: "mock-session",
			state: mockState,
			uiBlocks: mockUiBlocks,
			conversation: mockConversation,
			status: "idle" as const,
		}),
		getSession: vi.fn().mockReturnValue({
			sessionId: "mock-session",
			state: mockState,
			uiBlocks: mockUiBlocks,
			conversation: mockConversation,
			status: "idle" as const,
		}),
		sendMessage: vi.fn().mockResolvedValue({
			sessionId: "mock-session",
			assistantMessage: "I can help you plan a trip!",
			state: mockState,
			uiBlocks: mockUiBlocks,
			conversation: mockConversation,
			status: "idle" as const,
		}),
	} as unknown as TravelSessionManagerType;

	beforeAll(async () => {
		app = createServer(loadConfig({}), mockManager);
		await app.ready();
	});

	afterAll(async () => {
		await app.close();
	});

	test("POST /api/travel/sessions creates and returns 201", async () => {
		const res = await app.inject({ method: "POST", url: "/api/travel/sessions" });
		expect(res.statusCode).toBe(201);
		const body = res.json();
		expect(body.sessionId).toBe("mock-session");
		expect(body.status).toBe("idle");
		expect(body.state).toEqual(mockState);
	});

	test("GET /api/travel/sessions/:id returns session", async () => {
		const res = await app.inject({ method: "GET", url: "/api/travel/sessions/mock-session" });
		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.sessionId).toBe("mock-session");
		expect(body.status).toBe("idle");
		expect(body.state).toEqual(mockState);
	});

	test("POST message returns assistant response", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/api/travel/sessions/mock-session/messages",
			payload: { message: "Plan a weekend in Paris" },
		});
		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.sessionId).toBe("mock-session");
		expect(body.assistantMessage).toBe("I can help you plan a trip!");
		expect(body.status).toBe("idle");
	});
});
