/**
 * Stage 3 selected-place activity-research live eval.
 *
 * Seeds a realistic session through Stage 2 (preferences, destination research,
 * selected destinations), advances the checklist to research_experiences,
 * prompts the model to research activities for the selected places, then scores
 * the persisted activitiesResearch output using the deterministic
 * scoreActivityResearchQuality helper.
 *
 * Failures cover: wrong destinations, low preference fit, missing
 * logistics/time/budget/season caveats, non-contextual tradeoffs, and
 * thin/generic activity cards.
 *
 * Run: npx tsx scripts/activity-research-eval.ts
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { advanceChecklist, loadChecklistConfig } from "../src/core/checklist.js";
import {
	type ActivityQualityScore,
	type ActivityResearchQuality,
	type ActivityQualityAxis,
	scoreActivityResearchQuality,
} from "../src/core/activity-fit.js";
import { AXIS_LABEL, type TradeoffSeverity } from "../src/core/preference-fit.js";
import { saveTravelState } from "../src/core/persistence.js";
import { createTravelSession } from "../src/core/sdk.js";
import type { SearchProvider, SearchResult } from "../src/core/search/types.js";
import type {
	Activity,
	DestinationResearch,
	SubDestination,
	TravelPreferences,
} from "../src/core/types.js";
import { createTravelState, type TravelState } from "../src/core/state.js";

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

// ---------------------------------------------------------------------------
// Search stub — activity-relevant context per destination
// ---------------------------------------------------------------------------

const searchProvider: SearchProvider = {
	name: "activity-eval-search-stub",
	async search(query: string): Promise<SearchResult[]> {
		return [
			{
				title: `Activity options for ${query}`,
				url: "https://example.com/activities",
				snippet:
					"Top activities include guided walking tours, beach visits, cooking classes, museum visits, boat trips, and local food tastings. Book ahead in peak season; morning visits avoid heat and crowds.",
			},
			{
				title: `Family-friendly and logistics notes for ${query}`,
				url: "https://example.com/activity-logistics",
				snippet:
					"Consider travel time between sites, ferry or bus schedules, child-friendly options with shallow water or interactive exhibits, and budget entry fees versus free alternatives.",
			},
			{
				title: `Seasonal and budget tips for ${query}`,
				url: "https://example.com/activity-season-budget",
				snippet:
					"June and September are ideal for weather and lighter crowds. Budget 30-80 EUR per person per activity; many walking tours and markets are free or low-cost. Confirm opening hours and book popular experiences in advance.",
			},
		];
	},
};

// ---------------------------------------------------------------------------
// Run specifications
// ---------------------------------------------------------------------------

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

const runs: ActivityEvalSpec[] = [
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
		},
		destinationResearch: makeDestinationResearch(
			"Greece",
			[
				{ name: "Athens", selected: true, desc: "Ancient capital with the Acropolis, vibrant food scene, and easy airport access for families." },
				{ name: "Naxos", selected: true, desc: "Family-friendly island with shallow beaches, mountain villages, and authentic tavernas." },
				{ name: "Crete", selected: false, desc: "Large island with diverse landscapes, Minoan ruins, and long sandy beaches." },
				{ name: "Santorini", selected: false, desc: "Iconic caldera views, sunset crowds, and higher prices than other Cyclades." },
				{ name: "Milos", selected: false, desc: "Dramatic coastal geology, quiet coves, and growing food scene." },
				{ name: "Paros", selected: false, desc: "Relaxed Cycladic island with good beaches and easy ferry connections." },
				{ name: "Rhodes", selected: false, desc: "Medieval old town, long beaches, and a longer season into autumn." },
				{ name: "Corfu", selected: false, desc: "Lush Ionian island with family resorts and Venetian architecture." },
			],
			{ themes: ["beaches", "culture", "food", "easy logistics"], groupType: "family with kids", numNights: 10 },
		),
		selectedDestinations: [
			makeSelectedDest("Athens"),
			makeSelectedDest("Naxos"),
		],
		selectedPlaceNames: ["Athens", "Naxos"],
		prompt:
			"I've chosen Athens and Naxos for this Greece trip. Preferences are confirmed and places are selected. Complete the active research_experiences phase now. Research and save 4-6 activity/experience options per selected place (Athens and Naxos) using update_travel_state with field=\"activities_research\". Include practical tips, duration, cost, and contextual tradeoffs for each activity. Do not create an itinerary. Ask me to approve the activities after saving.",
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
		},
		destinationResearch: makeDestinationResearch(
			"Japan",
			[
				{ name: "Tokyo", selected: true, desc: "Bustling metropolis with world-class food, neon districts, temples, and easy transit." },
				{ name: "Kyoto", selected: true, desc: "Ancient capital with hundreds of temples, traditional cuisine, and bamboo groves." },
				{ name: "Osaka", selected: false, desc: "Food capital of Japan with lively street food scenes and castle." },
				{ name: "Nara", selected: false, desc: "Friendly deer park, giant Buddha statue, and ancient temples." },
				{ name: "Hakone", selected: false, desc: "Hot spring resort town with views of Mount Fuji." },
				{ name: "Hiroshima", selected: false, desc: "Peaceful memorial park, okonomiyaki, and nearby Miyajima Island." },
				{ name: "Kanazawa", selected: false, desc: "Well-preserved samurai district, gold leaf crafts, and fresh seafood." },
				{ name: "Takayama", selected: false, desc: "Alpine old town with sake breweries and traditional wooden houses." },
			],
			{ themes: ["food", "culture", "history"], groupType: "couple", numNights: 9 },
		),
		selectedDestinations: [
			makeSelectedDest("Tokyo"),
			makeSelectedDest("Kyoto"),
		],
		selectedPlaceNames: ["Tokyo", "Kyoto"],
		prompt:
			"I've chosen Tokyo and Kyoto for this Japan trip. Preferences are confirmed and places are selected. Complete the active research_experiences phase now. Research and save 4-6 activity/experience options per selected place (Tokyo and Kyoto) using update_travel_state with field=\"activities_research\". Include practical tips, duration, cost, and contextual tradeoffs for each activity. Do not create an itinerary. Ask me to approve the activities after saving.",
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
		},
		destinationResearch: makeDestinationResearch(
			"Portugal",
			[
				{ name: "Lisbon", selected: true, desc: "Hilly coastal capital with pastel buildings, trams, seafood, and nightlife." },
				{ name: "Porto", selected: true, desc: "Riverside city with port wine cellars, historic center, and food scene." },
				{ name: "Algarve", selected: false, desc: "Southern coast with dramatic cliffs, sandy beaches, and resort towns." },
				{ name: "Sintra", selected: false, desc: "Fairytale palaces and castles in forested hills near Lisbon." },
				{ name: "Madeira", selected: false, desc: "Subtropical island with levada walks, whale watching, and wine." },
				{ name: "Azores", selected: false, desc: "Volcanic islands with hot springs, crater lakes, and hiking." },
				{ name: "Evora", selected: false, desc: "Medieval walled city with Roman temple and wine estates." },
				{ name: "Coimbra", selected: false, desc: "Historic university city with baroque library and fado music." },
			],
			{ themes: ["food", "beaches", "nightlife"], groupType: "friends", numNights: 7 },
		),
		selectedDestinations: [
			makeSelectedDest("Lisbon"),
			makeSelectedDest("Porto"),
		],
		selectedPlaceNames: ["Lisbon", "Porto"],
		prompt:
			"I've chosen Lisbon and Porto for this Portugal trip. Preferences are confirmed and places are selected. Complete the active research_experiences phase now. Research and save 4-6 activity/experience options per selected place (Lisbon and Porto) using update_travel_state with field=\"activities_research\". Include practical tips, duration, cost, and contextual tradeoffs for each activity. Do not create an itinerary. Ask me to approve the activities after saving.",
	},
];

// ---------------------------------------------------------------------------
// Seeding helpers
// ---------------------------------------------------------------------------

interface SeedPlace {
	name: string;
	selected: boolean;
	desc: string;
}

function makeDestinationResearch(
	destination: string,
	places: SeedPlace[],
	prefsUsed: { themes: string[]; groupType: string; numNights: number },
): DestinationResearch {
	return {
		destination: {
			title: destination,
			name: destination,
			description: `Curated ${destination} place options for a ${prefsUsed.groupType} trip.`,
			bestTimeToVisit: "Verify seasonal conditions for the travel dates.",
			reviews: {},
			sources: [],
		},
		subDestinations: places.map((p) => ({
			name: p.name,
			type: "place",
			description: p.desc,
			bestFor: p.selected ? "selected by user" : "alternative option",
			why: `${p.name} aligns with the stated trip preferences.`,
			roughDays: p.selected ? "2-3" : "1-2",
			logisticsFit: "Reachable from the main entry point.",
			budgetFit: "Fits within the stated budget range.",
			seasonNote: "Check weather and crowd levels for the travel window.",
			tradeoff: "Weigh travel time and cost against other options.",
			imageQuery: `${p.name} ${destination} travel highlights`,
			selected: p.selected,
			reviews: {},
			sources: [],
		})),
		overallSummary: `Curated ${destination} places for the ${prefsUsed.numNights}-night trip.`,
		tripHighlights: [],
		travelTips: [],
		preferencesUsed: {
			themes: prefsUsed.themes,
			groupType: prefsUsed.groupType,
			numNights: prefsUsed.numNights,
		},
		nextUserAction: "Places have been selected. Proceed to activity research.",
		schemaVersion: "2.0.0",
	};
}

function makeSelectedDest(name: string): SubDestination {
	return {
		name,
		type: "place",
		description: `${name} — selected by the user.`,
		selected: true,
		reviews: {},
		sources: [],
	};
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const MIN_DESCRIPTION_LENGTH = 30;

interface ActivityEvalScore {
	activities: Activity[];
	quality: ActivityResearchQuality | null;
	failures: string[];
}

function scoreActivityResearch(state: TravelState, spec: ActivityEvalSpec): ActivityEvalScore {
	const activities = state.activitiesResearch?.activities ?? [];
	const failures: string[] = [];

	if (!state.activitiesResearch) {
		failures.push("activitiesResearch was not persisted.");
		return { activities, quality: null, failures };
	}

	if (activities.length === 0) {
		failures.push("activitiesResearch has no activities.");
		return { activities, quality: null, failures };
	}

	// Check per-selected-destination activity count (4-6).
	for (const name of spec.selectedPlaceNames) {
		const count = activities.filter((a) =>
			String(a.location ?? "")
				.toLowerCase()
				.includes(name.toLowerCase()),
		).length;
		if (count < 4 || count > 6) {
			failures.push(`Expected 4-6 activities for ${name}; found ${count}.`);
		}
	}

	// Check for thin/generic activity cards.
	const seenNames = new Set<string>();
	for (const [i, activity] of activities.entries()) {
		const label = activity.name || `activity ${i + 1}`;
		if (typeof activity.description !== "string" || activity.description.trim().length < MIN_DESCRIPTION_LENGTH) {
			failures.push(`"${label}" has a thin/generic description (<${MIN_DESCRIPTION_LENGTH} chars).`);
		}
		if (!activity.estimatedDurationHours || activity.estimatedDurationHours <= 0 || activity.estimatedDurationHours > 12) {
			failures.push(`"${label}" is missing a valid estimatedDurationHours (expected 1-12).`);
		}
		if (typeof activity.name !== "string" || activity.name.trim().length < 3) {
			failures.push(`Activity ${i + 1} is missing a meaningful name.`);
		}
		const key = (activity.name ?? "").toLowerCase().trim();
		if (key && seenNames.has(key)) {
			failures.push(`Duplicate activity name detected: "${activity.name}".`);
		}
		seenNames.add(key);
	}

	// Run the deterministic quality scoring from activity-fit.ts.
	const selectedDests = spec.selectedDestinations.map((d) => ({ name: d.name }));
	const quality = scoreActivityResearchQuality(activities, spec.preferences, selectedDests);
	for (const issue of quality.issues) {
		failures.push(`activity-quality: ${issue}`);
	}

	return { activities, quality, failures };
}

// ---------------------------------------------------------------------------
// Run logic
// ---------------------------------------------------------------------------

function activitiesSatisfied(state: TravelState, selectedNames: string[]): boolean {
	const acts = state.activitiesResearch?.activities ?? [];
	if (acts.length === 0) return false;
	for (const name of selectedNames) {
		const count = acts.filter((a) =>
			String(a.location ?? "")
				.toLowerCase()
				.includes(name.toLowerCase()),
		).length;
		if (count < 4) return false;
	}
	return true;
}

async function runOne(spec: ActivityEvalSpec) {
	// Seed state through Stage 2 so the agent is born in research_experiences.
	const seeded = createTravelState(spec.id, loadChecklistConfig(CHECKLIST_CONFIG_PATH));
	seeded.preferences = spec.preferences;
	seeded.destinationResearch = spec.destinationResearch;
	seeded.selectedDestinations = spec.selectedDestinations;
	// gather_preferences -> shortlist_destinations -> select_destinations -> research_experiences
	seeded.checklist = advanceChecklist(seeded.checklist);
	seeded.checklist = advanceChecklist(seeded.checklist);
	seeded.checklist = advanceChecklist(seeded.checklist);
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
				"This is a deterministic stubbed eval — follow these rules strictly:\n" +
				"- Do NOT call verify_research_data under any circumstances. Skip that tool entirely.\n" +
				"- Do NOT browse the web for image URLs or set imageLinks/imageKeywords. Images are not scored.\n" +
				"- Use at most ONE web_search call per selected place, then stop searching entirely.\n" +
				"- SAVE BEFORE PROSE: Immediately persist activities using update_travel_state with field=\"activities_research\" " +
				"after the single allowed search per place. If time or context is tight, save a complete payload first, then write prose. " +
				"Do not re-search or re-verify after the single allowed search per place.\n" +
				"- Every activity object MUST include all quality fields: name, type, description, location, " +
				"estimatedDurationHours, estimatedCost, tips, bestTimeToVisit, suitableForGroups, themes, reviews, and sources. " +
				"Provide exactly 4-6 activities per selected place. Do not create an itinerary or ask for approval before saving.\n" +
				"- CONTEXTUAL CAVEATS: Every activity MUST include a practical caveat or tradeoff in its tips or description, " +
				"tied to at least one of these stated preference axes: logistics (travel time, transit, hops), kids/family " +
				"(child-friendly, strollers, shallow water), budget (pricey vs value, free alternatives), season/dates " +
				"(weather, crowds, wind, opening hours), beaches, culture, food, or trip length (day allocation, rushed). " +
				"Generic caveats like 'great for all ages' or 'wear comfortable shoes' will FAIL the eval. " +
				"If search results are thin, use your own travel knowledge, label estimates, and save regardless.",
		},
	});

	let events = 0;
	let toolStarts = 0;
	let artifactSatisfiedAt: number | null = null;
	const eventLog: string[] = [];
	const abortIfArtifactSatisfied = () => {
		if (artifactSatisfiedAt) return;
		if (activitiesSatisfied(session.state, spec.selectedPlaceNames)) {
			artifactSatisfiedAt = Date.now();
			session.agent.abort();
		}
	};
	session.agent.subscribe((event) => {
		events++;
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
		for (let repair = 1; repair <= 2 && !activitiesSatisfied(session.state, spec.selectedPlaceNames); repair++) {
			console.log(`[${spec.id}] repair ${repair}: activities_research missing or incomplete; re-prompting`);
			await Promise.race([
				session.agent.prompt(
					`The previous turn did not save complete activities_research for the selected places (${spec.selectedPlaceNames.join(", ")}). ` +
						`Do not search again unless necessary. Call update_travel_state now with field="activities_research" ` +
						`and a complete payload with 4-6 activity options per selected place, each with name, type, description, location, estimatedDurationHours, estimatedCost, tips, and sources.`,
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
	const score = scoreActivityResearch(state, spec);

	if (timedOut && !artifactSatisfiedAt) score.failures.unshift(`run timed out after ${(timeoutMs / 1000).toFixed(0)}s`);
	if (runError && !timedOut && !artifactSatisfiedAt) score.failures.unshift(`run error: ${runError}`);

	return {
		sessionId: spec.id,
		kind: spec.kind,
		activePhase: state.checklist.phases[state.checklist.activePhaseIndex]?.id,
		selectedPlaceNames: spec.selectedPlaceNames,
		activityCount: score.activities.length,
		activities: score.activities,
		quality: score.quality,
		failures: score.failures,
		pass: score.failures.length === 0,
		durationMs,
		toolStarts,
		savedPath,
		eventLog,
	};
}

// ---------------------------------------------------------------------------
// Report rendering
// ---------------------------------------------------------------------------

function formatAxisLabel(axis: ActivityQualityAxis): string {
	const labels: Record<ActivityQualityAxis, string> = {
		destination: "selected destination",
		beaches: AXIS_LABEL.beaches,
		culture: AXIS_LABEL.culture,
		food: AXIS_LABEL.food,
		logistics: AXIS_LABEL.logistics,
		kids: AXIS_LABEL.kids,
		budget: AXIS_LABEL.budget,
		season: AXIS_LABEL.season,
		tripLength: AXIS_LABEL.tripLength,
		duration: "duration/time realism",
		practicalTips: "practical tips/caveats",
	};
	return labels[axis];
}

function countSeverities(scores: ActivityQualityScore[]): Record<TradeoffSeverity, number> {
	const counts: Record<TradeoffSeverity, number> = { low: 0, medium: 0, high: 0 };
	for (const s of scores) counts[s.tradeoffSeverity] += 1;
	return counts;
}

function renderReport(results: Awaited<ReturnType<typeof runOne>>[]) {
	const passCount = results.filter((r) => r.pass).length;
	const qualityPass = results.filter((r) => r.quality?.pass).length;
	const lines: string[] = [];
	lines.push("# Activity Research Eval Report — Stage 3 Live Runs");
	lines.push("");
	lines.push(`Generated: ${new Date().toISOString()}`);
	lines.push(`Model: ${MODEL_PROVIDER}/${MODEL_ID}`);
	lines.push(`Search: deterministic eval search stub`);
	lines.push("");
	lines.push("## Executive summary");
	lines.push("");
	lines.push(`- Activity research runs passing: ${passCount}/${results.length}`);
	lines.push(`- scoreActivityResearchQuality passing: ${qualityPass}/${results.length} (activities scored against actual preferences, selected destinations, and contextual tradeoffs)`);
	lines.push("- Scope: Stage 3 selected-place activity/experience research. Verifies persisted activitiesResearch quality, not just schema shape.");
	lines.push("- Checks: wrong destinations, low preference fit, missing logistics/time/budget/season caveats, non-contextual tradeoffs, thin/generic cards.");
	lines.push("");
	lines.push("## Results");
	lines.push("");
	lines.push("| Run | Eval | Activities | Selected places | Status | Duration | Tool calls |");
	lines.push("|---|---|---:|---|---|---:|---:|");
	for (const r of results) {
		lines.push(
			`| ${r.sessionId} | ${r.kind} | ${r.activityCount} | ${r.selectedPlaceNames.join(" + ")} | ${r.pass ? "PASS" : "FAIL"} | ${(r.durationMs / 1000).toFixed(1)}s | ${r.toolStarts} |`,
		);
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
		const q = r.quality;
		if (q) {
			lines.push(`- Relevant quality axes: ${q.relevantAxes.map(formatAxisLabel).join(", ")}`);
			lines.push("");
			lines.push("### Per-activity scores");
			lines.push("");
			for (const [i, s] of q.activityScores.entries()) {
				const fitPct = Math.round(s.fitRatio * 100);
				const axes = s.addressedAxes.length ? s.addressedAxes.map(formatAxisLabel).join(", ") : "none";
				const missing = s.missingAxes.length ? s.missingAxes.map(formatAxisLabel).join(", ") : "none";
				const tradeoffRelevant = s.tradeoffRelevantAxes.length
					? s.tradeoffRelevantAxes.map((a) => AXIS_LABEL[a]).join(", ")
					: "(no relevant axis)";
				lines.push(
					`${i + 1}. **${s.name}** — ${s.location || "no location"} → matched: ${s.matchedDestination ?? "(none)"}`,
				);
				lines.push(`   - Fit: ${fitPct}% [addressed: ${axes}]`);
				lines.push(`   - Missing axes: ${missing}`);
				lines.push(
					`   - Tradeoff: ${s.tradeoffSeverity} → ${tradeoffRelevant} | "${s.tradeoffText.slice(0, 120)}${s.tradeoffText.length > 120 ? "…" : ""}"`,
				);
				if (s.issues.length) {
					lines.push(`   - Issues: ${s.issues.join("; ")}`);
				}
			}
			lines.push("");
			lines.push("### Coverage by axis");
			lines.push("");
			lines.push("| Axis | Activities addressing |");
			lines.push("|---|---:|");
			for (const axis of q.relevantAxes) {
				lines.push(`| ${formatAxisLabel(axis)} | ${q.coverageByAxis[axis]} |`);
			}
			lines.push("");
			const sevCounts = countSeverities(q.activityScores);
			lines.push("### Tradeoff severity summary");
			lines.push("");
			lines.push(`- High: ${sevCounts.high}, Medium: ${sevCounts.medium}, Low: ${sevCounts.low}`);
		} else {
			lines.push("- No quality scoring available (activitiesResearch not persisted).");
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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
