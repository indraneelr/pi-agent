import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stdin } from "node:process";
import { getActivePhase, getMandatoryPendingPreferences } from "../src/core/checklist.js";
import { createTravelSession } from "../src/core/sdk.js";
import type { SearchProvider, SearchResult } from "../src/core/search/types.js";
import type { TravelState } from "../src/core/state.js";

const MODEL_PROVIDER = "ollama" as const;
const MODEL_ID = process.env.TRAVEL_EVAL_MODEL ?? "kimi-k2.6";
const EVAL_DATA_ROOT = process.env.TRAVEL_STAGE1_PROMPTFOO_DATA_DIR ?? tmpdir();

const searchProvider: SearchProvider = {
	name: "promptfoo-stage1-unused-search-stub",
	async search(query: string): Promise<SearchResult[]> {
		return [
			{
				title: `Travel intake context for ${query}`,
				url: "https://example.com/travel-intake",
				snippet: "Preference intake should save destination, origin, dates, length, group, and budget before moving to destination shortlisting.",
			},
		];
	},
};

const model = {
	id: MODEL_ID,
	name: `Ollama Cloud: ${MODEL_ID}`,
	api: "openai-completions" as const,
	provider: MODEL_PROVIDER,
	baseUrl: "https://ollama.com/v1",
	reasoning: false,
	input: ["text" as const],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 128_000,
	maxTokens: 8_192,
	compat: {
		supportsStore: false,
		supportsDeveloperRole: false,
		supportsReasoningEffort: false,
		supportsUsageInStreaming: true,
		maxTokensField: "max_tokens" as const,
		supportsStrictMode: false,
		supportsLongCacheRetention: false,
	},
};

type Payload = {
	prompt: string;
	vars: Record<string, unknown>;
	config?: { timeoutMs?: number };
};

type Stage1Summary = {
	id: string;
	pass: boolean;
	failures: string[];
	prompt: string;
	expectComplete: boolean;
	expectedMissing: string[];
	durationMs: number;
	toolCalls: string[];
	messageEnds: number;
	activePhase: string | null;
	preferences: TravelState["preferences"];
	missingMandatory: string[];
	advancedToShortlist: boolean;
	savedDestinationResearch: boolean;
	error: string | null;
};

function readStdin(): Promise<string> {
	return new Promise((resolve, reject) => {
		let data = "";
		stdin.setEncoding("utf8");
		stdin.on("data", (chunk) => (data += chunk));
		stdin.on("end", () => resolve(data));
		stdin.on("error", reject);
	});
}

function asBool(value: unknown, fallback = false): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") return ["1", "true", "yes"].includes(value.toLowerCase());
	return fallback;
}

function asStringList(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(String);
	if (typeof value === "string" && value.trim()) return value.split(",").map((s) => s.trim()).filter(Boolean);
	return [];
}

function validateSummary(summary: Omit<Stage1Summary, "pass" | "failures">): string[] {
	const failures: string[] = [];
	const expectedMissing = new Set(summary.expectedMissing);
	const actualMissing = new Set(summary.missingMandatory);

	for (const field of expectedMissing) {
		if (!actualMissing.has(field)) failures.push(`expected missing mandatory preference "${field}", got [${summary.missingMandatory.join(", ")}]`);
	}

	if (summary.expectComplete) {
		if (summary.missingMandatory.length > 0) failures.push(`expected complete preferences, missing [${summary.missingMandatory.join(", ")}]`);
		if (!summary.advancedToShortlist) failures.push(`expected checklist to advance to shortlist_destinations, active phase is ${summary.activePhase}`);
	} else {
		if (summary.activePhase !== "gather_preferences") failures.push(`expected to stay in gather_preferences, active phase is ${summary.activePhase}`);
		if (summary.advancedToShortlist) failures.push("advanced to shortlist despite incomplete intake");
	}

	if (summary.savedDestinationResearch) failures.push("stage 1 intake saved destination research; shortlist work must wait for stage 2");
	if (Object.keys(summary.preferences).length === 0) failures.push("agent did not save any intake preferences");
	if (summary.error) failures.unshift(`run error: ${summary.error}`);
	return failures;
}

async function run(payload: Payload): Promise<Stage1Summary> {
	if (!process.env.OLLAMA_API_KEY) throw new Error("OLLAMA_API_KEY is not set; Stage 1 promptfoo live evals require Ollama Cloud credentials.");

	const id = String(payload.vars.id ?? `stage1-${Date.now()}`);
	const sessionId = `${id}-${Date.now()}`.replace(/[^a-zA-Z0-9_.-]/g, "-");
	const dataDir = mkdtempSync(join(EVAL_DATA_ROOT, "pi-travel-stage1-"));
	const expectComplete = asBool(payload.vars.expectComplete);
	const expectedMissing = asStringList(payload.vars.expectedMissing);
	const timeoutMs = Number(payload.config?.timeoutMs ?? process.env.TRAVEL_STAGE1_PROMPTFOO_TIMEOUT_MS ?? 120_000);
	const started = Date.now();
	const toolCalls: string[] = [];
	let messageEnds = 0;
	let error: string | null = null;

	const session = await createTravelSession({
		model,
		apiKey: process.env.OLLAMA_API_KEY,
		thinkingLevel: "off",
		sessionId,
		searchProvider,
		dataDir,
	});

	session.agent.subscribe((event) => {
		if (event.type === "tool_execution_start") {
			const name = (event as any).toolCall?.name ?? (event as any).name ?? "unknown";
			toolCalls.push(String(name));
		}
		if (event.type === "message_end") messageEnds++;
	});

	const timeout = new Promise<never>((_, reject) => {
		setTimeout(() => {
			session.agent.abort();
			reject(new Error(`Timed out after ${timeoutMs}ms`));
		}, timeoutMs).unref();
	});

	try {
		await Promise.race([session.agent.prompt(payload.prompt), timeout]);
	} catch (err) {
		error = err instanceof Error ? err.message : String(err);
	} finally {
		await session.shutdown().catch(() => undefined);
	}

	const activePhase = getActivePhase(session.state.checklist)?.id ?? null;
	const missingMandatory = getMandatoryPendingPreferences(session.state.preferences);
	const base = {
		id,
		prompt: payload.prompt,
		expectComplete,
		expectedMissing,
		durationMs: Date.now() - started,
		toolCalls,
		messageEnds,
		activePhase,
		preferences: session.state.preferences,
		missingMandatory,
		advancedToShortlist: activePhase === "shortlist_destinations",
		savedDestinationResearch: Boolean(session.state.destinationResearch),
		error,
	};
	const failures = validateSummary(base);
	rmSync(dataDir, { recursive: true, force: true });
	return { ...base, pass: failures.length === 0, failures };
}

const payload = JSON.parse(await readStdin()) as Payload;
const result = await run(payload);
process.stdout.write(JSON.stringify(result));
