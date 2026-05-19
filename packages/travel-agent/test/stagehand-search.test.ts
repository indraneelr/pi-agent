import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { detectSearchProvider } from "../src/core/search/index.js";
import {
	createOllamaFenceStrippingFetch,
	createStagehandSearchProvider,
	loadStagehandOptionsFromEnv,
	normalizeStagehandActJson,
	type StagehandClient,
} from "../src/core/search/stagehand.js";

// =============================================================================
// Helpers
// =============================================================================

interface FakeState {
	gotoCalls: Array<{ url: string }>;
	actCalls: string[];
	extractCalls: Array<{ instruction: string }>;
	initCount: number;
	closeCount: number;
}

function makeFakeClient(opts: {
	results?: Array<{ title: string; url: string; snippet: string }>;
	pageContent?: string;
	gotoError?: Error;
	state?: FakeState;
}): { client: StagehandClient; state: FakeState } {
	const state: FakeState = opts.state ?? {
		gotoCalls: [],
		actCalls: [],
		extractCalls: [],
		initCount: 0,
		closeCount: 0,
	};

	const client: StagehandClient = {
		async init() {
			state.initCount++;
		},
		async close() {
			state.closeCount++;
		},
		async goto(url: string) {
			state.gotoCalls.push({ url });
			if (opts.gotoError) throw opts.gotoError;
		},
		async act(instruction: string) {
			state.actCalls.push(instruction);
		},
		async extract<T>(instruction: string, schema: z.ZodType<T>): Promise<T> {
			state.extractCalls.push({ instruction });
			// Try the candidate shapes against the schema, clipping the results
			// list down if the schema enforces a max length.
			const allResults = opts.results ?? [];
			const sizes = [allResults.length, 10, 5, 1, 0];
			for (const n of sizes) {
				const candidates: unknown[] = [
					{ results: allResults.slice(0, n) },
					{ extraction: opts.pageContent ?? "summary text" },
				];
				for (const candidate of candidates) {
					const parsed = schema.safeParse(candidate);
					if (parsed.success) return parsed.data;
				}
			}
			throw new Error(`No fake data matched schema for instruction: ${instruction}`);
		},
	};

	return { client, state };
}

// =============================================================================
// Tests
// =============================================================================

describe("Stagehand search provider", () => {
	const envBackup = { ...process.env };

	beforeEach(() => {
		// Reset env between tests
		delete process.env.USE_STAGEHAND;
		delete process.env.STAGEHAND_API_KEY;
		delete process.env.STAGEHAND_MODEL;
		delete process.env.STAGEHAND_BASE_URL;
		delete process.env.STAGEHAND_HEADLESS;
		delete process.env.STAGEHAND_SEARCH_ENGINE;
		delete process.env.STAGEHAND_VISIT_RESULTS;
		delete process.env.STAGEHAND_TIMEOUT_MS;
		delete process.env.STAGEHAND_VERBOSE;
		delete process.env.OLLAMA_API_KEY;
	});

	afterEach(() => {
		process.env = { ...envBackup };
		vi.restoreAllMocks();
	});

	it("errors with Ollama-specific guidance when default model has no key", () => {
		expect(() => createStagehandSearchProvider({})).toThrow(/OLLAMA_API_KEY/);
	});

	it("uses OLLAMA_API_KEY when default ollama model is selected", () => {
		process.env.OLLAMA_API_KEY = "ollama-key";
		expect(() => createStagehandSearchProvider({})).not.toThrow();
	});

	it("explicit STAGEHAND_API_KEY takes precedence over OLLAMA_API_KEY", () => {
		process.env.OLLAMA_API_KEY = "from-ollama";
		const provider = createStagehandSearchProvider({ apiKey: "explicit" });
		expect(provider.name).toBe("stagehand");
	});

	it("non-Ollama model: fallbackApiKey is used when apiKey not set", () => {
		expect(() =>
			createStagehandSearchProvider({ modelName: "openai/gpt-4o", fallbackApiKey: "fallback" }),
		).not.toThrow();
	});

	it("non-Ollama model with no keys throws generic error", () => {
		expect(() => createStagehandSearchProvider({ modelName: "openai/gpt-4o" })).toThrow(/STAGEHAND_API_KEY/);
	});

	it("returns parsed SearchResult[] from extracted data", async () => {
		const { client, state } = makeFakeClient({
			results: [
				{ title: "Tokyo Travel Guide", url: "https://example.com/tokyo", snippet: "Visit Tokyo" },
				{ title: "Things to do", url: "https://example.com/todo", snippet: "Activities" },
			],
		});

		const provider = createStagehandSearchProvider({
			apiKey: "test-key",
			clientFactory: () => client,
		});

		const results = await provider.search("Tokyo travel", 5);
		expect(provider.name).toBe("stagehand");
		expect(results).toHaveLength(2);
		expect(results[0]).toEqual({
			title: "Tokyo Travel Guide",
			url: "https://example.com/tokyo",
			snippet: "Visit Tokyo",
		});
		expect(state.initCount).toBe(1);
		expect(state.gotoCalls[0].url).toContain("duckduckgo.com");
		// Query is baked into the SERP URL (no more flaky type+submit act).
		expect(state.gotoCalls[0].url).toContain(encodeURIComponent("Tokyo travel"));
		expect(state.actCalls).toHaveLength(0);
	});

	it("respects numResults cap (max 10)", async () => {
		const many = Array.from({ length: 15 }, (_, i) => ({
			title: `r${i}`,
			url: `https://example.com/${i}`,
			snippet: `s${i}`,
		}));
		const { client } = makeFakeClient({ results: many });

		const provider = createStagehandSearchProvider({
			apiKey: "test-key",
			clientFactory: () => client,
		});

		const results = await provider.search("q", 50);
		expect(results.length).toBeLessThanOrEqual(10);
	});

	it("reuses a single client across multiple searches", async () => {
		const { client, state } = makeFakeClient({
			results: [{ title: "t", url: "https://example.com/", snippet: "s" }],
		});
		const provider = createStagehandSearchProvider({
			apiKey: "test-key",
			clientFactory: () => client,
		});

		await provider.search("q1");
		await provider.search("q2");

		expect(state.initCount).toBe(1);
		expect(state.gotoCalls).toHaveLength(2);
	});

	it("honors searchEngine option", async () => {
		const { client, state } = makeFakeClient({
			results: [{ title: "t", url: "https://example.com/", snippet: "s" }],
		});
		const provider = createStagehandSearchProvider({
			apiKey: "test-key",
			searchEngine: "google",
			clientFactory: () => client,
		});

		await provider.search("q");
		expect(state.gotoCalls[0].url).toContain("google.com");
	});

	it("enriches with content when visitResults is true", async () => {
		const { client, state } = makeFakeClient({
			results: [{ title: "t", url: "https://example.com/page", snippet: "s" }],
			pageContent: "page summary",
		});
		const provider = createStagehandSearchProvider({
			apiKey: "test-key",
			visitResults: true,
			clientFactory: () => client,
		});

		const results = await provider.search("q");
		expect(results[0].content).toBe("page summary");
		// First goto = SERP, then one per result
		expect(state.gotoCalls.length).toBeGreaterThanOrEqual(2);
	});

	it("rejects immediately when signal is already aborted", async () => {
		const { client } = makeFakeClient({ results: [] });
		const provider = createStagehandSearchProvider({
			apiKey: "test-key",
			clientFactory: () => client,
		});
		const ctrl = new AbortController();
		ctrl.abort();
		await expect(provider.search("q", 5, ctrl.signal)).rejects.toThrow(/abort/i);
	});

	it("closes the underlying client when aborted mid-flight", async () => {
		const { client, state } = makeFakeClient({
			results: [{ title: "t", url: "https://example.com/", snippet: "s" }],
		});
		const provider = createStagehandSearchProvider({
			apiKey: "test-key",
			clientFactory: () => client,
		});

		const ctrl = new AbortController();
		const p = provider.search("q", 5, ctrl.signal);
		ctrl.abort();
		await p.catch(() => {}); // result depends on timing
		// Allow the close microtask to run
		await new Promise((r) => setTimeout(r, 10));
		expect(state.closeCount).toBeGreaterThanOrEqual(1);
	});
});

describe("loadStagehandOptionsFromEnv", () => {
	beforeEach(() => {
		delete process.env.STAGEHAND_MODEL;
		delete process.env.STAGEHAND_API_KEY;
		delete process.env.STAGEHAND_HEADLESS;
		delete process.env.STAGEHAND_SEARCH_ENGINE;
		delete process.env.STAGEHAND_VISIT_RESULTS;
		delete process.env.STAGEHAND_TIMEOUT_MS;
		delete process.env.STAGEHAND_VERBOSE;
	});

	it("returns sensible defaults when env is empty", () => {
		const opts = loadStagehandOptionsFromEnv("fallback-key");
		expect(opts.fallbackApiKey).toBe("fallback-key");
		expect(opts.modelName).toBeUndefined();
		expect(opts.apiKey).toBeUndefined();
		expect(opts.headless).toBeUndefined();
		expect(opts.searchEngine).toBeUndefined();
		expect(opts.visitResults).toBe(false);
	});

	it("reads all overrides from env", () => {
		process.env.STAGEHAND_MODEL = "openai/gpt-4o";
		process.env.STAGEHAND_API_KEY = "sk-test";
		process.env.STAGEHAND_HEADLESS = "false";
		process.env.STAGEHAND_SEARCH_ENGINE = "google";
		process.env.STAGEHAND_VISIT_RESULTS = "1";
		process.env.STAGEHAND_TIMEOUT_MS = "30000";
		process.env.STAGEHAND_VERBOSE = "2";

		const opts = loadStagehandOptionsFromEnv();
		expect(opts.modelName).toBe("openai/gpt-4o");
		expect(opts.apiKey).toBe("sk-test");
		expect(opts.headless).toBe(false);
		expect(opts.searchEngine).toBe("google");
		expect(opts.visitResults).toBe(true);
		expect(opts.timeoutMs).toBe(30000);
		expect(opts.verbose).toBe(2);
	});

	it("ignores unknown search engine", () => {
		process.env.STAGEHAND_SEARCH_ENGINE = "yahoo";
		const opts = loadStagehandOptionsFromEnv();
		expect(opts.searchEngine).toBeUndefined();
	});
});

describe("normalizeStagehandActJson", () => {
	it("reshapes flat-act JSON into { action: {...}, twoStep } and arrays arguments", () => {
		const flat = JSON.stringify({
			elementId: "0-33",
			description: "combobox: Search with DuckDuckGo",
			method: "type",
			arguments: "tokyo ramen",
		});
		const out = normalizeStagehandActJson(flat);
		expect(JSON.parse(out)).toEqual({
			action: {
				elementId: "0-33",
				description: "combobox: Search with DuckDuckGo",
				method: "type",
				arguments: ["tokyo ramen"],
			},
			twoStep: false,
		});
	});

	it("keeps array `arguments` as-is", () => {
		const flat = JSON.stringify({
			elementId: "0-1",
			description: "",
			method: "click",
			arguments: [],
		});
		const out = JSON.parse(normalizeStagehandActJson(flat)) as {
			action: { arguments: unknown };
		};
		expect(out.action.arguments).toEqual([]);
	});

	it("preserves twoStep when present", () => {
		const flat = JSON.stringify({
			elementId: "0-1",
			description: "",
			method: "click",
			arguments: [],
			twoStep: true,
		});
		const out = JSON.parse(normalizeStagehandActJson(flat)) as { twoStep: boolean };
		expect(out.twoStep).toBe(true);
	});

	it("leaves already-nested act JSON untouched", () => {
		const nested = JSON.stringify({
			action: { elementId: "0-1", description: "d", method: "click", arguments: [] },
			twoStep: false,
		});
		expect(normalizeStagehandActJson(nested)).toBe(nested);
	});

	it("leaves non-act JSON untouched", () => {
		const extract = JSON.stringify({ results: [{ title: "t", url: "https://example.com", snippet: "s" }] });
		expect(normalizeStagehandActJson(extract)).toBe(extract);
	});

	it("leaves invalid / non-object text untouched", () => {
		expect(normalizeStagehandActJson("not json")).toBe("not json");
		expect(normalizeStagehandActJson("null")).toBe("null");
		expect(normalizeStagehandActJson("[]")).toBe("[]");
	});

	it("accepts `action` (string) as the method name (legacy v2 field)", () => {
		const flat = JSON.stringify({
			elementId: "0-33",
			action: "fill",
			description: "search box",
		});
		const out = JSON.parse(normalizeStagehandActJson(flat)) as {
			action: { method: string; arguments: unknown[] };
		};
		expect(out.action.method).toBe("fill");
		expect(out.action.arguments).toEqual([]);
	});

	it("accepts `value` (string) as the argument", () => {
		const flat = JSON.stringify({
			elementId: "0-33",
			method: "fill",
			value: "tokyo ramen",
		});
		const out = JSON.parse(normalizeStagehandActJson(flat)) as {
			action: { arguments: unknown[] };
		};
		expect(out.action.arguments).toEqual(["tokyo ramen"]);
	});
});

describe("stripJsonFences (via fetch wrapper) — fences embedded in prose", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	function mockChatResponse(content: string): void {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ message: { role: "assistant", content }, done: true }), {
				status: 200,
				headers: { "content-type": "application/json" },
			})) as typeof fetch;
	}

	it("extracts fenced JSON from a message that has prose before and after the fence", async () => {
		mockChatResponse(
			'Looking at the tree, here is the action:\n\n```json\n{"elementId":"0-33","action":"fill","description":"d"}\n```\n\nNote: after this you should...',
		);
		const res = await createOllamaFenceStrippingFetch()("https://ollama.com/api/chat");
		const body = (await res.json()) as { message: { content: string } };
		const parsed = JSON.parse(body.message.content) as { action: { elementId: string; method: string } };
		expect(parsed.action.elementId).toBe("0-33");
		expect(parsed.action.method).toBe("fill");
	});

	it("extracts an inline JSON object when no fence is present", async () => {
		mockChatResponse('Here is the action: {"elementId":"0-1","method":"click","arguments":[]} and other text');
		const res = await createOllamaFenceStrippingFetch()("https://ollama.com/api/chat");
		const body = (await res.json()) as { message: { content: string } };
		const parsed = JSON.parse(body.message.content) as { action: { elementId: string } };
		expect(parsed.action.elementId).toBe("0-1");
	});
});

describe("Ollama JSON-fence stripping fetch", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	function mockFetch(body: unknown, contentType = "application/json"): void {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify(body), {
				status: 200,
				headers: { "content-type": contentType },
			})) as typeof fetch;
	}

	async function readJson(res: Response): Promise<unknown> {
		return JSON.parse(await res.text());
	}

	it("unwraps ```json fences AND reshapes flat-act JSON into the nested v3 form", async () => {
		mockFetch({
			message: {
				role: "assistant",
				content: '```json\n{"elementId":"42","action":"fill","value":"hi"}\n```',
			},
			done: true,
		});

		const wrapped = createOllamaFenceStrippingFetch();
		const res = await wrapped("https://ollama.com/api/chat");
		const body = (await readJson(res)) as { message: { content: string } };

		// Fence stripped + flat shape reshaped into Stagehand v3's nested schema.
		const parsed = JSON.parse(body.message.content) as {
			action: { elementId: string; method: string; arguments: unknown[] };
			twoStep: boolean;
		};
		expect(parsed.action.elementId).toBe("42");
		expect(parsed.action.method).toBe("fill");
		expect(parsed.action.arguments).toEqual(["hi"]);
		expect(parsed.twoStep).toBe(false);
	});

	it("unwraps fences without the json language tag", async () => {
		mockFetch({ message: { role: "assistant", content: '```\n{"a":1}\n```' }, done: true });
		const res = await createOllamaFenceStrippingFetch()("https://ollama.com/api/chat");
		const body = (await readJson(res)) as { message: { content: string } };
		expect(body.message.content).toBe('{"a":1}');
	});

	it("leaves already-clean JSON content untouched", async () => {
		mockFetch({ message: { role: "assistant", content: '{"a":1}' }, done: true });
		const res = await createOllamaFenceStrippingFetch()("https://ollama.com/api/chat");
		const body = (await readJson(res)) as { message: { content: string } };
		expect(body.message.content).toBe('{"a":1}');
	});

	it("rewrites OpenAI-compat choices[].message.content as well", async () => {
		mockFetch({
			choices: [
				{ message: { role: "assistant", content: '```json\n{"x":1}\n```' } },
				{ message: { role: "assistant", content: "plain text" } },
			],
		});
		const res = await createOllamaFenceStrippingFetch()("https://ollama.com/api/chat");
		const body = (await readJson(res)) as { choices: Array<{ message: { content: string } }> };
		expect(body.choices[0].message.content).toBe('{"x":1}');
		// Prose-only responses are coerced to `{}` so the AI SDK's
		// generateObject step doesn't crash on JSON.parse — provider schemas
		// in this module use `.default([])` to absorb the empty object.
		expect(body.choices[1].message.content).toBe("{}");
	});

	it("coerces prose-only content with NO JSON anywhere into `{}`", async () => {
		// Repro for the minimax-m2.7 failure mode where extract returns a
		// plain-text explanation ("No organic search results are present...")
		// instead of a JSON object. Without coercion, generateObject crashes
		// with AI_JSONParseError.
		mockFetch({
			message: {
				role: "assistant",
				content:
					"\n\nNo organic search results are present in the provided DOM structure. The page appears to be DuckDuckGo's homepage.",
			},
			done: true,
		});
		const res = await createOllamaFenceStrippingFetch()("https://ollama.com/api/chat");
		const body = (await readJson(res)) as { message: { content: string } };
		expect(body.message.content).toBe("{}");
	});

	it("passes streaming (ndjson) responses through untouched", async () => {
		const ndjson = '{"message":{"content":"```json\\n{\\"a\\":1}\\n```"}}\n';
		globalThis.fetch = (async () =>
			new Response(ndjson, {
				status: 200,
				headers: { "content-type": "application/x-ndjson" },
			})) as typeof fetch;

		const res = await createOllamaFenceStrippingFetch()("https://ollama.com/api/chat");
		const text = await res.text();
		expect(text).toBe(ndjson);
	});
});

describe("detectSearchProvider with Stagehand as default", () => {
	const envBackup = { ...process.env };

	beforeEach(() => {
		delete process.env.USE_STAGEHAND;
		delete process.env.BRAVE_API_KEY;
		delete process.env.LINKUP_API_KEY;
		delete process.env.GEMINI_API_KEY;
		delete process.env.USE_OBSCURA;
		delete process.env.STAGEHAND_API_KEY;
		delete process.env.OLLAMA_API_KEY;
	});

	afterEach(() => {
		process.env = { ...envBackup };
	});

	it("Stagehand is the default when OLLAMA_API_KEY is set", () => {
		process.env.OLLAMA_API_KEY = "ollama-key";
		const provider = detectSearchProvider();
		expect(provider?.name).toBe("stagehand");
	});

	it("Stagehand wins over Brave when both are configured", () => {
		process.env.OLLAMA_API_KEY = "ollama-key";
		process.env.BRAVE_API_KEY = "brave-key";
		const provider = detectSearchProvider();
		expect(provider?.name).toBe("stagehand");
	});

	it("USE_STAGEHAND=0 disables Stagehand and falls back to Brave", () => {
		process.env.USE_STAGEHAND = "0";
		process.env.BRAVE_API_KEY = "brave-key";
		const provider = detectSearchProvider();
		expect(provider?.name).toBe("brave");
	});

	it("USE_STAGEHAND=false disables Stagehand and falls back to Linkup", () => {
		process.env.USE_STAGEHAND = "false";
		process.env.LINKUP_API_KEY = "linkup-key";
		const provider = detectSearchProvider();
		expect(provider?.name).toBe("linkup");
	});

	it("returns null when Stagehand is disabled and no other provider is set", () => {
		process.env.USE_STAGEHAND = "0";
		expect(detectSearchProvider()).toBeNull();
	});
});
