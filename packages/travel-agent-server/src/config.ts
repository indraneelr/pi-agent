/**
 * Server configuration loaded from environment variables.
 *
 * All values have safe dev defaults except provider/model keys which must be
 * supplied at runtime when real LLM calls are needed.
 */

export interface ServerConfig {
	/** HTTP listen port. */
	port: number;
	/** HTTP listen host/address. */
	host: string;
	/** Directory for travel session persistence. */
	dataDir: string;
	/** CORS allowed origins (parsed comma-separated list). */
	corsOrigins: string[];
	/** LLM provider name (e.g. "ollama"). */
	provider: string;
	/** LLM model ID. */
	modelId: string;
	/** API key for the LLM provider. */
	apiKey: string | undefined;
}

function parseCorsOrigins(raw: string | undefined): string[] {
	if (!raw) return ["*"];
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

/**
 * Load server configuration from environment variables.
 * Never throws — missing LLM credentials are surfaced later when a message
 * is actually sent so that health/session-creation still work.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
	return {
		port: Number(env.PORT ?? "3001"),
		host: env.HOST ?? "0.0.0.0",
		dataDir: env.TRAVEL_AGENT_DATA_DIR ?? "./travel-data",
		corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
		provider: env.TRAVEL_AGENT_PROVIDER ?? "ollama",
		modelId: env.TRAVEL_AGENT_MODEL ?? "kimi-k2.6",
		apiKey: env.OLLAMA_API_KEY,
	};
}
