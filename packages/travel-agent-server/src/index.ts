#!/usr/bin/env node

/**
 * Entry point for the travel agent server.
 *
 * Exports createServer and TravelSessionManager for programmatic use.
 * Starts the HTTP server when run directly (node dist/index.js or tsx src/index.ts).
 */

import { fileURLToPath } from "node:url";

import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

export { createServer } from "./server.js";
export {
	SessionBusyError,
	SessionConfigurationError,
	SessionNotFoundError,
	SessionTimeoutError,
	TravelSessionManager,
} from "./session-manager.js";

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
	const config = loadConfig();
	const app = createServer(config);
	app.listen({ port: config.port, host: config.host }).then(() => {
		app.log.info(`Travel agent server listening on http://${config.host}:${config.port}`);
	});
}
