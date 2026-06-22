/**
 * Fastify HTTP server for the travel agent.
 *
 * Wires up routes for health checks and travel session management.
 * Error mapping: 400 (bad request), 404 (not found), 409 (busy),
 * 503 (configuration error), 500 (internal error).
 */

import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { loadConfig, type ServerConfig } from "./config.js";
import {
	SessionBusyError,
	SessionConfigurationError,
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
	const sessionManager = manager ?? new TravelSessionManager(config, app.log);

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
		if (!config.authRequired || !request.url.startsWith("/api/travel/")) return;
		return reply.status(501).send({ error: "Authentication is required but Google OIDC is not configured yet." });
	});

	app.get("/health", async () => ({ status: "ok" }));

	app.get("/api/auth/current-user", async () => ({
		authRequired: config.authRequired,
		authenticated: false,
		user: config.authRequired ? null : { id: "dev-user", email: "dev@local", name: "Dev User" },
	}));

	app.post("/api/travel/sessions", async (_request, reply) => {
		try {
			app.log.info("POST /api/travel/sessions start");
			const result = await sessionManager.createSession();
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
			app.log.info({ sessionId }, "GET /api/travel/sessions/:sessionId start");
			const result = await sessionManager.getSession(sessionId);
			return reply.send(result);
		} catch (e) {
			if (e instanceof SessionNotFoundError) {
				return reply.status(404).send({ error: e.message });
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
			app.log.info(
				{ sessionId, messageLength: body.message.length },
				"POST /api/travel/sessions/:sessionId/messages start",
			);
			const result = await sessionManager.sendMessage(sessionId, body.message);
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
