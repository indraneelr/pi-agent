/**
 * Stagehand search provider.
 *
 * Drives a real Chromium browser via Playwright using Stagehand's
 * `act` / `extract` primitives to perform agentic web search.
 *
 * Requires:
 *   - `@browserbasehq/stagehand` (bundled)
 *   - `playwright` + a Chromium install (`npx playwright install chromium`)
 *   - An LLM API key for Stagehand's own act/extract calls. The default model
 *     is Ollama Cloud's `ollama/minimax-m2.7:cloud`, which needs `OLLAMA_API_KEY`
 *     (create one at https://ollama.com/settings/keys).
 *
 * Env-driven configuration (all optional — sensible defaults applied):
 *   STAGEHAND_MODEL         "provider/model" string (default: "ollama/minimax-m2.7:cloud")
 *   STAGEHAND_API_KEY       Override API key for the Stagehand LLM. When unset,
 *                           the provider-specific env var is used:
 *                             - ollama/* → OLLAMA_API_KEY
 *                             - else → fallbackApiKey supplied by the caller
 *                                      (typically the travel-agent's LLM key)
 *   STAGEHAND_BASE_URL      Override the LLM provider's base URL (default for
 *                           ollama/* is https://ollama.com/api so the cloud
 *                           endpoint is used instead of localhost:11434)
 *   STAGEHAND_HEADLESS      "0" / "false" to show browser window (default: headless)
 *   STAGEHAND_SEARCH_ENGINE "duckduckgo" | "google" | "bing" (default: "duckduckgo")
 *   STAGEHAND_VISIT_RESULTS "1" / "true" to fetch a content snippet from each
 *                           result page (slower, richer; default: off)
 *   STAGEHAND_TIMEOUT_MS    Per-search timeout (default: 120000)
 *   STAGEHAND_VERBOSE       Stagehand log level 0|1|2 (default: 0)
 */

import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import type { SearchProvider, SearchResult } from "./types.js";

// =============================================================================
// Configuration
// =============================================================================

export type StagehandSearchEngine = "duckduckgo" | "google" | "bing";

export interface StagehandSearchOptions {
	/** Stagehand model name in `provider/model` form. Default: "ollama/minimax-m2.7:cloud". */
	modelName?: string;
	/** API key for Stagehand's own LLM. */
	apiKey?: string;
	/**
	 * Fallback API key, used when `apiKey` is not set AND the model provider
	 * is not one we have a dedicated env var for (i.e. not ollama/*). Intended
	 * for the travel-agent to pass its own LLM key as a last resort.
	 */
	fallbackApiKey?: string;
	/**
	 * Override the LLM provider's base URL. Defaults to https://ollama.com/api
	 * for ollama/* models so they hit Ollama Cloud instead of localhost:11434.
	 */
	baseURL?: string;
	/** Run Chromium in headless mode. Default: true. */
	headless?: boolean;
	/** Search engine to drive. Default: "duckduckgo". */
	searchEngine?: StagehandSearchEngine;
	/**
	 * If true, navigate to each result and extract a short content snippet.
	 * Slower but produces richer SearchResult.content. Default: false.
	 */
	visitResults?: boolean;
	/** Per-search timeout in ms. Default: 120_000. */
	timeoutMs?: number;
	/** Stagehand verbose level (0 silent, 1 info, 2 debug). Default: 0. */
	verbose?: 0 | 1 | 2;
	/**
	 * Test seam: inject a Stagehand-like client. When set, the provider does
	 * not import the real Stagehand and skips Playwright entirely.
	 */
	clientFactory?: (config: ResolvedStagehandConfig) => StagehandClient;
}

export interface ResolvedStagehandConfig {
	modelName: string;
	apiKey: string;
	baseURL?: string;
	headless: boolean;
	searchEngine: StagehandSearchEngine;
	visitResults: boolean;
	timeoutMs: number;
	verbose: 0 | 1 | 2;
}

/**
 * Minimal interface we depend on from Stagehand. Defining it ourselves means
 * tests can inject a fake (no real browser) and lets us insulate the rest of
 * the package from upstream type churn.
 */
export interface StagehandClient {
	init(): Promise<void>;
	close(): Promise<void>;
	goto(url: string, opts?: { timeout?: number }): Promise<void>;
	act(instruction: string): Promise<void>;
	extract<T>(instruction: string, schema: z.ZodType<T>): Promise<T>;
}

// =============================================================================
// Constants & defaults
// =============================================================================

const DEFAULT_MODEL = "ollama/minimax-m2.7:cloud";
const DEFAULT_OLLAMA_BASE_URL = "https://ollama.com/api";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_SEARCH_ENGINE: StagehandSearchEngine = "duckduckgo";
/**
 * Build a direct SERP URL with the query baked into the URL. This bypasses
 * the flaky "type the query and submit" `act` step — many search engines
 * serve a promotional homepage instead of results when the act handler
 * doesn't actually trigger a navigation (e.g. clicks the wrong element).
 *
 * For DuckDuckGo we use the JS-light `html.duckduckgo.com/html/` endpoint
 * which has a very clean DOM that's easy for LLMs to parse.
 */
function buildSerpUrl(engine: StagehandSearchEngine, query: string): string {
	const q = encodeURIComponent(query);
	switch (engine) {
		case "duckduckgo":
			return `https://html.duckduckgo.com/html/?q=${q}`;
		case "google":
			return `https://www.google.com/search?q=${q}&hl=en`;
		case "bing":
			return `https://www.bing.com/search?q=${q}`;
	}
}

function isOllamaModel(modelName: string): boolean {
	return modelName.toLowerCase().startsWith("ollama/");
}

// =============================================================================
// Global cleanup registry
// =============================================================================
// Each provider registers a close-on-exit callback in this set. We attach
// process listeners exactly once per Node process to avoid hitting
// MaxListenersExceededWarning when many providers are created (e.g. in tests).

type CloseCallback = () => Promise<void> | void;
const cleanupCallbacks = new Set<CloseCallback>();
let processListenersAttached = false;

function ensureProcessCleanupAttached(): void {
	if (processListenersAttached) return;
	processListenersAttached = true;
	const fire = () => {
		for (const cb of cleanupCallbacks) {
			try {
				void cb();
			} catch {
				// best-effort
			}
		}
		cleanupCallbacks.clear();
	};
	process.once("exit", fire);
	process.once("SIGINT", fire);
	process.once("SIGTERM", fire);
}

// =============================================================================
// Public env-driven loader
// =============================================================================

/**
 * Build StagehandSearchOptions from environment variables.
 * `fallbackApiKey` is provided by the caller (typically the CLI) and is used
 * only when `STAGEHAND_API_KEY` is not set.
 */
export function loadStagehandOptionsFromEnv(fallbackApiKey?: string): StagehandSearchOptions {
	const headlessEnv = process.env.STAGEHAND_HEADLESS;
	const visitEnv = process.env.STAGEHAND_VISIT_RESULTS;
	const verboseEnv = process.env.STAGEHAND_VERBOSE;
	const timeoutEnv = process.env.STAGEHAND_TIMEOUT_MS;

	return {
		modelName: process.env.STAGEHAND_MODEL,
		apiKey: process.env.STAGEHAND_API_KEY,
		baseURL: process.env.STAGEHAND_BASE_URL,
		fallbackApiKey,
		headless: headlessEnv === undefined ? undefined : !(headlessEnv === "0" || headlessEnv.toLowerCase() === "false"),
		searchEngine: parseSearchEngine(process.env.STAGEHAND_SEARCH_ENGINE),
		visitResults: visitEnv === "1" || visitEnv?.toLowerCase() === "true",
		timeoutMs: timeoutEnv ? Number(timeoutEnv) : undefined,
		verbose: verboseEnv ? (Math.max(0, Math.min(2, Number(verboseEnv))) as 0 | 1 | 2) : undefined,
	};
}

function parseSearchEngine(raw?: string): StagehandSearchEngine | undefined {
	if (!raw) return undefined;
	const v = raw.toLowerCase();
	if (v === "duckduckgo" || v === "google" || v === "bing") return v;
	return undefined;
}

// =============================================================================
// Provider factory
// =============================================================================

/**
 * Create a Stagehand-backed SearchProvider.
 *
 * The Stagehand client is constructed lazily on first `search()` call and
 * reused across calls (one Chromium per provider instance). It is closed
 * when the AbortSignal fires or the process exits.
 */
export function createStagehandSearchProvider(options: StagehandSearchOptions = {}): SearchProvider {
	const config = resolveConfig(options);
	const factory = options.clientFactory ?? defaultClientFactory;

	let clientPromise: Promise<StagehandClient> | null = null;
	let closed = false;

	async function getClient(): Promise<StagehandClient> {
		if (closed) throw new Error("Stagehand search provider has been closed.");
		if (!clientPromise) {
			const client = factory(config);
			clientPromise = client.init().then(() => client);
		}
		return clientPromise;
	}

	async function close(): Promise<void> {
		if (closed) return;
		closed = true;
		cleanupCallbacks.delete(close);
		if (clientPromise) {
			try {
				const client = await clientPromise;
				await client.close();
			} catch {
				// best-effort
			}
		}
	}

	// Register for best-effort process-exit cleanup using a single shared set
	// of process listeners (see ensureProcessCleanupAttached above).
	ensureProcessCleanupAttached();
	cleanupCallbacks.add(close);

	return {
		name: "stagehand",
		async search(query: string, numResults = 5, signal?: AbortSignal): Promise<SearchResult[]> {
			if (signal?.aborted) throw new Error("Aborted");

			const onAbort = () => {
				void close();
			};
			signal?.addEventListener("abort", onAbort, { once: true });

			try {
				const client = await getClient();
				// Go directly to the SERP URL (with the query baked in) rather
				// than loading the homepage and asking the LLM to type+submit.
				// The act-based flow regularly landed on a promotional/homepage
				// DOM with zero results, which then caused extract to return
				// prose instead of structured JSON.
				const url = buildSerpUrl(config.searchEngine, query);
				await client.goto(url, { timeout: config.timeoutMs });

				const cap = Math.min(numResults, 10);
				// `results` is optional + defaults to [] so a model that returns
				// `{}` (or even prose that we coerce to `{}` in the fetch
				// middleware) still validates against the schema.
				const schema = z.object({
					results: z
						.array(
							z.object({
								title: z.string().describe("the result title text"),
								url: z.string().url().describe("the absolute URL the result links to"),
								snippet: z.string().describe("the result description / snippet shown on the page"),
							}),
						)
						.max(cap)
						.default([]),
				});

				const extracted = await client.extract(
					`Extract up to ${cap} organic search results currently visible on this search engine results page. Each result has a title, an absolute URL, and a short description/snippet. Skip ads, sponsored results, and "people also ask" boxes. Respond with a JSON object of the form {"results":[{"title":"...","url":"...","snippet":"..."}]}. If there are no organic results visible, respond with {"results":[]}.`,
					schema,
				);

				let results: SearchResult[] = (extracted.results ?? []).slice(0, cap).map((r) => ({
					title: r.title,
					url: r.url,
					snippet: r.snippet,
				}));

				if (config.visitResults) {
					results = await enrichWithContent(client, results, config.timeoutMs, signal);
				}

				return results;
			} finally {
				signal?.removeEventListener("abort", onAbort);
			}
		},
	};
}

async function enrichWithContent(
	client: StagehandClient,
	results: SearchResult[],
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<SearchResult[]> {
	const out: SearchResult[] = [];
	for (const r of results) {
		if (signal?.aborted) break;
		try {
			await client.goto(r.url, { timeout: timeoutMs });
			const { extraction } = await client.extract(
				"Summarize the main textual content of this page in 2-4 sentences.",
				z.object({ extraction: z.string() }),
			);
			out.push({ ...r, content: extraction });
		} catch {
			out.push(r);
		}
	}
	return out;
}

// =============================================================================
// Internals
// =============================================================================

function resolveConfig(opts: StagehandSearchOptions): ResolvedStagehandConfig {
	const modelName = opts.modelName ?? DEFAULT_MODEL;
	const ollama = isOllamaModel(modelName);

	// API-key resolution:
	//   1. STAGEHAND_API_KEY (explicit override)
	//   2. provider-specific env (OLLAMA_API_KEY for ollama/*)
	//   3. fallbackApiKey (travel-agent's LLM key — only useful when the
	//      Stagehand model and the travel-agent share a provider)
	const providerKey = ollama ? process.env.OLLAMA_API_KEY : undefined;
	const apiKey = opts.apiKey ?? providerKey ?? opts.fallbackApiKey ?? "";
	if (!apiKey) {
		if (ollama) {
			throw new Error(
				"Stagehand search needs an Ollama Cloud API key. Create one at https://ollama.com/settings/keys and export OLLAMA_API_KEY=<key> (or set STAGEHAND_API_KEY).",
			);
		}
		throw new Error(
			"Stagehand search requires an API key. Set STAGEHAND_API_KEY, or rely on the travel-agent's fallback LLM key.",
		);
	}

	// Default base URL for ollama/* points at Ollama Cloud, not localhost.
	const baseURL = opts.baseURL ?? (ollama ? DEFAULT_OLLAMA_BASE_URL : undefined);

	return {
		modelName,
		apiKey,
		baseURL,
		headless: opts.headless ?? true,
		searchEngine: opts.searchEngine ?? DEFAULT_SEARCH_ENGINE,
		visitResults: opts.visitResults ?? false,
		timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		verbose: opts.verbose ?? 0,
	};
}

function defaultClientFactory(config: ResolvedStagehandConfig): StagehandClient {
	// Ollama's AI SDK provider (`ollama-ai-provider-v2`) does NOT honor an
	// `apiKey` field — auth must be passed via the `headers` map. For all
	// other providers, the standard `apiKey` field is what they expect.
	const ollama = isOllamaModel(config.modelName);
	const modelOpts = ollama
		? {
				modelName: config.modelName,
				headers: { Authorization: `Bearer ${config.apiKey}` },
				// Many Ollama "thinking" models (minimax-m2.7, deepseek-r1, ...)
				// wrap structured outputs in ```json ... ``` markdown fences,
				// which breaks Stagehand's JSON.parse in `act`/`observe`. Strip
				// fences at the fetch layer so the AI SDK sees raw JSON.
				fetch: createOllamaFenceStrippingFetch(),
				...(config.baseURL ? { baseURL: config.baseURL } : {}),
			}
		: {
				modelName: config.modelName,
				apiKey: config.apiKey,
				...(config.baseURL ? { baseURL: config.baseURL } : {}),
			};

	const stagehand = new Stagehand({
		env: "LOCAL",
		model: modelOpts,
		verbose: config.verbose,
		localBrowserLaunchOptions: { headless: config.headless },
	});

	return {
		async init() {
			await stagehand.init();
			// Ensure an active page exists for act/extract to operate on.
			await stagehand.context.newPage("about:blank");
		},
		async close() {
			await stagehand.close();
		},
		async goto(url: string, opts?: { timeout?: number }) {
			const page = stagehand.context.pages().at(-1) ?? (await stagehand.context.newPage());
			await page.goto(url, opts ? { timeoutMs: opts.timeout } : undefined);
		},
		async act(instruction: string) {
			await stagehand.act(instruction);
		},
		async extract<T>(instruction: string, schema: z.ZodType<T>): Promise<T> {
			// Cast at the boundary: stagehand's StagehandZodSchema generic
			// triggers deep type instantiation when bridging through z.ZodType<T>.
			const extractFn = stagehand.extract.bind(stagehand) as unknown as (
				instr: string,
				s: z.ZodType<T>,
			) => Promise<T>;
			return await extractFn(instruction, schema);
		},
	};
}

// =============================================================================
// Ollama JSON-fence stripping fetch
// =============================================================================
// Some Ollama "thinking" models (notably minimax-m2.7) wrap structured outputs
// in ```json ... ``` markdown fences. Stagehand's act/observe handlers call the
// AI SDK's generateText and JSON.parse the raw text — fences make that fail
// with `AI_JSONParseError`. This fetch wrapper unwraps those fences in the
// response body before the AI SDK ever sees it.
//
// Only the non-streaming JSON response (single object) is rewritten; NDJSON
// streams are passed through untouched so streaming use-cases keep working.

// Matches a ```json ... ``` (or bare ``` ... ```) fence anywhere in the text,
// not just when it's the entire string. Many "thinking" models emit prose
// commentary before/after the fence.
const FENCE_RE = /```(?:json)?\s*([\s\S]*?)\s*```/i;
// Fallback: an inline JSON object embedded in prose (greedy, last `{...}` block).
const INLINE_OBJECT_RE = /\{[\s\S]*\}/;

function stripJsonFences(text: string): string {
	const fenced = text.match(FENCE_RE);
	if (fenced?.[1]) return fenced[1].trim();

	const trimmed = text.trim();
	if (trimmed.startsWith("{")) return trimmed;

	// Last-ditch: pull the first {...} block out of prose.
	const inline = text.match(INLINE_OBJECT_RE);
	if (inline) return inline[0];

	// Prose-only response with no JSON anywhere. Some Ollama "thinking" models
	// (notably minimax-m2.7) will reply with a plain-text explanation
	// ("No organic search results are present...") instead of returning the
	// JSON object the caller asked for, which breaks the AI SDK's
	// generateObject parse step downstream.
	//
	// Returning `{}` keeps the response valid JSON; the extract schemas in
	// this provider use `.default([])` so an empty object cleanly resolves
	// to an empty-results object.
	if (trimmed.length > 0) return "{}";
	return text;
}

/**
 * Stagehand v3's `act` schema is:
 *   { action: { elementId, description, method, arguments: string[] } | null, twoStep: boolean }
 *
 * Ollama models routinely emit a *flattened* shape (top-level elementId/method/...)
 * and use `arguments: string` instead of `arguments: string[]`. Stagehand's
 * Zod validator then rejects the response with `AI_NoObjectGeneratedError`.
 *
 * This normalizer detects that flat shape and reshapes it into the expected
 * nested form so the AI SDK's `generateObject` validation passes.
 *
 * It's intentionally conservative: it only rewrites when both nested-action
 * fields are absent AND flat-action fields are present.
 */
export function normalizeStagehandActJson(text: string): string {
	const trimmed = text.trim();
	if (!trimmed.startsWith("{")) return text;
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return text;
	}
	if (!parsed || typeof parsed !== "object") return text;
	const obj = parsed as Record<string, unknown>;

	// Already in the v3 shape: { action: {...}, twoStep: boolean }
	const nestedAction = obj.action;
	if (nestedAction && typeof nestedAction === "object" && !Array.isArray(nestedAction)) {
		return text;
	}

	// Flat shape — many variants. Models alternately use `method` or `action`
	// (string) for the method name, and `arguments` or `value` for the value.
	const elementId = obj.elementId;
	if (typeof elementId !== "string") return text;

	const method = typeof obj.method === "string" ? obj.method : typeof obj.action === "string" ? obj.action : undefined;
	if (!method) return text;

	const rawArgs = "arguments" in obj ? obj.arguments : "value" in obj ? obj.value : undefined;
	const argsArray = Array.isArray(rawArgs)
		? rawArgs.map(String)
		: rawArgs == null || rawArgs === ""
			? []
			: [String(rawArgs)];

	const rewritten: Record<string, unknown> = {
		action: {
			elementId,
			description: typeof obj.description === "string" ? obj.description : "",
			method,
			arguments: argsArray,
		},
		twoStep: typeof obj.twoStep === "boolean" ? obj.twoStep : false,
	};
	return JSON.stringify(rewritten);
}

/**
 * Exported for testing. Wraps the global `fetch` so that single-object JSON
 * responses from Ollama have their `message.content` ```json fences stripped
 * before being returned to the AI SDK.
 */
export function createOllamaFenceStrippingFetch(): typeof fetch {
	return async (input, init) => {
		const response = await fetch(input as Parameters<typeof fetch>[0], init);
		const contentType = response.headers.get("content-type") ?? "";
		// Only rewrite single-object JSON responses. Streams (ndjson / event-stream)
		// pass through unchanged.
		if (!contentType.includes("application/json") || contentType.includes("ndjson")) {
			return response;
		}

		const raw = await response.text();
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return new Response(raw, {
				status: response.status,
				statusText: response.statusText,
				headers: response.headers,
			});
		}

		const rewritten = rewriteOllamaBody(parsed);
		const body = JSON.stringify(rewritten);
		const headers = new Headers(response.headers);
		headers.set("content-length", String(Buffer.byteLength(body)));
		return new Response(body, { status: response.status, statusText: response.statusText, headers });
	};
}

function transformContent(text: string): string {
	// Order matters: strip markdown fences first, then reshape Stagehand's
	// flat-act JSON into the nested shape its Zod validator expects.
	return normalizeStagehandActJson(stripJsonFences(text));
}

function rewriteOllamaBody(body: unknown): unknown {
	if (!body || typeof body !== "object") return body;
	const obj = body as Record<string, unknown>;
	const message = obj.message as Record<string, unknown> | undefined;
	if (message && typeof message.content === "string") {
		message.content = transformContent(message.content);
	}
	// OpenAI-compat path used by some Ollama frontends: { choices: [{ message: {...} }] }
	const choices = obj.choices;
	if (Array.isArray(choices)) {
		for (const choice of choices) {
			const m = (choice as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
			if (m && typeof m.content === "string") {
				m.content = transformContent(m.content);
			}
		}
	}
	return body;
}
