/**
 * Stage 3 selected-place activity research live eval.
 *
 * Seeds confirmed preferences, destination research, and selected places,
 * advances the checklist to research_experiences, asks the agent to research
 * activities with bounded web_search usage, then validates the persisted
 * activitiesResearch artifact with deterministic activity-fit checks.
 *
 * Run: npx tsx scripts/activity-research-eval.ts
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scoreActivityResearchQuality, type ActivityResearchQuality } from "../src/core/activity-fit.js";
import { advanceChecklist, loadChecklistConfig } from "../src/core/checklist.js";
import { saveTravelState } from "../src/core/persistence.js";
import { createTravelSession } from "../src/core/sdk.js";
import type { SearchProvider, SearchResult } from "../src/core/search/types.js";
import { createTravelState, type TravelState } from "../src/core/state.js";
import type { Activity, DestinationResearch, SubDestination, TravelPreferences } from "../src/core/types.js";

const ROOT = new URL("../../../", import.meta.url).pathname;
const OUT_DIR = join(ROOT, "docs", "activity-research-evals");
const DATA_DIR = join(OUT_DIR, "travel-data");
const REPORT_PATH = join(ROOT, "docs", "travel-agent-activity-research-eval-report.md");
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
	name: "activity-eval-search-stub",
	async search(query: string): Promise<SearchResult[]> {
		return [
			{
				title: `Activity options and booking notes for ${query}`,
				url: "https://example.com/activity-options",
				snippet:
					"Choose activity sets by selected base. Include 4-6 options per place, realistic duration and cost estimates, and source caveats for booking, queues, weather, seasonality, and transit time.",
			},
			{
				title: `Family, budget, and logistics guidance for ${query}`,
				url: "https://example.com/activity-logistics",
				snippet:
					"Families benefit from shorter blocks, hands-on museums, shallow beaches, early starts, and explicit stroller/heat/queue notes. Budget trips should mix free walks, markets, beaches, and one paid highlight.",
			},
			{
				title: `Food, culture, and beach experiences for ${query}`,
				url: "https://example.com/activity-themes",
				snippet:
					"Strong activity research maps each option to stated themes such as beaches, culture, history, food, and easy logistics, then names the practical tradeoff rather than listing generic attractions.",
			},
		];
	},
};

const stamp = Date.now();

interface ActivityEvalSpec {
	id: string;
	kind: string;
	preferences: TravelPreferences;
	destinationResearch: DestinationResearch;
	selectedDestinations: SubDestination[];
	selectedPlaceNames: string[];
	prompt: string;
}

const allRuns: ActivityEvalSpec[] = [
	{
		id: `act-greece-family-${stamp}`,
		kind: "Stage 3 Greece family activities",
		preferences: {
			destination: "Greece",
			origin: "Berlin",
			from_date: "2026-06-20",
			to_date: "2026-06-30",
			num_nights: 10,
			group_size: 4,
			group_type: "family with kids",
			ages_in_group: [8, 11],
			budget: { amount: 6500, currency: "EUR", category: "mid-range" },
			travel_themes: ["beaches", "culture", "food", "easy logistics"],
			pace_of_travel: "moderate",
		},
		destinationResearch: makeDestinationResearch("Greece", ["Athens", "Naxos"], "family with kids", 10),
		selectedDestinations: [makeSelectedDest("Athens"), makeSelectedDest("Naxos")],
		selectedPlaceNames: ["Athens", "Naxos"],
		prompt:
			"The user selected Athens and Naxos. Complete the active research_experiences phase now. Use exactly one web_search call for activity context, then save activities_research with exactly 4-6 practical activities per selected place. Include duration, cost, reviews, sources, tips/caveats tied to family, logistics, budget, June heat/crowds, beaches, culture, food, and trip length. Save before prose.",
	},
	{
		id: `act-japan-couple-${stamp}`,
		kind: "Stage 3 Japan couple activities",
		preferences: {
			destination: "Japan",
			origin: "San Francisco",
			from_date: "2026-04-05",
			to_date: "2026-04-14",
			num_nights: 9,
			group_size: 2,
			group_type: "couple",
			budget: { amount: 6000, currency: "USD", category: "mid-range" },
			travel_themes: ["food", "culture", "history"],
			pace_of_travel: "moderate",
		},
		destinationResearch: makeDestinationResearch("Japan", ["Tokyo", "Kyoto"], "couple", 9),
		selectedDestinations: [makeSelectedDest("Tokyo"), makeSelectedDest("Kyoto")],
		selectedPlaceNames: ["Tokyo", "Kyoto"],
		prompt:
			"The user selected Tokyo and Kyoto. Complete the active research_experiences phase now. Use exactly one web_search call for activity context, then save activities_research with exactly 4-6 practical activities per selected place. Include food/culture/history fit, realistic duration/cost, reviews, sources, booking/logistics, cherry-blossom crowd caveats, and trip-length pacing. Save before prose.",
	},
	{
		id: `act-portugal-friends-${stamp}`,
		kind: "Stage 3 Portugal friends activities",
		preferences: {
			destination: "Portugal",
			origin: "London",
			from_date: "2026-09-10",
			to_date: "2026-09-17",
			num_nights: 7,
			group_size: 3,
			group_type: "friends",
			budget: { amount: 3000, currency: "EUR", category: "budget" },
			travel_themes: ["food", "beaches", "nightlife"],
			pace_of_travel: "moderate",
		},
		destinationResearch: makeDestinationResearch("Portugal", ["Lisbon", "Porto"], "friends", 7),
		selectedDestinations: [makeSelectedDest("Lisbon"), makeSelectedDest("Porto")],
		selectedPlaceNames: ["Lisbon", "Porto"],
		prompt:
			"The user selected Lisbon and Porto. Complete the active research_experiences phase now. Use exactly one web_search call for activity context, then save activities_research with exactly 4-6 practical activities per selected place. Include food/beach/nightlife fit, budget tradeoffs, September weather/crowds, transport/logistics, duration/cost, reviews, sources, and practical caveats. Save before prose.",
	},
];

const onlyPattern = process.env.TRAVEL_EVAL_ONLY;
const runs = onlyPattern ? allRuns.filter((run) => run.id.includes(onlyPattern) || run.kind.toLowerCase().includes(onlyPattern.toLowerCase())) : allRuns;
if (runs.length === 0) throw new Error(`TRAVEL_EVAL_ONLY=${onlyPattern} matched no activity eval runs`);

function makeDestinationResearch(destination: string, places: string[], groupType: string, numNights: number): DestinationResearch {
	return {
		destination: { title: destination, name: destination, description: `${destination} selected route.`, bestTimeToVisit: "Check dates.", reviews: {}, sources: [] },
		subDestinations: places.map((name) => makeSelectedDest(name)),
		overallSummary: `${destination} selected route for ${numNights} nights.`,
		tripHighlights: [],
		travelTips: [],
		preferencesUsed: { themes: [], groupType, numNights },
		nextUserAction: "Research activities for selected places.",
		schemaVersion: "2.0.0",
	};
}

function makeSelectedDest(name: string): SubDestination {
	return { name, type: "place", description: `${name} selected by user.`, selected: true, reviews: {}, sources: [] };
}

function activitiesSatisfied(state: TravelState, spec: ActivityEvalSpec): boolean {
	const activities = state.activitiesResearch?.activities ?? [];
	return countsSatisfied(activities, spec.selectedPlaceNames) && scoreActivityResearchQuality(activities, spec.preferences, spec.selectedDestinations).pass;
}

function countsSatisfied(activities: readonly Activity[], selectedPlaceNames: readonly string[]): boolean {
	return Object.values(countBySelectedPlace(activities, selectedPlaceNames)).every((count) => count >= 4 && count <= 6);
}

function countBySelectedPlace(activities: readonly Activity[], selectedPlaceNames: readonly string[]) {
	return Object.fromEntries(
		selectedPlaceNames.map((place) => [
			place,
			activities.filter((activity) => String(activity.location ?? "").toLowerCase().includes(place.toLowerCase())).length,
		]),
	) as Record<string, number>;
}

function scoreState(state: TravelState, spec: ActivityEvalSpec) {
	const activities = state.activitiesResearch?.activities ?? [];
	const quality = scoreActivityResearchQuality(activities, spec.preferences, spec.selectedDestinations);
	const failures = [...quality.issues];
	const counts = countBySelectedPlace(activities, spec.selectedPlaceNames);
	for (const [place, count] of Object.entries(counts)) {
		if (count < 4 || count > 6) failures.unshift(`Expected 4-6 persisted activities for ${place}; received ${count}.`);
	}
	if (activities.length === 0) failures.unshift("No activitiesResearch artifact was persisted.");
	return { activities, counts, quality, failures };
}

async function runOne(spec: ActivityEvalSpec) {
	const seeded = createTravelState(spec.id, loadChecklistConfig(CHECKLIST_CONFIG_PATH));
	seeded.preferences = spec.preferences;
	seeded.destinationResearch = spec.destinationResearch;
	seeded.selectedDestinations = spec.selectedDestinations;
	for (let i = 0; i < 3; i++) seeded.checklist = advanceChecklist(seeded.checklist);
	saveTravelState(seeded, { dataDir: DATA_DIR });

	const session = await createTravelSession({
		model,
		apiKey,
		thinkingLevel: "off",
		sessionId: spec.id,
		searchProvider,
		dataDir: DATA_DIR,
		promptOptions: {
			minImageLinks: 0,
			appendSystemPrompt:
				"# EVAL MODE INSTRUCTIONS (overrides default workflow)\n\n" +
				"- Do NOT call verify_research_data.\n" +
				"- Use exactly ONE web_search call for activity context, then stop searching.\n" +
				"- Save before prose using update_travel_state with field=\"activities_research\".\n" +
				"- Persist a top-level { activities: [...] } payload.\n" +
				"- Provide exactly 4-6 activities per selected destination; put the selected destination name in each activity.location.\n" +
				"- Every activity needs name, type, description, location, estimatedDurationHours, estimatedCost, reviews, sources, tips, and bestTimeToVisit.\n" +
				"- Every activity must include a practical caveat/tradeoff tied to relevant stated axes: logistics, budget, season/dates, trip length, kids/family, beaches, culture, or food.\n" +
				"- If search is thin, use travel knowledge, label estimates, and save regardless.",
		},
	});

	let toolStarts = 0;
	let artifactSatisfiedAt: number | null = null;
	const eventLog: string[] = [];
	const abortIfSatisfied = () => {
		if (artifactSatisfiedAt) return;
		if (activitiesSatisfied(session.state, spec)) {
			artifactSatisfiedAt = Date.now();
			session.agent.abort();
		}
	};
	session.agent.subscribe((event) => {
		if (event.type === "tool_execution_start") {
			toolStarts++;
			const toolName = (event as any).toolCall?.name ?? (event as any).name ?? "unknown";
			const summary = summarizeToolEvent(event);
			eventLog.push(`tool_start:${toolName}${summary ? `:${summary}` : ""}`);
			console.log(`[${spec.id}] tool_start ${toolName}${summary ? ` ${summary}` : ""}`);
		}
		if (event.type === "tool_execution_end") {
			const toolName = (event as any).toolCall?.name ?? (event as any).name ?? "unknown";
			const summary = summarizeToolEvent(event);
			eventLog.push(`tool_end:${toolName}${summary ? `:${summary}` : ""}`);
			console.log(`[${spec.id}] tool_end ${toolName}${summary ? ` ${summary}` : ""}`);
			abortIfSatisfied();
		}
		if (event.type === "message_end") {
			eventLog.push("message_end");
			console.log(`[${spec.id}] message_end`);
		}
	});

	const started = Date.now();
	let timedOut = false;
	let runError: string | null = null;
	const timeoutMs = Number(process.env.TRAVEL_EVAL_TIMEOUT_MS ?? 240_000);
	const timeout = new Promise<never>((_, reject) => {
		setTimeout(() => {
			timedOut = true;
			session.agent.abort();
			reject(new Error(`Timed out after ${timeoutMs}ms`));
		}, timeoutMs).unref();
	});
	try {
		await Promise.race([session.agent.prompt(spec.prompt), timeout]);
		for (let repair = 1; repair <= 2 && !activitiesSatisfied(session.state, spec); repair++) {
			console.log(`[${spec.id}] repair ${repair}: activities_research missing or incomplete; re-prompting`);
			await Promise.race([
				session.agent.prompt(
					`The previous turn did not save passing activities_research for ${spec.selectedPlaceNames.join(" and ")}. ` +
						`Call update_travel_state now with field=\"activities_research\" and exactly 4-6 activities per selected destination. Include location names, duration, cost, tips/caveats tied to preferences, and sources.`,
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
	const score = scoreState(state, spec);
	if (timedOut && !artifactSatisfiedAt && score.failures.length) score.failures.unshift(`run timed out after ${(timeoutMs / 1000).toFixed(0)}s`);
	if (runError && !timedOut && !artifactSatisfiedAt && score.failures.length) score.failures.unshift(`run error: ${runError}`);
	return {
		sessionId: spec.id,
		kind: spec.kind,
		activePhase: state.checklist.phases[state.checklist.activePhaseIndex]?.id,
		selectedPlaceNames: spec.selectedPlaceNames,
		activityCount: score.activities.length,
		countsByPlace: score.counts,
		quality: score.quality,
		failures: score.failures,
		pass: score.failures.length === 0,
		durationMs,
		toolStarts,
		savedPath,
		eventLog,
	};
}

function formatActivityAxis(axis: ActivityResearchQuality["relevantAxes"][number]): string {
	return axis.replace(/([A-Z])/g, " $1").toLowerCase();
}

function summarizeToolEvent(event: unknown): string {
	const record = event && typeof event === "object" ? (event as Record<string, any>) : {};
	const details = {
		name: record.toolCall?.name ?? record.name,
		args: record.toolCall?.arguments ?? record.args ?? record.input,
		status: record.status,
		error: record.error?.message ?? record.error ?? record.result?.error,
		content: record.result?.content ?? record.output?.content,
	};
	const text = JSON.stringify(details, (_key, value) => (typeof value === "string" && value.length > 500 ? `${value.slice(0, 500)}…` : value));
	return text === "{}" ? "" : text.slice(0, 900);
}

function renderReport(results: Awaited<ReturnType<typeof runOne>>[]) {
	const passCount = results.filter((r) => r.pass).length;
	const qualityPass = results.filter((r) => r.quality.pass).length;
	const lines: string[] = [];
	lines.push("# Activity Research Eval Report — Stage 3 Live Runs");
	lines.push("");
	lines.push(`Generated: ${new Date().toISOString()}`);
	lines.push(`Model: ${MODEL_PROVIDER}/${MODEL_ID}`);
	lines.push("Search: deterministic eval search stub via live web_search tool calls");
	lines.push("");
	lines.push("## Executive summary");
	lines.push("");
	lines.push(`- Activity research runs passing: ${passCount}/${results.length}`);
	lines.push(`- scoreActivityResearchQuality passing: ${qualityPass}/${results.length}`);
	lines.push("- Scope: Stage 3 selected-place activity research after destination selection.");
	lines.push("- Checks: selected-place coverage, 4-6 options per selected place, user theme/preference fit, duration/cost realism, practical tips, and contextual caveats/tradeoffs.");
	lines.push("");
	lines.push("## Results");
	lines.push("");
	lines.push("| Run | Eval | Activities | Counts by place | Status | Duration | Tool calls |");
	lines.push("|---|---|---:|---|---|---:|---:|");
	for (const r of results) {
		lines.push(`| ${r.sessionId} | ${r.kind} | ${r.activityCount} | ${Object.entries(r.countsByPlace).map(([p, c]) => `${p}: ${c}`).join(", ")} | ${r.pass ? "PASS" : "FAIL"} | ${(r.durationMs / 1000).toFixed(1)}s | ${r.toolStarts} |`);
	}
	lines.push("");
	for (const r of results) {
		lines.push(`## ${r.sessionId}`);
		lines.push("");
		lines.push(`- Eval: ${r.kind}`);
		lines.push(`- Status: ${r.pass ? "PASS" : "FAIL"}`);
		lines.push(`- Active phase after run: ${r.activePhase}`);
		lines.push(`- Activities persisted: ${r.activityCount}`);
		lines.push(`- Selected places: ${r.selectedPlaceNames.join(", ")}`);
		lines.push(`- Relevant quality axes: ${r.quality.relevantAxes.map(formatActivityAxis).join(", ")}`);
		lines.push("");
		lines.push("### Coverage by axis");
		lines.push("");
		lines.push("| Axis | Activities addressing |");
		lines.push("|---|---:|");
		for (const axis of r.quality.relevantAxes) lines.push(`| ${formatActivityAxis(axis)} | ${r.quality.coverageByAxis[axis]} |`);
		lines.push("");
		lines.push("### Activity scores");
		lines.push("");
		for (const activity of r.quality.activityScores) {
			lines.push(`- ${activity.name} (${activity.location}; matched: ${activity.matchedDestination ?? "none"}) — fit ${(activity.fitRatio * 100).toFixed(0)}%, caveat severity ${activity.tradeoffSeverity}, axes ${activity.tradeoffRelevantAxes.join(", ") || "none"}`);
			if (activity.issues.length) lines.push(`  - Issues: ${activity.issues.join("; ")}`);
		}
		if (r.failures.length) {
			lines.push("");
			lines.push("### Failures");
			lines.push("");
			for (const f of r.failures) lines.push(`- ${f}`);
		} else {
			lines.push("");
			lines.push("### Failures: none");
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
