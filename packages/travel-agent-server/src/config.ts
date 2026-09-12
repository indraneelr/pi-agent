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
	/** Per-provider web-search failover timeout (ADR 0002). */
	searchTimeoutMs: number;
	/** Per-provider image-search failover timeout (ADR 0002). */
	imageTimeoutMs: number;
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
	/** Secret used for application-level encryption of user LLM credentials. */
	credentialEncryptionSecret: string;
	/** Users allowed to use server-funded fallback LLM keys. */
	serverKeyFallbackAllowlist: string[];
	/** SearXNG base URL for alpha image/search readiness. */
	searxngBaseUrl: string | undefined;
	/** Simple per-user/IP request limit per minute for alpha abuse control. */
	rateLimitPerMinute: number;
	production: boolean;
	allowedUsers: string[];
	webDir?: string;
}

function parseList(raw: string | undefined): string[] {
	return (raw ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function parseCorsOrigins(raw: string | undefined): string[] {
	const parsed = parseList(raw);
	return parsed.length > 0 ? parsed : ["*"];
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
	const provider = env.TRAVEL_AGENT_PROVIDER ?? "google";
	return {
		port: Number(env.PORT ?? "3001"),
		host: env.HOST ?? "0.0.0.0",
		dataDir: env.TRAVEL_AGENT_DATA_DIR ?? "./travel-data",
		corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
		provider,
		modelId: env.TRAVEL_AGENT_MODEL ?? (provider === "google" ? "gemini-2.5-flash" : "kimi-k2.6"),
		apiKey:
			env.TRAVEL_AGENT_API_KEY ??
			(provider === "google" ? env.GEMINI_API_KEY : provider === "ollama" ? env.OLLAMA_API_KEY : undefined),
		messageTimeoutMs: Number(env.TRAVEL_AGENT_MESSAGE_TIMEOUT_MS ?? "360000"),
		searchTimeoutMs: Number(env.SEARCH_TIMEOUT_MS ?? "12000"),
		imageTimeoutMs: Number(env.IMAGE_TIMEOUT_MS ?? "15000"),
		authRequired: defaultAuthRequired(env),
		authSessionSecret: env.AUTH_SESSION_SECRET ?? "dev-auth-session-secret-change-me",
		cookieSecure: parseBoolean(env.AUTH_COOKIE_SECURE) ?? defaultAuthRequired(env),
		googleClientId: env.GOOGLE_CLIENT_ID,
		googleClientSecret: env.GOOGLE_CLIENT_SECRET,
		googleRedirectUri: env.GOOGLE_REDIRECT_URI,
		credentialEncryptionSecret:
			env.CREDENTIAL_ENCRYPTION_SECRET ?? env.AUTH_SESSION_SECRET ?? "dev-credential-secret-change-me",
		serverKeyFallbackAllowlist: parseList(env.SERVER_KEY_FALLBACK_ALLOWLIST),
		searxngBaseUrl: env.SEARXNG_BASE_URL,
		rateLimitPerMinute: Number(env.RATE_LIMIT_PER_MINUTE ?? "120"),
		production:
			["production", "staging"].includes(env.NODE_ENV ?? "") ||
			["production", "staging"].includes(env.RAILWAY_ENVIRONMENT ?? ""),
		allowedUsers: parseList(env.ALPHA_USER_ALLOWLIST).map((value) => value.toLowerCase()),
		webDir: env.TRAVEL_AGENT_WEB_DIR,
	};
}

export function assertProductionConfig(config: ServerConfig): void {
	if (!Number.isFinite(config.messageTimeoutMs) || config.messageTimeoutMs <= 0)
		throw new Error("TRAVEL_AGENT_MESSAGE_TIMEOUT_MS must be positive");
	if (!config.production) return;
	if (!config.authRequired || !config.cookieSecure)
		throw new Error("Production requires authentication and secure cookies");
	if (config.authSessionSecret.length < 32 || config.authSessionSecret.startsWith("dev-"))
		throw new Error("Set a strong AUTH_SESSION_SECRET (at least 32 characters)");
	if (config.credentialEncryptionSecret.length < 32 || config.credentialEncryptionSecret.startsWith("dev-"))
		throw new Error("Set a strong CREDENTIAL_ENCRYPTION_SECRET (at least 32 characters)");
	if (!config.googleClientId || !config.googleClientSecret || !config.googleRedirectUri?.startsWith("https://"))
		throw new Error("Production requires Google OAuth with an HTTPS redirect URI");
	if (config.allowedUsers.length === 0) throw new Error("Set ALPHA_USER_ALLOWLIST for the private alpha");
	if (config.corsOrigins.includes("*")) throw new Error("Set CORS_ORIGINS to the public app origin");
}
