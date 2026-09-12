#!/usr/bin/env node

/**
 * Entry point for the travel agent server.
 *
 * Exports createServer and TravelSessionManager for programmatic use.
 * Starts the HTTP server when run directly (node dist/index.js or tsx src/index.ts).
 */

import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
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
	config.webDir ??= join(dirname(fileURLToPath(import.meta.url)), "..", "..", "travel-agent-web", "dist");
	await access(join(config.webDir, "index.html"));
	const app = createServer(config);
	app.listen({ port: config.port, host: config.host }).then(() => {
		app.log.info(`Travel agent server listening on http://${config.host}:${config.port}`);
	});
	for (const signal of ["SIGINT", "SIGTERM"] as const)
		process.once(signal, () => {
			void app.close().then(() => process.exit(0));
		});
}
