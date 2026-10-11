/**
 * Fastify HTTP server for the travel agent.
 *
 * Wires up routes for health checks and travel session management.
 * Error mapping: 400 (bad request), 404 (not found), 409 (busy),
 * 503 (configuration error), 500 (internal error).
 */

import { accessSync, constants, mkdirSync } from "node:fs";
import cors from "@fastify/cors";
import { INSTANT_ACTION_TYPES, type InstantAction, InstantActionError } from "@mariozechner/pi-travel-agent";
import Fastify, { type FastifyInstance } from "fastify";
import {
	buildGoogleLoginRedirect,
	clearOAuthStateCookie,
	clearSessionCookie,
	exchangeGoogleCodeForUser,
	getRequestUser,
	setOAuthStateCookie,
	setSessionCookie,
	verifyOAuthState,
} from "./auth.js";
import { assertProductionConfig, loadConfig, type ServerConfig } from "./config.js";
import { CredentialNotFoundError, CredentialStore } from "./credentials.js";
import type { TravelStreamEvent } from "./events.js";
import { getFillerContent } from "./filler.js";
import { isPlannerAction } from "./planner-actions.js";
import {
	SessionBusyError,
	SessionConfigurationError,
	SessionForbiddenError,
	SessionNotFoundError,
	SessionTimeoutError,
	TravelSessionManager,
} from "./session-manager.js";
import { registerWeb } from "./static-web.js";

/**
 * Create a Fastify instance with all travel agent routes registered.
 *
 * @param config Server configuration (defaults to loadConfig()).
 * @param manager Optional TravelSessionManager for dependency injection (tests).
 */
export function createServer(config: ServerConfig = loadConfig(), manager?: TravelSessionManager): FastifyInstance {
	assertProductionConfig(config);
	const app = Fastify({
		logger: {
			redact: [
				"req.headers.authorization",
				"req.headers.cookie",
				"res.headers.set-cookie",
				"apiKey",
				"*.apiKey",
				"err",
			],
		},
		disableRequestLogging: true,
		bodyLimit: 64 * 1024,
	});
	app.log.info(
		{
			provider: config.provider,
			modelId: config.modelId,
			dataDir: config.dataDir,
			messageTimeoutMs: config.messageTimeoutMs,
			hasApiKey: Boolean(config.apiKey),
			authRequired: config.authRequired,
		},
		"Starting travel agent server",
	);
	const credentialStore = new CredentialStore(config);
	const sessionManager = manager ?? new TravelSessionManager(config, app.log, credentialStore);
	const rateLimits = new Map<string, { windowStart: number; count: number }>();

	app.register(cors, { origin: config.corsOrigins, credentials: true });

	app.addHook("onResponse", async (request, reply) => {
		app.log.info(
			{
				method: request.method,
				url: request.url.split("?")[0],
				statusCode: reply.statusCode,
			},
			"HTTP request completed",
		);
	});

	app.setNotFoundHandler((request, reply) => {
		app.log.warn({ method: request.method, url: request.url }, "HTTP route not found");
		return reply.status(404).send({ error: `Route not found: ${request.method} ${request.url}` });
	});

	app.addHook("preHandler", async (request, reply) => {
		if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
			const origin = request.headers.origin;
			const allowed =
				!origin || config.corsOrigins.includes(origin) || (!config.production && config.corsOrigins.includes("*"));
			if (!allowed) return reply.status(403).send({ error: "Request origin is not allowed" });
		}
		// Gate on the matched route pattern, not the raw URL: the router percent-decodes
		// paths, so "/api/%74ravel/..." reaches travel routes without matching a raw prefix.
		const route = request.routeOptions.url ?? "";
		const protectedApi = route.startsWith("/api/travel/") || route.startsWith("/api/credentials");
		if (!protectedApi) return;
		const user = getRequestUser(request, config);
		if (
			user &&
			config.allowedUsers.length &&
			!config.allowedUsers.includes(user.id.toLowerCase()) &&
			!config.allowedUsers.includes(user.email.toLowerCase())
		)
			return reply.status(403).send({ error: "This account is not on the alpha allowlist" });
		const rateKey = user?.id ?? request.ip;
		if (!consumeRateLimit(rateLimits, rateKey, config.rateLimitPerMinute)) {
			return reply.status(429).send({ error: "Rate limit exceeded" });
		}
		if (config.authRequired && !user) return reply.status(401).send({ error: "Authentication required" });
	});

	app.get("/health", async () => ({ status: "ok" }));

	app.get("/ready", async (_request, reply) => {
		const checks = {
			storage: checkStorage(config.dataDir),
			encryption: config.credentialEncryptionSecret !== "dev-credential-secret-change-me",
			searxng: Boolean(config.searxngBaseUrl),
			auth:
				!config.authRequired ||
				Boolean(config.googleClientId && config.googleClientSecret && config.googleRedirectUri),
		};
		const ready = Object.values(checks).every(Boolean);
		return reply.status(ready ? 200 : 503).send({ status: ready ? "ready" : "not_ready", checks });
	});

	app.get("/api/auth/current-user", async (request) => {
		const user = getRequestUser(request, config);
		return {
			provider: config.provider,
			modelId: config.modelId,
			providerConfigured: Boolean(
				user &&
					(credentialStore.getApiKeyForProvider(user.id, config.provider) ||
						(config.apiKey && (!config.authRequired || credentialStore.isServerKeyFallbackAllowed(user.id)))),
			),
			authRequired: config.authRequired,
			authenticated: Boolean(user),
			user,
			serverKeyFallbackAllowed: user ? credentialStore.isServerKeyFallbackAllowed(user.id, user.email) : false,
		};
	});

	app.get("/api/auth/login", async (_request, reply) => {
		if (!config.authRequired) return reply.redirect("/");
		try {
			const login = buildGoogleLoginRedirect(config);
			setOAuthStateCookie(reply, login.state, config);
			return reply.redirect(login.url);
		} catch (e) {
			return reply.status(503).send({ error: e instanceof Error ? e.message : "Google OAuth is not configured" });
		}
	});

	app.get("/api/auth/callback", async (request, reply) => {
		const query = request.query as { code?: string; state?: string; error?: string };
		if (query.error) return reply.status(400).send({ error: query.error });
		if (!query.code || !verifyOAuthState(request, query.state)) {
			return reply.status(400).send({ error: "Invalid OAuth callback" });
		}
		try {
			const user = await exchangeGoogleCodeForUser(query.code, config);
			clearOAuthStateCookie(reply, config);
			setSessionCookie(reply, user, config);
			return reply.redirect("/");
		} catch {
			return reply
				.status(401)
				.send({ error: "Google sign-in failed or this account is not invited. Return to the app and try again." });
		}
	});

	app.post("/api/auth/logout", async (_request, reply) => {
		clearSessionCookie(reply, config);
		return reply.send({ ok: true });
	});

	app.get("/api/credentials", async (request) => {
		const user = getRequestUser(request, config)!;
		return {
			credentials: credentialStore.list(user.id),
			serverKeyFallbackAllowed: credentialStore.isServerKeyFallbackAllowed(user.id, user.email),
		};
	});

	app.post("/api/credentials", async (request, reply) => {
		const user = getRequestUser(request, config)!;
		const body = request.body as { provider?: string; label?: string; apiKey?: string } | null;
		try {
			await sessionManager.invalidateUserSessions(user.id);
			const credential = credentialStore.create(user.id, {
				provider: body?.provider ?? "",
				label: body?.label,
				apiKey: body?.apiKey ?? "",
			});
			return reply.status(201).send({ credential });
		} catch (e) {
			if (e instanceof SessionBusyError)
				return reply.status(409).send({ error: "Stop the current run before changing API keys." });
			return reply.status(400).send({ error: e instanceof Error ? e.message : "Invalid credential" });
		}
	});

	app.post("/api/credentials/:credentialId/validate", async (request, reply) => {
		const user = getRequestUser(request, config)!;
		const { credentialId } = request.params as { credentialId: string };
		try {
			return reply.send({ credential: await credentialStore.validate(user.id, credentialId) });
		} catch (e) {
			if (e instanceof CredentialNotFoundError) return reply.status(404).send({ error: e.message });
			return reply.status(400).send({ error: e instanceof Error ? e.message : "Credential validation failed" });
		}
	});

	app.delete("/api/credentials/:credentialId", async (request, reply) => {
		const user = getRequestUser(request, config)!;
		const { credentialId } = request.params as { credentialId: string };
		try {
			await sessionManager.invalidateUserSessions(user.id);
			credentialStore.delete(user.id, credentialId);
			return reply.send({ ok: true });
		} catch (e) {
			if (e instanceof SessionBusyError)
				return reply.status(409).send({ error: "Stop the current run before deleting API keys." });
			if (e instanceof CredentialNotFoundError) return reply.status(404).send({ error: e.message });
			return reply.status(500).send({ error: "Internal server error" });
		}
	});

	app.post("/api/travel/sessions", async (_request, reply) => {
		try {
			const user = getRequestUser(_request, config);
			app.log.info({ userId: user?.id }, "POST /api/travel/sessions start");
			const result = await sessionManager.createSession(user?.id);
			app.log.info({ sessionId: result.sessionId }, "POST /api/travel/sessions complete");
			return reply.status(201).send(result);
		} catch (e) {
			if (e instanceof SessionConfigurationError) {
				return reply.status(503).send({ error: e.message });
			}
			app.log.error(e);
			return reply.status(500).send({ error: "Internal server error" });
		}
	});

	app.get("/api/travel/sessions/:sessionId", async (request, reply) => {
		const { sessionId } = request.params as { sessionId: string };
		try {
			const user = getRequestUser(request, config);
			app.log.info({ sessionId, userId: user?.id }, "GET /api/travel/sessions/:sessionId start");
			const result = await sessionManager.getSession(sessionId, user?.id);
			return reply.send(result);
		} catch (e) {
			if (e instanceof SessionNotFoundError) {
				return reply.status(404).send({ error: e.message });
			}
			if (e instanceof SessionForbiddenError) {
				return reply.status(403).send({ error: e.message });
			}
			app.log.error(e);
			return reply.status(500).send({ error: "Internal server error" });
		}
	});

	app.delete("/api/travel/sessions/:sessionId", async (request, reply) => {
		const { sessionId } = request.params as { sessionId: string };
		try {
			const user = getRequestUser(request, config);
			await sessionManager.deleteSession(sessionId, user?.id);
			return reply.send({ ok: true });
		} catch (e) {
			if (e instanceof SessionBusyError)
				return reply.status(409).send({ error: "Stop the current run before deleting this trip." });
			if (e instanceof SessionNotFoundError) return reply.status(404).send({ error: e.message });
			if (e instanceof SessionForbiddenError) return reply.status(403).send({ error: e.message });
			app.log.error(e);
			return reply.status(500).send({ error: "Internal server error" });
		}
	});

	app.post("/api/travel/sessions/:sessionId/messages", async (request, reply) => {
		const { sessionId } = request.params as { sessionId: string };
		const body = request.body as { message?: string } | null;

		if (!body?.message || body.message.trim().length === 0) {
			return reply.status(400).send({ error: "Message must not be empty" });
		}

		try {
			const user = getRequestUser(request, config);
			app.log.info(
				{ sessionId, userId: user?.id, messageLength: body.message.length },
				"POST /api/travel/sessions/:sessionId/messages start",
			);
			const result = await sessionManager.sendMessage(sessionId, body.message, user?.id);
			app.log.info(
				{ sessionId, uiBlockCount: result.uiBlocks.length },
				"POST /api/travel/sessions/:sessionId/messages complete",
			);
			return reply.send(result);
		} catch (e) {
			if (e instanceof SessionNotFoundError) {
				return reply.status(404).send({ error: e.message });
			}
			if (e instanceof SessionBusyError) {
				return reply.status(409).send({ error: e.message });
			}
			if (e instanceof SessionForbiddenError) {
				return reply.status(403).send({ error: e.message });
			}
			if (e instanceof SessionConfigurationError) {
				return reply.status(503).send({ error: e.message });
			}
			if (e instanceof SessionTimeoutError) {
				return reply.status(504).send({ error: e.message });
			}
			app.log.error(e);
			return reply.status(500).send({ error: "Internal server error" });
		}
	});

	app.post("/api/travel/sessions/:sessionId/actions", async (request, reply) => {
		const { sessionId } = request.params as { sessionId: string };
		const body = request.body as { type?: string; name?: string } | null;
		if (!body?.type || !INSTANT_ACTION_TYPES.includes(body.type as InstantAction["type"])) {
			return reply.status(400).send({ error: `Unknown or missing action type: ${body?.type ?? "(none)"}` });
		}
		if (typeof body.name !== "string" || !body.name.trim()) {
			return reply.status(400).send({ error: "Action 'name' is required" });
		}
		const user = getRequestUser(request, config);
		try {
			const action = { type: body.type, name: body.name } as InstantAction;
			const result = await sessionManager.applyAction(sessionId, action, user?.id);
			return reply.send(result);
		} catch (e) {
			if (e instanceof InstantActionError) return reply.status(400).send({ error: e.message });
			if (e instanceof SessionNotFoundError) return reply.status(404).send({ error: e.message });
			if (e instanceof SessionForbiddenError) return reply.status(403).send({ error: e.message });
			if (e instanceof SessionBusyError) return reply.status(409).send({ error: e.message });
			app.log.error(e);
			return reply.status(500).send({ error: "Internal server error" });
		}
	});

	app.get("/api/travel/sessions/:sessionId/filler", async (request, reply) => {
		const { sessionId } = request.params as { sessionId: string };
		const { destination } = request.query as { destination?: string };
		const user = getRequestUser(request, config);
		try {
			// Validate ownership so filler is scoped like the rest of the session API.
			await sessionManager.getSession(sessionId, user?.id);
			return reply.send(getFillerContent(destination));
		} catch (e) {
			if (e instanceof SessionNotFoundError) return reply.status(404).send({ error: e.message });
			if (e instanceof SessionForbiddenError) return reply.status(403).send({ error: e.message });
			app.log.error(e);
			return reply.status(500).send({ error: "Internal server error" });
		}
	});

	app.post("/api/travel/sessions/:sessionId/messages/stream", async (request, reply) => {
		const { sessionId } = request.params as { sessionId: string };
		const body = request.body as { message?: string; action?: unknown } | null;
		if (typeof body?.message !== "string" || body.message.trim().length === 0) {
			return reply.status(400).send({ error: "Message must not be empty" });
		}
		if (body.action !== undefined && !isPlannerAction(body.action))
			return reply.status(400).send({ error: "Invalid planner action" });
		const user = getRequestUser(request, config);

		// Validate existence/ownership/busy BEFORE hijacking so these map to real
		// HTTP statuses; once the SSE stream is open we can only signal via events.
		try {
			const pre = await sessionManager.getSession(sessionId, user?.id);
			if (pre.status === "busy") return reply.status(409).send({ error: `Session is busy: ${sessionId}` });
		} catch (e) {
			if (e instanceof SessionNotFoundError) return reply.status(404).send({ error: e.message });
			if (e instanceof SessionForbiddenError) return reply.status(403).send({ error: e.message });
			app.log.error(e);
			return reply.status(500).send({ error: "Internal server error" });
		}

		reply.raw.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			// Disable proxy buffering so events flush immediately.
			"X-Accel-Buffering": "no",
			...corsHeadersForRaw(request.headers.origin, config),
		});
		reply.hijack();

		const write = (event: TravelStreamEvent) => {
			if (!reply.raw.writableEnded) reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
		};
		const abort = new AbortController();
		const onClose = () => {
			if (!reply.raw.writableEnded) abort.abort();
		};
		reply.raw.on("close", onClose);
		const heartbeat = setInterval(() => {
			if (!reply.raw.writableEnded) reply.raw.write(": heartbeat\n\n");
		}, 15_000);

		try {
			await sessionManager.streamMessage(
				sessionId,
				body.message,
				user?.id,
				write,
				abort.signal,
				isPlannerAction(body.action) ? body.action : undefined,
			);
		} catch (e) {
			// Pre-stream failures (e.g. a race into busy) surface as a stream event.
			app.log.error({ err: e, sessionId }, "Travel stream endpoint error");
			write({ type: "run_error", message: e instanceof SessionBusyError ? e.message : "Stream failed." });
		} finally {
			clearInterval(heartbeat);
			reply.raw.off("close", onClose);
			if (!reply.raw.writableEnded) reply.raw.end();
		}
	});

	app.post("/api/travel/sessions/:sessionId/cancel", async (request, reply) => {
		const { sessionId } = request.params as { sessionId: string };
		try {
			sessionManager.cancelRun(sessionId, getRequestUser(request, config)?.id);
			return { ok: true };
		} catch (e) {
			if (e instanceof SessionNotFoundError) return reply.status(404).send({ error: e.message });
			if (e instanceof SessionForbiddenError) return reply.status(403).send({ error: e.message });
			return reply.status(500).send({ error: "Could not stop this run" });
		}
	});
	if (config.webDir) registerWeb(app, config.webDir);
	return app;
}

/** CORS headers for a hijacked (raw) SSE response, mirroring the cors plugin. */
function corsHeadersForRaw(origin: string | undefined, config: ServerConfig): Record<string, string> {
	if (!origin) return {};
	const allowed = config.corsOrigins.includes("*") || config.corsOrigins.includes(origin);
	if (!allowed) return {};
	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Credentials": "true",
		Vary: "Origin",
	};
}

function consumeRateLimit(
	limits: Map<string, { windowStart: number; count: number }>,
	key: string,
	limitPerMinute: number,
): boolean {
	if (limitPerMinute <= 0) return true;
	const now = Date.now();
	const current = limits.get(key);
	if (!current || now - current.windowStart >= 60_000) {
		limits.set(key, { windowStart: now, count: 1 });
		return true;
	}
	if (current.count >= limitPerMinute) return false;
	current.count++;
	return true;
}

function checkStorage(dataDir: string): boolean {
	try {
		mkdirSync(dataDir, { recursive: true });
		accessSync(dataDir, constants.R_OK | constants.W_OK);
		return true;
	} catch {
		return false;
	}
}
