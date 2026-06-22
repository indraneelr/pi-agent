/**
 * Fastify HTTP server for the travel agent.
 *
 * Wires up routes for health checks and travel session management.
 * Error mapping: 400 (bad request), 404 (not found), 409 (busy),
 * 503 (configuration error), 500 (internal error).
 */

import cors from "@fastify/cors";
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
import { loadConfig, type ServerConfig } from "./config.js";
import { CredentialNotFoundError, CredentialStore } from "./credentials.js";
import {
	SessionBusyError,
	SessionConfigurationError,
	SessionForbiddenError,
	SessionNotFoundError,
	SessionTimeoutError,
	TravelSessionManager,
} from "./session-manager.js";

/**
 * Create a Fastify instance with all travel agent routes registered.
 *
 * @param config Server configuration (defaults to loadConfig()).
 * @param manager Optional TravelSessionManager for dependency injection (tests).
 */
export function createServer(config: ServerConfig = loadConfig(), manager?: TravelSessionManager): FastifyInstance {
	const app = Fastify({ logger: true });
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

	app.register(cors, { origin: config.corsOrigins });

	app.addHook("onResponse", async (request, reply) => {
		app.log.info(
			{
				method: request.method,
				url: request.url,
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
		const protectedApi = request.url.startsWith("/api/travel/") || request.url.startsWith("/api/credentials");
		if (!config.authRequired || !protectedApi) return;
		const user = getRequestUser(request, config);
		if (!user) return reply.status(401).send({ error: "Authentication required" });
	});

	app.get("/health", async () => ({ status: "ok" }));

	app.get("/api/auth/current-user", async (request) => {
		const user = getRequestUser(request, config);
		return {
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
		} catch (e) {
			return reply.status(401).send({ error: e instanceof Error ? e.message : "Google sign-in failed" });
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
			const credential = credentialStore.create(user.id, {
				provider: body?.provider ?? "",
				label: body?.label,
				apiKey: body?.apiKey ?? "",
			});
			return reply.status(201).send({ credential });
		} catch (e) {
			return reply.status(400).send({ error: e instanceof Error ? e.message : "Invalid credential" });
		}
	});

	app.post("/api/credentials/:credentialId/validate", async (request, reply) => {
		const user = getRequestUser(request, config)!;
		const { credentialId } = request.params as { credentialId: string };
		try {
			return reply.send({ credential: credentialStore.validate(user.id, credentialId) });
		} catch (e) {
			if (e instanceof CredentialNotFoundError) return reply.status(404).send({ error: e.message });
			return reply.status(400).send({ error: e instanceof Error ? e.message : "Credential validation failed" });
		}
	});

	app.delete("/api/credentials/:credentialId", async (request, reply) => {
		const user = getRequestUser(request, config)!;
		const { credentialId } = request.params as { credentialId: string };
		try {
			credentialStore.delete(user.id, credentialId);
			return reply.send({ ok: true });
		} catch (e) {
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

	return app;
}
