import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { advanceChecklist, loadChecklistConfig } from "../src/core/checklist.js";
import { saveTravelState } from "../src/core/persistence.js";
import { createTravelSession } from "../src/core/sdk.js";
import { createTravelState } from "../src/core/state.js";
import type { SearchProvider, SearchResult } from "../src/core/search/types.js";

const ROOT = new URL("../../../", import.meta.url).pathname;
const DATA_DIR = join(ROOT, "docs", "debug-ollama-eval");
const CHECKLIST_CONFIG_PATH = join(ROOT, "packages", "travel-agent", "checklist-config.json");
rmSync(DATA_DIR, { recursive: true, force: true });
mkdirSync(DATA_DIR, { recursive: true });

const model = {
	id: process.env.TRAVEL_EVAL_MODEL ?? "kimi-k2.6",
	name: `Ollama Cloud: ${process.env.TRAVEL_EVAL_MODEL ?? "kimi-k2.6"}`,
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

const searchProvider: SearchProvider = {
	name: "debug-search-stub",
	async search(query: string): Promise<SearchResult[]> {
		console.log("SEARCH", query);
		return [{ title: "Greece family travel", url: "https://example.com", snippet: "Athens, Naxos, Paros, Crete, Milos, Santorini, Corfu, Rhodes, Peloponnese, Thessaloniki are common options." }];
	},
};

const seeded = createTravelState("debug-ollama-eval", loadChecklistConfig(CHECKLIST_CONFIG_PATH));
seeded.preferences = {
	destination: "Greece",
	origin: "Berlin",
	from_date: "2026-06-20",
	to_date: "2026-06-30",
	num_nights: 10,
	group_size: 4,
	group_type: "family with kids",
	budget: { amount: 6500, currency: "EUR", category: "mid-range" },
	travel_themes: ["beaches", "culture", "food", "easy logistics"],
};
seeded.checklist = advanceChecklist(seeded.checklist);
saveTravelState(seeded, { dataDir: DATA_DIR });

const session = await createTravelSession({
	model,
	apiKey: process.env.OLLAMA_API_KEY,
	thinkingLevel: "off",
	sessionId: "debug-ollama-eval",
	searchProvider,
	dataDir: DATA_DIR,
});

session.agent.subscribe((event) => {
	if (event.type.includes("tool") || event.type.includes("message") || event.type.includes("error")) {
		console.log("EVENT", event.type, JSON.stringify(event).slice(0, 1000));
	}
});

const timeout = setTimeout(() => session.agent.abort(), 45000);
await session.agent.prompt("Preferences are confirmed. Complete shortlist_destinations now. Save destination_research with 8-10 Greece place option cards using update_travel_state. Do not final itinerary.").catch((e) => console.log("PROMPT_ERR", e.message));
clearTimeout(timeout);
await session.shutdown().catch(() => undefined);
console.log("STATE", JSON.stringify(session.state, null, 2).slice(0, 6000));
console.log("MESSAGES", JSON.stringify(session.agent.state.messages, null, 2).slice(0, 12000));
