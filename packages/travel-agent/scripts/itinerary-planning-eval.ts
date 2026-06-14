/**
 * Stage 4 itinerary-planning live eval.
 *
 * Seeds confirmed preferences, selected places, and approved activities, advances
 * the checklist to plan_itinerary, asks the agent to run itinerary planning with
 * bounded web_search usage, then validates the persisted itineraryResearch with
 * deterministic itinerary-fit checks.
 *
 * Run: npx tsx scripts/itinerary-planning-eval.ts
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { advanceChecklist, loadChecklistConfig } from "../src/core/checklist.js";
import {
	formatItineraryQualityAxis,
	scoreItineraryResearchQuality,
	type ItineraryResearchQuality,
} from "../src/core/itinerary-fit.js";
import { saveTravelState } from "../src/core/persistence.js";
import { createTravelSession } from "../src/core/sdk.js";
import type { SearchProvider, SearchResult } from "../src/core/search/types.js";
import { createTravelState, type TravelState } from "../src/core/state.js";
import type { Activity, DestinationResearch, SubDestination, TravelPreferences } from "../src/core/types.js";

const ROOT = new URL("../../../", import.meta.url).pathname;
const OUT_DIR = join(ROOT, "docs", "itinerary-planning-evals");
const DATA_DIR = join(OUT_DIR, "travel-data");
const REPORT_PATH = join(ROOT, "docs", "travel-agent-itinerary-planning-eval-report.md");
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
	name: "itinerary-eval-search-stub",
	async search(query: string): Promise<SearchResult[]> {
		return [
			{
				title: `Itinerary routing and timing for ${query}`,
				url: "https://example.com/itinerary-routing",
				snippet:
					"Build day-by-day routes by clustering nearby activities, leaving arrival/departure days light, and reserving explicit transfer blocks between cities or islands. Avoid more than 2 major activities per day for moderate pace.",
			},
			{
				title: `Season, budget, and booking notes for ${query}`,
				url: "https://example.com/itinerary-season-budget",
				snippet:
					"Peak-season mornings reduce queue and heat risk. Reserve intercity trains, ferries, and popular museums ahead. Add budget caveats for paid tours and choose free walks or markets to balance splurge days.",
			},
			{
				title: `Local pacing and rest guidance for ${query}`,
				url: "https://example.com/itinerary-pacing",
				snippet:
					"Good itineraries include lunch/rest buffers, transport time, and practical alternatives if weather or crowds disrupt the plan. Families need extra downtime; friends/couples can handle later evenings but still need transfer buffers.",
			},
		];
	},
};

const stamp = Date.now();

interface ItineraryEvalSpec {
	id: string;
	kind: string;
	preferences: TravelPreferences;
	destinationResearch: DestinationResearch;
	selectedDestinations: SubDestination[];
	activities: Activity[];
	selectedPlaceNames: string[];
	prompt: string;
}

const runs: ItineraryEvalSpec[] = [
	{
		id: `itin-greece-family-${stamp}`,
		kind: "Stage 4 Greece family itinerary",
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
		activities: [
			makeActivity("Acropolis Early-Entry Family Visit", "Athens", "culture", 3),
			makeActivity("Plaka Evening Food Walk", "Athens", "food", 2.5),
			makeActivity("Athens Riviera Beach Afternoon", "Athens", "beaches", 4),
			makeActivity("Agios Prokopios Beach Day", "Naxos", "beaches", 5),
			makeActivity("Naxos Chora Castle Walk", "Naxos", "culture", 3),
			makeActivity("Village Cooking Class", "Naxos", "food", 4),
		],
		prompt:
			"Activities are approved for Athens and Naxos. Complete the active plan_itinerary phase now. Use web_search for itinerary routing/pacing context, then save itinerary_research with a practical day-by-day 10-night plan using the approved activities. Include dates, day numbers, places, transport/rest buffers, costs, and caveats. Save before prose.",
	},
	{
		id: `itin-japan-couple-${stamp}`,
		kind: "Stage 4 Japan couple itinerary",
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
		activities: [
			makeActivity("Tsukiji Food Walk", "Tokyo", "food", 3),
			makeActivity("Senso-ji Heritage Visit", "Tokyo", "culture", 2),
			makeActivity("Shibuya Evening Food Crawl", "Tokyo", "food", 3),
			makeActivity("Fushimi Inari Dawn Hike", "Kyoto", "culture", 3),
			makeActivity("Gion Evening Walk", "Kyoto", "culture", 3),
			makeActivity("Nishiki Market Food Tour", "Kyoto", "food", 2),
		],
		prompt:
			"Activities are approved for Tokyo and Kyoto. Complete the active plan_itinerary phase now. Use web_search for routing/pacing context, then save itinerary_research with a practical day-by-day 9-night plan using the approved activities. Include the Tokyo-to-Kyoto transfer, dates, day numbers, places, transport/rest buffers, costs, and caveats. Save before prose.",
	},
	{
		id: `itin-portugal-friends-${stamp}`,
		kind: "Stage 4 Portugal friends itinerary",
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
		activities: [
			makeActivity("Alfama Food Crawl", "Lisbon", "food", 3),
			makeActivity("Cascais Beach Day", "Lisbon", "beaches", 5),
			makeActivity("Bairro Alto Nightlife Crawl", "Lisbon", "nightlife food", 3),
			makeActivity("Ribeira Walking Tour", "Porto", "food culture", 3),
			makeActivity("Matosinhos Beach Seafood Afternoon", "Porto", "beaches food", 4),
			makeActivity("Bolhao Market Food Tour", "Porto", "food", 2),
		],
		prompt:
			"Activities are approved for Lisbon and Porto. Complete the active plan_itinerary phase now. Use web_search for routing/pacing context, then save itinerary_research with a practical day-by-day 7-night plan using the approved activities. Include the Lisbon-to-Porto transfer, dates, day numbers, places, transport/rest buffers, costs, and caveats. Save before prose.",
	},
];

function makeDestinationResearch(destination: string, places: string[], groupType: string, numNights: number): DestinationResearch {
	return {
		destination: { title: destination, name: destination, description: `${destination} selected route.`, bestTimeToVisit: "Check dates.", reviews: {}, sources: [] },
		subDestinations: places.map((name) => makeSelectedDest(name)),
		overallSummary: `${destination} selected route for ${numNights} nights.`,
		tripHighlights: [],
		travelTips: [],
		preferencesUsed: { themes: [], groupType, numNights },
		nextUserAction: "Activities approved. Plan itinerary.",
		schemaVersion: "2.0.0",
	};
}

function makeSelectedDest(name: string): SubDestination {
	return { name, type: "place", description: `${name} selected by user.`, selected: true, reviews: {}, sources: [] };
}

function makeActivity(name: string, location: string, themes: string, hours: number): Activity {
	return {
		name,
		type: themes,
		description: `${name} in ${location}; fits ${themes} with practical logistics and budget caveats.`,
		location,
		estimatedDurationHours: hours,
		estimatedCost: 40,
		themes: themes.split(/\s+/),
		tips: `Book ahead for peak dates; group nearby sights to avoid transfer waste and budget creep.`,
		bestTimeToVisit: "Morning or early evening depending on crowds and heat.",
		reviews: { rating: 4.5, reviewSummary: "Eval seed activity", sources: [] },
		sources: ["https://example.com/activities"],
	};
}

function itinerarySatisfied(state: TravelState, spec: ItineraryEvalSpec): boolean {
	return scoreItineraryResearchQuality(state.itineraryResearch, spec.preferences, spec.selectedDestinations, spec.activities).pass;
}

function scoreState(state: TravelState, spec: ItineraryEvalSpec) {
	const quality = scoreItineraryResearchQuality(state.itineraryResearch, spec.preferences, spec.selectedDestinations, spec.activities);
	return {
		itinerary: state.itineraryResearch?.itinerary ?? [],
		quality,
		failures: quality.issues,
	};
}

async function runOne(spec: ItineraryEvalSpec) {
	const seeded = createTravelState(spec.id, loadChecklistConfig(CHECKLIST_CONFIG_PATH));
	seeded.preferences = spec.preferences;
	seeded.destinationResearch = spec.destinationResearch;
	seeded.selectedDestinations = spec.selectedDestinations;
	seeded.activitiesResearch = { activities: spec.activities };
	for (let i = 0; i < 4; i++) seeded.checklist = advanceChecklist(seeded.checklist);
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
				"- Use exactly ONE web_search call for itinerary routing/pacing context, then stop searching.\n" +
				"- Save before prose using update_travel_state with field=\"itinerary_research\".\n" +
				"- Include 1 day object per meaningful travel day with ISO date, dayNumber, place, and activities.\n" +
				"- Every day must avoid overload: 1-3 planned activities and at most 8 planned activity hours.\n" +
				"- Use selected places and approved activity names where practical; include transfers/rest buffers as itinerary activities.\n" +
				"- Each day/activity should mention logistics, budget, season/date/crowd, and trip-length/pacing caveats where relevant.\n" +
				"- If search is thin, use travel knowledge, label estimates, and save regardless.",
		},
	});

	let toolStarts = 0;
	let artifactSatisfiedAt: number | null = null;
	const eventLog: string[] = [];
	const abortIfSatisfied = () => {
		if (artifactSatisfiedAt) return;
		if (itinerarySatisfied(session.state, spec)) {
			artifactSatisfiedAt = Date.now();
			session.agent.abort();
		}
	};
	session.agent.subscribe((event) => {
		if (event.type === "tool_execution_start") {
			toolStarts++;
			const toolName = (event as any).toolCall?.name ?? (event as any).name ?? "unknown";
			eventLog.push(`tool_start:${toolName}`);
			console.log(`[${spec.id}] tool_start ${toolName}`);
		}
		if (event.type === "tool_execution_end") {
			const toolName = (event as any).toolCall?.name ?? (event as any).name ?? "unknown";
			eventLog.push(`tool_end:${toolName}`);
			console.log(`[${spec.id}] tool_end ${toolName}`);
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
		for (let repair = 1; repair <= 2 && !itinerarySatisfied(session.state, spec); repair++) {
			console.log(`[${spec.id}] repair ${repair}: itinerary_research missing or incomplete; re-prompting`);
			await Promise.race([
				session.agent.prompt(
					`The previous turn did not save a passing itinerary_research for ${spec.selectedPlaceNames.join(" and ")}. ` +
						`Call update_travel_state now with field="itinerary_research". Keep days sequential, use approved activity names, include selected places, and avoid overloading days.`,
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
	if (timedOut && !artifactSatisfiedAt && !score.quality.pass) score.failures.unshift(`run timed out after ${(timeoutMs / 1000).toFixed(0)}s`);
	if (runError && !timedOut && !artifactSatisfiedAt && !score.quality.pass) score.failures.unshift(`run error: ${runError}`);
	return {
		sessionId: spec.id,
		kind: spec.kind,
		activePhase: state.checklist.phases[state.checklist.activePhaseIndex]?.id,
		selectedPlaceNames: spec.selectedPlaceNames,
		dayCount: score.quality.dayScores.length,
		itinerary: score.itinerary,
		quality: score.quality,
		failures: score.failures,
		pass: score.failures.length === 0,
		durationMs,
		toolStarts,
		savedPath,
		eventLog,
	};
}

function renderReport(results: Awaited<ReturnType<typeof runOne>>[]) {
	const passCount = results.filter((r) => r.pass).length;
	const qualityPass = results.filter((r) => r.quality.pass).length;
	const lines: string[] = [];
	lines.push("# Itinerary Planning Eval Report — Stage 4 Live Runs");
	lines.push("");
	lines.push(`Generated: ${new Date().toISOString()}`);
	lines.push(`Model: ${MODEL_PROVIDER}/${MODEL_ID}`);
	lines.push(`Search: deterministic eval search stub via live web_search tool calls`);
	lines.push("");
	lines.push("## Executive summary");
	lines.push("");
	lines.push(`- Itinerary planning runs passing: ${passCount}/${results.length}`);
	lines.push(`- scoreItineraryResearchQuality passing: ${qualityPass}/${results.length}`);
	lines.push("- Scope: Stage 4 day-by-day itinerary planning after selected places and approved activities.");
	lines.push("- Checks: selected-place coverage, approved activity usage, date sequence, daily load, logistics, budget, season/date caveats, and trip-length realism.");
	lines.push("");
	lines.push("## Results");
	lines.push("");
	lines.push("| Run | Eval | Days | Selected places | Status | Duration | Tool calls |");
	lines.push("|---|---|---:|---|---|---:|---:|");
	for (const r of results) {
		lines.push(`| ${r.sessionId} | ${r.kind} | ${r.dayCount} | ${r.selectedPlaceNames.join(" + ")} | ${r.pass ? "PASS" : "FAIL"} | ${(r.durationMs / 1000).toFixed(1)}s | ${r.toolStarts} |`);
	}
	lines.push("");
	for (const r of results) {
		lines.push(`## ${r.sessionId}`);
		lines.push("");
		lines.push(`- Eval: ${r.kind}`);
		lines.push(`- Status: ${r.pass ? "PASS" : "FAIL"}`);
		lines.push(`- Active phase after run: ${r.activePhase}`);
		lines.push(`- Days persisted: ${r.dayCount}`);
		lines.push(`- Selected places: ${r.selectedPlaceNames.join(", ")}`);
		lines.push(`- Relevant quality axes: ${r.quality.relevantAxes.map(formatItineraryQualityAxis).join(", ")}`);
		lines.push(`- Approved activities matched: ${r.quality.approvedActivityMatches.length}`);
		lines.push("");
		lines.push("### Coverage by axis");
		lines.push("");
		lines.push("| Axis | Days addressing |");
		lines.push("|---|---:|");
		for (const axis of r.quality.relevantAxes) lines.push(`| ${formatItineraryQualityAxis(axis)} | ${r.quality.coverageByAxis[axis]} |`);
		lines.push("");
		lines.push("### Day scores");
		lines.push("");
		for (const day of r.quality.dayScores) {
			lines.push(`${day.dayNumber}. ${day.date} — ${day.place}: ${day.activityCount} activities, ${day.totalPlannedHours}h; selected places: ${day.matchedSelectedPlaces.join(", ") || "none"}; approved activities: ${day.matchedApprovedActivities.length}`);
			if (day.issues.length) lines.push(`   - Issues: ${day.issues.join("; ")}`);
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
