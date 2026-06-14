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
	TravelSessionManager,
} from "./session-manager.js";

/**
 * Create a Fastify instance with all travel agent routes registered.
 *
 * @param config Server configuration (defaults to loadConfig()).
 * @param manager Optional TravelSessionManager for dependency injection (tests).
 */
export function createServer(config: ServerConfig = loadConfig(), manager?: TravelSessionManager): FastifyInstance {
	const sessionManager = manager ?? new TravelSessionManager(config);
	const app = Fastify({ logger: true });

	app.register(cors, { origin: config.corsOrigins });

	app.get("/health", async () => ({ status: "ok" }));

	app.post("/api/travel/sessions", async (_request, reply) => {
		try {
			const result = await sessionManager.createSession();
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
			const result = sessionManager.getSession(sessionId);
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
			const result = await sessionManager.sendMessage(sessionId, body.message);
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
			app.log.error(e);
			return reply.status(500).send({ error: "Internal server error" });
		}
	});

	return app;
}
