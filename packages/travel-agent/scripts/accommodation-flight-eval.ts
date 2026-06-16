/**
 * Stage 5 accommodation/flight live eval.
 *
 * Seeds confirmed preferences, selected places, approved activities, and a passing
 * itinerary, advances the checklist to research_accommodation_flights, asks the
 * agent to research lodging + flights with bounded web_search usage, then scores
 * the persisted artifacts using deterministic accommodation-flight checks.
 *
 * Run: npx tsx scripts/accommodation-flight-eval.ts
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scoreAccommodationFlightResearchQuality, type AccommodationFlightQuality } from "../src/core/accommodation-flight-fit.js";
import { advanceChecklist, loadChecklistConfig } from "../src/core/checklist.js";
import { saveTravelState } from "../src/core/persistence.js";
import { createTravelSession } from "../src/core/sdk.js";
import type { SearchProvider, SearchResult } from "../src/core/search/types.js";
import { createTravelState, type TravelState } from "../src/core/state.js";
import type { Activity, DestinationResearch, ItineraryActivity, ItineraryResearch, SubDestination, TravelPreferences } from "../src/core/types.js";

const ROOT = new URL("../../../", import.meta.url).pathname;
const OUT_DIR = join(ROOT, "docs", "accommodation-flight-evals");
const DATA_DIR = join(OUT_DIR, "travel-data");
const REPORT_PATH = join(ROOT, "docs", "travel-agent-accommodation-flight-eval-report.md");
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
	name: "accommodation-flight-eval-search-stub",
	async search(query: string): Promise<SearchResult[]> {
		return [
			{
				title: `Accommodation areas and rates for ${query}`,
				url: "https://example.com/accommodation-research",
				snippet:
					"Provide 4-6 lodging areas per overnight city. Include neighborhood fit, proximity to planned itinerary stops/transit, typical budget/mid-range/luxury nightly rates, safety tips, booking caveats, and source URLs.",
			},
			{
				title: `Flight options and booking caveats for ${query}`,
				url: "https://example.com/flight-research",
				snippet:
					"Provide 4-6 flight options covering cheapest, fastest, best timing, best comfort/directness, and flexible nearby-airport alternatives. Include route dates, fare estimates, carriers, booking provider links, source URLs, and live-data caveats.",
			},
			{
				title: `Trip logistics and budget notes for ${query}`,
				url: "https://example.com/logistics-budget",
				snippet:
					"Good lodging/flight research maps choices to the approved itinerary, avoids unsupported certainty, labels estimates, and explains tradeoffs for budget, transfer time, safety, seasonality, and group fit.",
			},
		];
	},
};

const stamp = Date.now();

interface AccommodationFlightEvalSpec {
	id: string;
	kind: string;
	preferences: TravelPreferences;
	destinationResearch: DestinationResearch;
	selectedDestinations: SubDestination[];
	activities: Activity[];
	itineraryResearch: ItineraryResearch;
	overnightCities: string[];
	prompt: string;
}

const allRuns: AccommodationFlightEvalSpec[] = [
	{
		id: `af-greece-family-${stamp}`,
		kind: "Stage 5 Greece family accommodation/flights",
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
		activities: [makeActivity("Acropolis Early-Entry Family Visit", "Athens"), makeActivity("Agios Prokopios Beach Day", "Naxos")],
		itineraryResearch: makeItinerary("2026-06-20", ["Athens", "Athens", "Athens → Naxos", "Naxos", "Naxos", "Naxos", "Naxos", "Naxos", "Naxos", "Naxos", "Naxos → Athens → Berlin"]),
		overnightCities: ["Athens", "Naxos"],
		prompt:
			"Itinerary is approved for Athens and Naxos. Complete research_accommodation_flights now. Use exactly one web_search call, then save accommodation_research with exactly 4-6 lodging areas for each overnight city (Athens and Naxos), and save flight_research with exactly 4-6 viable Berlin-Athens round-trip options for 2026-06-20 to 2026-06-30. Include rates, transport proximity, safety/booking tips, sources, fare estimates, booking links, confidence, and live-data caveats. Save before prose.",
	},
	{
		id: `af-japan-couple-${stamp}`,
		kind: "Stage 5 Japan couple accommodation/flights",
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
		activities: [makeActivity("Tsukiji Food Walk", "Tokyo"), makeActivity("Fushimi Inari Dawn Hike", "Kyoto")],
		itineraryResearch: makeItinerary("2026-04-05", ["Tokyo", "Tokyo", "Tokyo", "Tokyo", "Tokyo → Kyoto", "Kyoto", "Kyoto", "Kyoto", "Kyoto", "Kyoto → San Francisco"]),
		overnightCities: ["Tokyo", "Kyoto"],
		prompt:
			"Itinerary is approved for Tokyo and Kyoto. Complete research_accommodation_flights now. Use exactly one web_search call, then save accommodation_research with exactly 4-6 lodging areas for each overnight city (Tokyo and Kyoto), and save flight_research with exactly 4-6 viable San Francisco-Tokyo round-trip/open-jaw style options for 2026-04-05 to 2026-04-14. Include rates, transport proximity, safety/booking tips, sources, fare estimates, booking links, confidence, and live-data caveats. Save before prose.",
	},
	{
		id: `af-portugal-friends-${stamp}`,
		kind: "Stage 5 Portugal friends accommodation/flights",
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
		activities: [makeActivity("Alfama Food Crawl", "Lisbon"), makeActivity("Matosinhos Beach Seafood Afternoon", "Porto")],
		itineraryResearch: makeItinerary("2026-09-10", ["Lisbon", "Lisbon", "Lisbon", "Lisbon → Porto", "Porto", "Porto", "Porto", "Porto → London"]),
		overnightCities: ["Lisbon", "Porto"],
		prompt:
			"Itinerary is approved for Lisbon and Porto. Complete research_accommodation_flights now. Use exactly one web_search call, then save accommodation_research with exactly 4-6 lodging areas for each overnight city (Lisbon and Porto), and save flight_research with exactly 4-6 viable London-Lisbon/Porto return options for 2026-09-10 to 2026-09-17. Include budget rates, nightlife safety, transport proximity, booking tips, sources, fare estimates, booking links, confidence, and live-data caveats. Save before prose.",
	},
];

const onlyPattern = process.env.TRAVEL_EVAL_ONLY;
const runs = onlyPattern ? allRuns.filter((run) => run.id.includes(onlyPattern) || run.kind.toLowerCase().includes(onlyPattern.toLowerCase())) : allRuns;
if (runs.length === 0) throw new Error(`TRAVEL_EVAL_ONLY=${onlyPattern} matched no accommodation/flight eval runs`);

function makeDestinationResearch(destination: string, places: string[], groupType: string, numNights: number): DestinationResearch {
	return {
		destination: { title: destination, name: destination, description: `${destination} selected route.`, bestTimeToVisit: "Check dates.", reviews: {}, sources: [] },
		subDestinations: places.map((name) => makeSelectedDest(name)),
		overallSummary: `${destination} selected route for ${numNights} nights.`,
		tripHighlights: [],
		travelTips: [],
		preferencesUsed: { themes: [], groupType, numNights },
		nextUserAction: "Itinerary approved. Research accommodation and flights.",
		schemaVersion: "2.0.0",
	};
}

function makeSelectedDest(name: string): SubDestination {
	return { name, type: "place", description: `${name} selected by user.`, selected: true, reviews: {}, sources: [] };
}

function makeActivity(name: string, location: string): Activity {
	return { name, type: "seed", description: `${name} in ${location}.`, location, estimatedDurationHours: 3, estimatedCost: 40, tips: "Seed approved activity.", reviews: {}, sources: ["https://example.com/activities"] };
}

function makeItinerary(startDate: string, places: string[]): ItineraryResearch {
	const start = Date.parse(startDate);
	return {
		itinerary: places.map((place, index) => ({
			date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
			place,
			dayNumber: index + 1,
			activities: [makeItineraryActivity(place)],
		})),
	};
}

function makeItineraryActivity(place: string): ItineraryActivity {
	return { name: `${place} logistics block`, type: "logistics", description: `Approved itinerary day in ${place} with transit/rest buffers.`, location: place, estimatedDurationHours: 2, estimatedCost: 20 };
}

function researchSatisfied(state: TravelState, spec: AccommodationFlightEvalSpec): boolean {
	return scoreAccommodationFlightResearchQuality(state.accommodationResearch, state.flightResearch, spec.preferences, spec.itineraryResearch).pass;
}

function scoreState(state: TravelState, spec: AccommodationFlightEvalSpec): { quality: AccommodationFlightQuality; failures: string[] } {
	const quality = scoreAccommodationFlightResearchQuality(state.accommodationResearch, state.flightResearch, spec.preferences, spec.itineraryResearch);
	return { quality, failures: quality.issues };
}

function summarizeToolEvent(event: any): string {
	const name = event.toolCall?.name ?? event.name ?? "unknown";
	const args = event.toolCall?.args ?? event.args;
	const content = event.result?.content ?? event.content ?? event.error?.message;
	const payload = args ? { args } : content ? { content } : {};
	return `${name} ${JSON.stringify(payload).slice(0, 700)}`;
}

async function runOne(spec: AccommodationFlightEvalSpec) {
	const seeded = createTravelState(spec.id, loadChecklistConfig(CHECKLIST_CONFIG_PATH));
	seeded.preferences = spec.preferences;
	seeded.destinationResearch = spec.destinationResearch;
	seeded.selectedDestinations = spec.selectedDestinations;
	seeded.activitiesResearch = { activities: spec.activities };
	seeded.itineraryResearch = spec.itineraryResearch;
	for (let i = 0; i < 5; i++) seeded.checklist = advanceChecklist(seeded.checklist);
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
				"- Use exactly ONE web_search call for accommodation and flight context, then stop searching.\n" +
				"- Save before prose using update_travel_state twice: field=\"accommodation_research\" and field=\"flight_research\".\n" +
				"- Accommodation: exactly 4-6 areasToStay per overnight city, each with city, areaToStay, description, typicalNightlyRate, safetyTips, bookingTips, nearbyTransport, reviews, sources.\n" +
				"- Flights: exactly 4-6 sample_options unless explicitly impossible; include route dates matching preferences, fare estimates, carriers, booking links, caveats, meta_provider_type=web_search, schema_version=1.0.0, and confidence.\n" +
				"- Label all prices and availability as estimates from search context; do not claim live certainty.\n" +
				"- If search is thin, use travel knowledge, label estimates, and save regardless.",
		},
	});

	let toolStarts = 0;
	let artifactSatisfiedAt: number | null = null;
	const eventLog: string[] = [];
	const abortIfSatisfied = () => {
		if (artifactSatisfiedAt) return;
		if (researchSatisfied(session.state, spec)) {
			artifactSatisfiedAt = Date.now();
			session.agent.abort();
		}
	};
	session.agent.subscribe((event) => {
		if (event.type === "tool_execution_start") {
			toolStarts++;
			const summary = summarizeToolEvent(event);
			eventLog.push(`tool_start:${summary}`);
			console.log(`[${spec.id}] tool_start ${summary}`);
		}
		if (event.type === "tool_execution_end") {
			const summary = summarizeToolEvent(event);
			eventLog.push(`tool_end:${summary}`);
			console.log(`[${spec.id}] tool_end ${summary}`);
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
		for (let repair = 1; repair <= 2 && !researchSatisfied(session.state, spec); repair++) {
			console.log(`[${spec.id}] repair ${repair}: accommodation/flight research missing or incomplete; re-prompting`);
			await Promise.race([
				session.agent.prompt(
					`The previous turn did not save passing accommodation_research and flight_research for ${spec.overnightCities.join(" and ")}. ` +
						`Call update_travel_state now for any missing/failing field. Accommodation needs 4-6 areas per overnight city; flights need 4-6 sample options, matching dates, fares, booking links, sources, caveats, and confidence.`,
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
		overnightCities: spec.overnightCities,
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
	lines.push("# Accommodation & Flight Eval Report — Stage 5 Live Runs");
	lines.push("");
	lines.push(`Generated: ${new Date().toISOString()}`);
	lines.push(`Model: ${MODEL_PROVIDER}/${MODEL_ID}`);
	lines.push("Search: deterministic eval search stub via live web_search tool calls");
	lines.push("");
	lines.push("## Executive summary");
	lines.push("");
	lines.push(`- Accommodation/flight runs passing: ${passCount}/${results.length}`);
	lines.push(`- scoreAccommodationFlightResearchQuality passing: ${qualityPass}/${results.length}`);
	lines.push("- Scope: Stage 5 accommodation and flight research after an approved itinerary.");
	lines.push("- Checks: overnight-city accommodation coverage, 4-6 lodging areas per city, rates/transport/safety/booking/source evidence, flight option counts, dates, fares, links, caveats, and confidence.");
	lines.push("");
	lines.push("## Results");
	lines.push("");
	lines.push("| Run | Eval | Accommodation counts | Flight options | Status | Duration | Tool calls |");
	lines.push("|---|---|---|---:|---|---:|---:|");
	for (const r of results) {
		const counts = Object.entries(r.quality.accommodationCountsByCity).map(([city, count]) => `${city}: ${count}`).join(", ");
		lines.push(`| ${r.sessionId} | ${r.kind} | ${counts} | ${r.quality.flightOptionCount} | ${r.pass ? "PASS" : "FAIL"} | ${(r.durationMs / 1000).toFixed(1)}s | ${r.toolStarts} |`);
	}
	lines.push("");
	for (const r of results) {
		lines.push(`## ${r.sessionId}`);
		lines.push("");
		lines.push(`- Eval: ${r.kind}`);
		lines.push(`- Status: ${r.pass ? "PASS" : "FAIL"}`);
		lines.push(`- Active phase after run: ${r.activePhase}`);
		lines.push(`- Overnight cities: ${r.overnightCities.join(", ")}`);
		lines.push(`- Flight options persisted: ${r.quality.flightOptionCount}`);
		lines.push("");
		lines.push("### Accommodation counts");
		lines.push("");
		for (const [city, count] of Object.entries(r.quality.accommodationCountsByCity)) lines.push(`- ${city}: ${count}`);
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
