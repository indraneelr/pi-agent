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
	/** Max time to wait for one agent message before returning a timeout. */
	messageTimeoutMs: number;
	/** Require authenticated Google/user sessions for travel APIs. */
	authRequired: boolean;
	/** HMAC secret for auth session cookies. */
	authSessionSecret: string;
	/** Whether auth cookies require HTTPS. */
	cookieSecure: boolean;
	/** Google OAuth client ID. */
	googleClientId: string | undefined;
	/** Google OAuth client secret. */
	googleClientSecret: string | undefined;
	/** Google OAuth redirect URI. */
	googleRedirectUri: string | undefined;
}

function parseCorsOrigins(raw: string | undefined): string[] {
	if (!raw) return ["*"];
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function parseBoolean(raw: string | undefined): boolean | undefined {
	if (raw === undefined) return undefined;
	const normalized = raw.trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(normalized)) return true;
	if (["0", "false", "no", "off"].includes(normalized)) return false;
	return undefined;
}

function defaultAuthRequired(env: NodeJS.ProcessEnv): boolean {
	const explicit = parseBoolean(env.AUTH_REQUIRED);
	if (explicit !== undefined) return explicit;
	const railwayEnv = env.RAILWAY_ENVIRONMENT?.trim().toLowerCase();
	if (railwayEnv && railwayEnv !== "development" && railwayEnv !== "dev") return true;
	return ["production", "staging"].includes((env.NODE_ENV ?? "").trim().toLowerCase());
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
		messageTimeoutMs: Number(env.TRAVEL_AGENT_MESSAGE_TIMEOUT_MS ?? "180000"),
		authRequired: defaultAuthRequired(env),
		authSessionSecret: env.AUTH_SESSION_SECRET ?? "dev-auth-session-secret-change-me",
		cookieSecure: parseBoolean(env.AUTH_COOKIE_SECURE) ?? defaultAuthRequired(env),
		googleClientId: env.GOOGLE_CLIENT_ID,
		googleClientSecret: env.GOOGLE_CLIENT_SECRET,
		googleRedirectUri: env.GOOGLE_REDIRECT_URI,
	};
}
