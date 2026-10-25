import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ai from "@earendil-works/pi-ai";
import { createTravelState, type TravelSession } from "@mariozechner/pi-travel-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertProductionConfig, loadConfig } from "../src/config.js";
import { CredentialStore } from "../src/credentials.js";
import type { TravelStreamEvent } from "../src/events.js";
import { createServer } from "../src/server.js";
import { SessionBusyError, TravelSessionManager } from "../src/session-manager.js";

const dirs: string[] = [];
function config() {
	const dir = mkdtempSync(join(tmpdir(), "wander-test-"));
	dirs.push(dir);
	return loadConfig({ TRAVEL_AGENT_DATA_DIR: dir, AUTH_REQUIRED: "false", TRAVEL_AGENT_MESSAGE_TIMEOUT_MS: "30" });
}
afterEach(() => {
	vi.restoreAllMocks();
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("working alpha", () => {
	it("does not report an arbitrary nonempty key as valid and uses rotated keys", async () => {
		const cfg = config();
		const store = new CredentialStore(cfg);
		const probe = vi
			.spyOn(ai, "completeSimple")
			.mockResolvedValue({ stopReason: "error", errorMessage: "secret-provider-detail" } as ai.AssistantMessage);
		const first = store.create("user", { provider: "google", apiKey: "bad-secret" });
		await expect(store.validate("user", first.id)).rejects.toThrow("test request");
		expect(store.getApiKeyForProvider("user", "google")).toBeUndefined();
		probe.mockResolvedValue({ stopReason: "stop" } as ai.AssistantMessage);
		const second = store.create("user", { provider: "google", apiKey: "good-secret" });
		await store.validate("user", second.id);
		expect(store.list("user")).toHaveLength(1);
		expect(store.getApiKeyForProvider("user", "google")).toBe("good-secret");
		expect(JSON.stringify(store.list("user"))).not.toContain("good-secret");
	});

	it("rejects expired or malformed auth cookies and cross-origin writes", async () => {
		const cfg = {
			...config(),
			authRequired: true,
			corsOrigins: ["https://wander.example"],
			authSessionSecret: "test-secret",
		};
		const app = createServer(cfg);
		try {
			const payload = Buffer.from(
				JSON.stringify({ id: "u", email: "u@example.com", expiresAt: Date.now() - 1 }),
			).toString("base64url");
			const token = `${payload}.${createHmac("sha256", cfg.authSessionSecret).update(payload).digest("base64url")}`;
			expect(
				(await app.inject({ method: "POST", url: "/api/travel/sessions", cookies: { travel_auth: token } }))
					.statusCode,
			).toBe(401);
			expect(
				(
					await app.inject({
						method: "GET",
						url: "/api/auth/current-user",
						headers: { cookie: "travel_auth=%ZZ" },
					})
				).json().authenticated,
			).toBe(false);
			expect(
				(await app.inject({ method: "POST", url: "/api/auth/logout", headers: { origin: "https://evil.example" } }))
					.statusCode,
			).toBe(403);
		} finally {
			await app.close();
		}
	});

	it("refuses unsafe production configuration", () => {
		expect(() => assertProductionConfig(loadConfig({ NODE_ENV: "production", AUTH_REQUIRED: "false" }))).toThrow(
			"authentication",
		);
	});

	it("requires a separate credential encryption secret in production", () => {
		const sessionSecret = "s".repeat(40);
		const production = {
			NODE_ENV: "production",
			AUTH_SESSION_SECRET: sessionSecret,
			GOOGLE_CLIENT_ID: "client",
			GOOGLE_CLIENT_SECRET: "secret",
			GOOGLE_REDIRECT_URI: "https://wander.example/api/auth/callback",
			ALPHA_USER_ALLOWLIST: "user@example.com",
			CORS_ORIGINS: "https://wander.example",
		};
		// Unset: no silent fallback to the session secret.
		expect(loadConfig(production).credentialEncryptionSecret).not.toBe(sessionSecret);
		expect(() => assertProductionConfig(loadConfig(production))).toThrow("CREDENTIAL_ENCRYPTION_SECRET");
		expect(() =>
			assertProductionConfig(loadConfig({ ...production, CREDENTIAL_ENCRYPTION_SECRET: sessionSecret })),
		).toThrow("must differ");
		expect(() =>
			assertProductionConfig(loadConfig({ ...production, CREDENTIAL_ENCRYPTION_SECRET: "c".repeat(40) })),
		).not.toThrow();
	});

	it("keeps Exa discovery off by default and refuses the flag without a key", () => {
		expect(loadConfig({}).exaDiscovery).toBe(false);
		expect(() => assertProductionConfig(loadConfig({ EXA_DISCOVERY: "1" }))).toThrow(
			"EXA_DISCOVERY requires EXA_API_KEY",
		);
		const enabled = loadConfig({ EXA_DISCOVERY: "1", EXA_API_KEY: "exa-key" });
		expect(enabled).toMatchObject({ exaDiscovery: true, exaApiKey: "exa-key" });
		expect(() => assertProductionConfig(enabled)).not.toThrow();
	});

	it("times out a stuck stream, preserves the lock until settlement, then allows retry", async () => {
		const cfg = config();
		let finish = () => {};
		const gate = new Promise<void>((resolve) => {
			finish = resolve;
		});
		const abort = vi.fn();
		const manager = new TravelSessionManager(cfg, undefined, undefined, async (id) => {
			const state = createTravelState(id, []);
			const session: TravelSession = {
				state,
				setState(next) {
					this.state = next;
				},
				shutdown: async () => {},
				agent: {
					state: { messages: [], isStreaming: false },
					prompt: () => gate,
					abort,
					waitForIdle: () => gate,
					subscribe: () => () => {},
				},
			};
			return session;
		});
		const created = await manager.createSession();
		const events: TravelStreamEvent[] = [];
		await manager.streamMessage(created.sessionId, "hello", "dev-user", (event) => events.push(event));
		expect(events.at(-1)?.type).toBe("run_error");
		expect(abort).toHaveBeenCalled();
		expect((await manager.getSession(created.sessionId)).status).toBe("busy");
		await expect(manager.deleteSession(created.sessionId)).rejects.toBeInstanceOf(SessionBusyError);
		finish();
		await vi.waitFor(async () => expect((await manager.getSession(created.sessionId)).status).toBe("idle"));
	});

	it("streams a delayed response over real HTTP without aborting when the request body closes", async () => {
		const cfg = { ...config(), messageTimeoutMs: 1000 };
		const manager = new TravelSessionManager(cfg, undefined, undefined, async (id) => {
			const state = createTravelState(id, []);
			const session: TravelSession = {
				state,
				setState(next) {
					this.state = next;
				},
				shutdown: async () => {},
				agent: {
					state: { messages: [], isStreaming: false },
					prompt: async () => {
						await new Promise((resolve) => setTimeout(resolve, 40));
					},
					abort: () => {
						throw new Error("Unexpected abort");
					},
					waitForIdle: async () => {},
					subscribe: () => () => {},
				},
			};
			return session;
		});
		const app = createServer(cfg, manager);
		try {
			const address = await app.listen({ host: "127.0.0.1", port: 0 });
			const created = await manager.createSession();
			const response = await fetch(`${address}/api/travel/sessions/${created.sessionId}/messages/stream`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ message: "hello" }),
			});
			const text = await response.text();
			expect(text).toContain('"run_finished"');
			expect(text).not.toContain('"run_error"');
		} finally {
			await app.close();
		}
	});
});
