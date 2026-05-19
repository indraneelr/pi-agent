#!/usr/bin/env node
/**
 * Manual end-to-end test for the Stagehand+Playwright web_search tool.
 *
 * Runs the exact same code path the travel agent uses, but standalone so
 * failures surface clearly without the agent loop in the way.
 *
 * Usage:
 *   ./scripts/test-search.ts "your search query"
 *   npx tsx scripts/test-search.ts "best ramen in tokyo"
 *
 * Env (all optional except OLLAMA_API_KEY for the default model):
 *   OLLAMA_API_KEY            Get one at https://ollama.com/settings/keys
 *   STAGEHAND_MODEL           Override the LLM (default: ollama/minimax-m2.7:cloud)
 *   STAGEHAND_API_KEY         Override the LLM key (else uses provider env)
 *   STAGEHAND_BASE_URL        Override the LLM base URL
 *   STAGEHAND_HEADLESS=0      Show the browser window (default: headless)
 *   STAGEHAND_SEARCH_ENGINE   duckduckgo | google | bing (default: duckduckgo)
 *   STAGEHAND_VISIT_RESULTS=1 Fetch a content snippet from each result page
 *   STAGEHAND_VERBOSE=2       Stagehand log level 0|1|2 (default: 1 for debugging)
 *   NUM_RESULTS               Number of results to extract (default: 5)
 */

import { createStagehandSearchProvider, loadStagehandOptionsFromEnv } from "../src/core/search/stagehand.js";
import { createWebSearchTool } from "../src/core/tools/web-search.js";

const t0 = Date.now();
function log(msg: string, data?: unknown): void {
	const elapsed = ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
	const line = data === undefined ? msg : `${msg} ${JSON.stringify(data)}`;
	console.error(`[${elapsed}s] ${line}`);
}

async function main(): Promise<void> {
	const query = process.argv.slice(2).join(" ").trim();
	if (!query) {
		console.error("Usage: ./scripts/test-search.ts \"your search query\"");
		process.exit(2);
	}
	const numResults = Number(process.env.NUM_RESULTS ?? "5");

	log("config: loading from env");
	const opts = loadStagehandOptionsFromEnv();
	// Default verbose to 1 for this debug script so Stagehand prints what it does.
	if (process.env.STAGEHAND_VERBOSE === undefined) opts.verbose = 1;

	log("config: resolved", {
		query,
		numResults,
		modelName: opts.modelName ?? "(default: ollama/minimax-m2.7:cloud)",
		headless: opts.headless,
		searchEngine: opts.searchEngine ?? "(default: duckduckgo)",
		visitResults: opts.visitResults,
		timeoutMs: opts.timeoutMs,
		verbose: opts.verbose,
		baseURL: opts.baseURL,
		hasOllamaKey: Boolean(process.env.OLLAMA_API_KEY),
		hasStagehandKey: Boolean(process.env.STAGEHAND_API_KEY),
	});

	log("provider: constructing Stagehand search provider");
	const provider = createStagehandSearchProvider(opts);

	log("tool: building web_search tool");
	const tool = createWebSearchTool(provider);

	log("tool: executing");
	const controller = new AbortController();
	const sigintHandler = () => {
		log("aborted by SIGINT");
		controller.abort();
	};
	process.once("SIGINT", sigintHandler);

	try {
		const result = await tool.execute("manual-test", { query, num_results: numResults }, controller.signal);
		log("tool: success", {
			resultCount: result.details.resultCount,
			provider: result.details.provider,
		});
		console.log("\n=== SEARCH RESULTS ===\n");
		const text = (result.content[0] as { type: "text"; text: string }).text;
		console.log(text);
	} catch (err) {
		log("tool: FAILED");
		console.error("\n=== ERROR ===");
		if (err instanceof Error) {
			console.error(`name:    ${err.name}`);
			console.error(`message: ${err.message}`);
			if (err.stack) console.error(`stack:\n${err.stack}`);
			// Surface AI SDK / cause chain
			let cause: unknown = (err as { cause?: unknown }).cause;
			let depth = 0;
			while (cause && depth < 5) {
				console.error(`\n--- cause (depth ${depth}) ---`);
				console.error(cause);
				cause = (cause as { cause?: unknown }).cause;
				depth++;
			}
		} else {
			console.error(err);
		}
		process.exitCode = 1;
	} finally {
		process.off("SIGINT", sigintHandler);
		log("done");
	}
}

main().catch((err) => {
	console.error("Unexpected top-level error:", err);
	process.exit(1);
});
