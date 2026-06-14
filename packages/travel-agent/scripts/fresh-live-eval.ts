import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { advanceChecklist, loadChecklistConfig } from "../src/core/checklist.js";
import {
	formatShortlistPreferenceFit,
	scoreShortlistPreferenceFit,
} from "../src/core/preference-fit.js";
import { saveTravelState } from "../src/core/persistence.js";
import { createTravelSession } from "../src/core/sdk.js";
import type { SearchProvider, SearchResult } from "../src/core/search/types.js";
import type { TravelPreferences } from "../src/core/types.js";
import { createTravelState, type TravelState } from "../src/core/state.js";

const ROOT = new URL("../../../", import.meta.url).pathname;
const OUT_DIR = join(ROOT, "docs", "fresh-travel-evals");
const DATA_DIR = join(OUT_DIR, "travel-data");
const REPORT_PATH = join(ROOT, "docs", "travel-agent-fresh-eval-report.md");
const CHECKLIST_CONFIG_PATH = join(ROOT, "packages", "travel-agent", "checklist-config.json");

const MODEL_PROVIDER = "ollama" as const;
const MODEL_ID = process.env.TRAVEL_EVAL_MODEL ?? "kimi-k2.6";
const model = {
	id: MODEL_ID,
	name: `Ollama Cloud: ${MODEL_ID}`,
	api: "openai-completions" as const,
	provider: "ollama",
	baseUrl: "https://ollama.com/v1",
	reasoning: false,
	input: ["text" as const],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 128_000,
	maxTokens: 16_384,
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
const apiKey = process.env.OLLAMA_API_KEY;
if (!apiKey) throw new Error("OLLAMA_API_KEY is not set");

const searchProvider: SearchProvider = {
	name: "fresh-eval-search-stub",
	async search(query: string): Promise<SearchResult[]> {
		return [
			{
				title: `Greece travel planning context for ${query}`,
				url: "https://example.com/greece-planning",
				snippet:
					"Greece family itineraries often combine Athens with islands such as Naxos, Paros, Crete, Milos, Corfu, Rhodes, and Santorini. Summer ferries are frequent but island-hopping adds transfer overhead.",
			},
			{
				title: `Family-friendly Greece logistics for ${query}`,
				url: "https://example.com/greece-family-logistics",
				snippet:
					"For kids, prefer fewer bases, beaches with shallow water, short ferry hops, apartment hotels, and clear tradeoffs between iconic sights, crowds, cost, and travel time.",
			},
			{
				title: `Greece season and budget notes for ${query}`,
				url: "https://example.com/greece-season-budget",
				snippet:
					"June and September are usually easier than peak July-August. Cyclades can be windy; Crete and Rhodes offer longer seasons; Santorini is iconic but expensive and crowded.",
			},
		];
	},
};

type RunSpec = { id: string; prompt: string; kind: string; preferences: TravelPreferences };

const stamp = Date.now();
const runs: RunSpec[] = [
	{
		id: `fresh-greece-family-${stamp}`,
		kind: "E03b country/region place menu",
		preferences: {
			destination: "Greece",
			origin: "Berlin",
			from_date: "2026-06-20",
			to_date: "2026-06-30",
			num_nights: 10,
			group_size: 4,
			group_type: "family with kids",
			budget: { amount: 6500, currency: "EUR", category: "mid-range" },
			travel_themes: ["beaches", "culture", "food", "easy logistics"],
		},
		prompt:
			"Preferences are confirmed. Complete the active shortlist_destinations phase now. Research and save a choice-first Greece place menu with 8-10 distinct place option cards. Do not create a final itinerary. Use update_travel_state with field destination_research, then ask me to choose places.",
	},
	{
		id: `fresh-surprise-couple-${stamp}`,
		kind: "E03 broad surprise shortlist",
		preferences: {
			destination: "surprise me / undecided",
			origin: "Berlin",
			from_date: "2026-09-01",
			to_date: "2026-09-08",
			num_nights: 7,
			group_size: 2,
			group_type: "couple",
			budget: { amount: 3500, currency: "EUR", category: "mid-range" },
			travel_themes: ["food", "beaches", "culture", "easy logistics"],
		},
		prompt:
			"Preferences are confirmed. Complete the active shortlist_destinations phase now. Research and save 3-5 broad destination option cards for a surprise-me trip. Do not create a final itinerary. Use update_travel_state with field destination_research, then ask me to choose one destination.",
	},
	{
		id: `fresh-long-greece-${stamp}`,
		kind: "E03b long country/region place menu",
		preferences: {
			destination: "Greece",
			origin: "Berlin",
			from_date: "2026-07-01",
			to_date: "2026-07-18",
			num_nights: 17,
			group_size: 4,
			group_type: "family with kids",
			budget: { amount: 10000, currency: "EUR", category: "mid-range" },
			travel_themes: ["beaches", "islands", "culture", "kid-friendly logistics"],
		},
		prompt:
			"Preferences are confirmed. Complete the active shortlist_destinations phase now. Because this is over 14 days, research and save 10-12 distinct Greece place option cards. Do not create a final itinerary. Use update_travel_state with field destination_research, then ask me to choose places.",
	},
];

function text(v: unknown): string {
	return typeof v === "string" ? v.trim() : "";
}

function scoreDestinationCards(state: TravelState, spec: RunSpec) {
	const cards = state.destinationResearch?.subDestinations ?? [];
	const names = cards.map((c) => text(c.name)).filter(Boolean);
	const unique = new Set(names.map((n) => n.toLowerCase()));
	const isSurprise = /surprise/i.test(spec.id);
	const isLong = /long/i.test(spec.id);
	const min = isSurprise ? 3 : 8;
	const max = isSurprise ? 5 : isLong ? 12 : 10;
	const required = ["description", "bestFor", "why", "roughDays", "logisticsFit", "budgetFit", "seasonNote", "tradeoff", "imageQuery"] as const;
	const cardFailures: string[] = [];
	for (const [i, card] of cards.entries()) {
		for (const field of required) {
			if (!text((card as any)[field])) cardFailures.push(`${card.name || `card ${i + 1}`} missing ${field}`);
		}
	}
	if (!state.destinationResearch?.nextUserAction) cardFailures.push("missing nextUserAction");
	if (cards.length < min || cards.length > max) cardFailures.push(`expected ${min}-${max} cards, got ${cards.length}`);
	if (unique.size !== names.length) cardFailures.push(`duplicate names detected: ${names.length - unique.size}`);

	// Preference-fit layer: score cards against the actual run preferences, not
	// just schema/shape. Surfaces uncovered theme axes and non-contextual tradeoffs.
	const preferenceFit = scoreShortlistPreferenceFit(cards, spec.preferences);
	for (const issue of preferenceFit.issues) cardFailures.push(`preference-fit: ${issue}`);

	return { cards, names, uniqueCount: unique.size, expectedRange: `${min}-${max}`, cardFailures, preferenceFit };
}

function summarizeState(state: TravelState, spec: RunSpec) {
	const s = scoreDestinationCards(state, spec);
	return {
		sessionId: state.sessionId,
		kind: spec.kind,
		activePhase: state.checklist.phases[state.checklist.activePhaseIndex]?.id,
		preferencesCaptured: Boolean(state.preferences.destination || state.preferences.origin || state.preferences.from_date || state.preferences.budget),
		cardCount: s.cards.length,
		uniqueCount: s.uniqueCount,
		expectedRange: s.expectedRange,
		names: s.names,
		preferenceFit: s.preferenceFit,
		preferenceFitLines: formatShortlistPreferenceFit(s.preferenceFit),
		failures: s.cardFailures,
		pass: s.cardFailures.length === 0,
		nextUserAction: state.destinationResearch?.nextUserAction ?? null,
	};
}

async function runOne(spec: RunSpec) {
	// Fresh live eval starts at the confirmed-preferences checkpoint, so seed
	// the persisted state before creating the agent. This ensures the initial
	// system prompt is born in shortlist_destinations rather than gather_preferences.
	const seeded = createTravelState(spec.id, loadChecklistConfig(CHECKLIST_CONFIG_PATH));
	seeded.preferences = spec.preferences;
	seeded.checklist = advanceChecklist(seeded.checklist);
	saveTravelState(seeded, { dataDir: DATA_DIR });

	const session = await createTravelSession({
		model,
		apiKey,
		thinkingLevel: "off",
		sessionId: spec.id,
		searchProvider,
		dataDir: DATA_DIR,
	});

	let events = 0;
	let toolStarts = 0;
	let artifactSatisfiedAt: number | null = null;
	const eventLog: string[] = [];
	const abortIfArtifactSatisfied = () => {
		if (artifactSatisfiedAt) return;
		if (scoreDestinationCards(session.state, spec).cardFailures.length === 0) {
			artifactSatisfiedAt = Date.now();
			session.agent.abort();
		}
	};
	session.agent.subscribe((event) => {
		events++;
		if (event.type === "tool_execution_start") {
			toolStarts++;
			eventLog.push(`tool_start:${(event as any).toolCall?.name ?? (event as any).name ?? "unknown"}`);
			console.log(`[${spec.id}] tool_start ${eventLog.at(-1)}`);
		}
		if (event.type === "tool_execution_end") {
			eventLog.push(`tool_end:${(event as any).toolCall?.name ?? (event as any).name ?? "unknown"}`);
			console.log(`[${spec.id}] tool_end ${eventLog.at(-1)}`);
			abortIfArtifactSatisfied();
		}
		if (event.type === "message_end") {
			eventLog.push("message_end");
			console.log(`[${spec.id}] message_end`);
		}
	});
	const started = Date.now();
	let timedOut = false;
	let runError: string | null = null;
	const timeoutMs = Number(process.env.TRAVEL_EVAL_TIMEOUT_MS ?? 180_000);
	const timeout = new Promise<never>((_, reject) => {
		setTimeout(() => {
			timedOut = true;
			session.agent.abort();
			reject(new Error(`Timed out after ${timeoutMs}ms`));
		}, timeoutMs).unref();
	});
	try {
		await Promise.race([session.agent.prompt(spec.prompt), timeout]);
		for (let repair = 1; repair <= 2 && !session.state.destinationResearch; repair++) {
			console.log(`[${spec.id}] repair ${repair}: destination_research missing; forcing update_travel_state`);
			await Promise.race([
				session.agent.prompt(
					`The previous turn did not save destination_research. Do not search. Do not explain. Call update_travel_state now with field="destination_research" and a complete payload satisfying this eval: ${spec.prompt}`,
				),
				timeout,
			]);
		}
	} catch (err) {
		runError = err instanceof Error ? err.message : String(err);
		if (artifactSatisfiedAt && /abort/i.test(runError)) runError = null;
	} finally {
		await session.shutdown().catch(() => undefined);
	}
	const durationMs = (artifactSatisfiedAt ?? Date.now()) - started;
	const savedPath = join(DATA_DIR, `${spec.id}.json`);
	const state = JSON.parse(readFileSync(savedPath, "utf-8")) as TravelState;
	const summary = summarizeState(state, spec);
	if (timedOut && !artifactSatisfiedAt) summary.failures.unshift(`run timed out after ${(timeoutMs / 1000).toFixed(0)}s`);
	if (runError && !timedOut && !artifactSatisfiedAt) summary.failures.unshift(`run error: ${runError}`);
	return { ...summary, pass: summary.failures.length === 0, durationMs, toolStarts, savedPath, eventLog };
}

function renderReport(results: Awaited<ReturnType<typeof runOne>>[]) {
	const passCount = results.filter((r) => r.pass).length;
	const prefFitPass = results.filter((r) => r.preferenceFit?.pass).length;
	const lines: string[] = [];
	lines.push("# Fresh Travel Agent Eval Report — Post-fix Live Runs");
	lines.push("");
	lines.push(`Generated: ${new Date().toISOString()}`);
	lines.push(`Model: ${MODEL_PROVIDER}/${MODEL_ID}`);
	lines.push(`Search: deterministic eval search stub`);
	lines.push("");
	lines.push("## Executive summary");
	lines.push("");
	lines.push(`- Fresh live runs passing: ${passCount}/${results.length}`);
	lines.push(`- Preference-fit layer passing: ${prefFitPass}/${results.length} (cards scored against actual run preferences, not just schema)`);
	lines.push("- Scope: Stage 2 choice-first destination/place menu guardrails. Later itinerary, flights, activities, and hotels require additional multi-turn evals after selecting places.");
	lines.push("- These runs use the current code and fresh session IDs, not the old saved Greece fixtures.");
	lines.push("");
	lines.push("## Results");
	lines.push("");
	lines.push("| Run | Eval | Cards | Unique | Expected | Status | Duration | Tool calls |");
	lines.push("|---|---|---:|---:|---|---|---:|---:|");
	for (const r of results) {
		lines.push(`| ${r.sessionId} | ${r.kind} | ${r.cardCount} | ${r.uniqueCount} | ${r.expectedRange} | ${r.pass ? "PASS" : "FAIL"} | ${(r.durationMs / 1000).toFixed(1)}s | ${r.toolStarts} |`);
	}
	lines.push("");
	for (const r of results) {
		lines.push(`## ${r.sessionId}`);
		lines.push("");
		lines.push(`- Eval: ${r.kind}`);
		lines.push(`- Status: ${r.pass ? "PASS" : "FAIL"}`);
		lines.push(`- Active phase after run: ${r.activePhase}`);
		lines.push(`- Cards: ${r.cardCount}; unique: ${r.uniqueCount}; expected: ${r.expectedRange}`);
		lines.push(`- Next user action: ${r.nextUserAction ?? "missing"}`);
		lines.push(`- Names: ${r.names.join(", ") || "none"}`);
		const fit = r.preferenceFit;
		if (fit) {
			lines.push("- Preference fit:");
			lines.push(
				`  - Theme coverage: ${fit.themeAxes.length ? fit.themeAxes.join(", ") : "none"}${fit.uncoveredThemeAxes.length ? ` — UNCOVERED: ${fit.uncoveredThemeAxes.join(", ")}` : ""}`,
			);
			for (const line of r.preferenceFitLines ?? []) lines.push(`  - ${line}`);
		}
		if (r.failures.length) {
			lines.push("- Failures:");
			for (const f of r.failures) lines.push(`  - ${f}`);
		} else {
			lines.push("- Failures: none");
		}
		lines.push("");
	}
	return lines.join("\n");
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(DATA_DIR, { recursive: true });

const results = [];
for (const spec of runs) {
	console.log(`Running ${spec.id}...`);
	results.push(await runOne(spec));
	console.log(JSON.stringify(results.at(-1), null, 2));
}
const report = renderReport(results);
writeFileSync(REPORT_PATH, report);
writeFileSync(join(OUT_DIR, "summary.json"), JSON.stringify(results, null, 2));
console.log(`REPORT ${REPORT_PATH}`);
console.log(report);
