#!/usr/bin/env node

/**
 * Travel Agent CLI
 *
 * Usage:
 *   travel-agent                           # auto-detect provider from env vars
 *                                          # OLLAMA_API_KEY is preferred when set
 *   travel-agent --provider ollama         # use Ollama Cloud
 *   travel-agent --session-id my-trip      # resume a session
 */

import { randomUUID } from "node:crypto";
import { getModel } from "@mariozechner/pi-ai";
import { createTravelSession } from "./core/sdk.js";
import { detectSearchProvider } from "./core/search/index.js";
import { InteractiveMode } from "./modes/interactive.js";

// =============================================================================
// CLI Args
// =============================================================================

interface CliArgs {
	provider?: string;
	model?: string;
	sessionId?: string;
	dataDir?: string;
	checklistConfig?: string;
	help?: boolean;
}

function parseArgs(): CliArgs {
	const args: CliArgs = {};
	const argv = process.argv.slice(2);

	for (let i = 0; i < argv.length; i++) {
		switch (argv[i]) {
			case "--provider":
			case "-p":
				args.provider = argv[++i];
				break;
			case "--model":
			case "-m":
				args.model = argv[++i];
				break;
			case "--session-id":
			case "-s":
				args.sessionId = argv[++i];
				break;
			case "--data-dir":
				args.dataDir = argv[++i];
				break;
			case "--checklist-config":
				args.checklistConfig = argv[++i];
				break;
			case "--help":
			case "-h":
				args.help = true;
				break;
		}
	}

	return args;
}

function printHelp(): void {
	console.log(`
Travel Agent -- Plan trips with AI assistance

Usage:
  travel-agent [options]

Options:
  --provider, -p <name>      LLM provider (ollama only; Ollama Cloud via OpenAI-compatible API)
  --model, -m <id>           Ollama Cloud model ID (kimi-k2.6, glm-5, minimax-m2.7, etc.)
  --session-id, -s <id>      Session ID for persistence (auto-generated if not set)
  --data-dir <path>          Directory for session data (default: ./travel-data)
  --checklist-config <path>  Path to checklist config JSON
  --help, -h                 Show this help

Environment Variables:
  OLLAMA_API_KEY             Required Ollama Cloud key. Used for the main travel
                             agent LLM by default (kimi-k2.6 via
                             https://ollama.com/v1) and for Stagehand search
                             (ollama/minimax-m2.7:cloud via
                             https://ollama.com/api). Create one at
                             https://ollama.com/settings/keys

  Web search (Stagehand is the default — opt-out with USE_STAGEHAND=0):
  STAGEHAND_MODEL            Override Stagehand LLM, "provider/model" form
                             (default: ollama/minimax-m2.7:cloud)
  STAGEHAND_API_KEY          Override the Stagehand LLM API key (takes
                             precedence over OLLAMA_API_KEY and the
                             travel-agent's LLM key fallback)
  STAGEHAND_BASE_URL         Override the LLM provider base URL
                             (default for ollama/* is https://ollama.com/api)
  STAGEHAND_HEADLESS         "0"/"false" to show the browser window (default: headless)
  STAGEHAND_SEARCH_ENGINE    duckduckgo | google | bing (default: duckduckgo)
  STAGEHAND_VISIT_RESULTS    "1" to fetch a content snippet from each result page
  STAGEHAND_TIMEOUT_MS       Per-search timeout in ms (default: 120000)
  STAGEHAND_VERBOSE          Stagehand log level 0|1|2 (default: 0)
  USE_STAGEHAND              Set to "0" or "false" to disable Stagehand and
                             fall back to API-key search providers below.

  Fallback search providers (only used when USE_STAGEHAND=0):
  BRAVE_API_KEY              Brave Search
  LINKUP_API_KEY             Linkup Search
  GEMINI_API_KEY             Google Gemini Search
  USE_OBSCURA                Set to 1 to use Obscura headless browser

OLLAMA_API_KEY is required for the main travel agent LLM. By default, the
Stagehand search path also uses OLLAMA_API_KEY unless STAGEHAND_API_KEY is set.
`);
}

// =============================================================================
// Provider Detection
// =============================================================================

const PROVIDER_ALIASES: Record<string, string> = {};

const PROVIDER_DEFAULTS: Record<string, string> = {
	ollama: "kimi-k2.6",
};

interface DetectedModel {
	provider: string;
	modelId: string;
	apiKey: string;
}

function createOllamaCloudModel(modelId = PROVIDER_DEFAULTS.ollama) {
	return {
		id: modelId,
		name: `Ollama Cloud: ${modelId}`,
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
}

function detectModel(preferredProvider?: string, preferredModel?: string): DetectedModel | null {
	const provider = preferredProvider ? (PROVIDER_ALIASES[preferredProvider] ?? preferredProvider) : "ollama";
	if (provider !== "ollama") {
		console.error(`Unsupported provider "${provider}". This travel-agent path is configured for Ollama Cloud only.`);
		process.exit(1);
	}

	const apiKey = process.env.OLLAMA_API_KEY;
	if (!apiKey) {
		console.error('No API key found for provider "ollama". Set OLLAMA_API_KEY.');
		process.exit(1);
	}
	return { provider: "ollama", modelId: preferredModel ?? PROVIDER_DEFAULTS.ollama, apiKey };
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
	const args = parseArgs();

	if (args.help) {
		printHelp();
		process.exit(0);
	}

	// Detect LLM model
	const detected = detectModel(args.provider, args.model);
	if (!detected) {
		console.error("No LLM provider detected. Set an API key environment variable.");
		console.error("Run travel-agent --help for options.");
		process.exit(1);
	}

	const model =
		detected.provider === "ollama"
			? createOllamaCloudModel(detected.modelId)
			: getModel(detected.provider as any, detected.modelId as any);
	if (!model) {
		console.error(`Model "${detected.modelId}" not found for provider "${detected.provider}".`);
		process.exit(1);
	}

	// Detect search provider (Stagehand is default; pass the LLM key as a
	// last-resort fallback for non-Ollama Stagehand models).
	const searchProvider = detectSearchProvider({ stagehandFallbackApiKey: detected.apiKey });
	if (!searchProvider) {
		console.error(
			"No search provider detected. Stagehand is the default — set OLLAMA_API_KEY (https://ollama.com/settings/keys), or disable it with USE_STAGEHAND=0 and set BRAVE_API_KEY / LINKUP_API_KEY / GEMINI_API_KEY / USE_OBSCURA=1.",
		);
		process.exit(1);
	}

	const sessionId = args.sessionId ?? randomUUID();
	const modelName = `${detected.provider}/${detected.modelId}`;

	console.log(`Starting travel agent with ${modelName}...`);
	console.log(`Search: ${searchProvider.name}`);
	console.log(`Session: ${sessionId}`);

	try {
		const session = await createTravelSession({
			model,
			apiKey: detected.apiKey,
			sessionId,
			searchProvider,
			dataDir: args.dataDir,
			checklistConfigPath: args.checklistConfig,
		});

		const interactive = new InteractiveMode({ session, modelName });
		await interactive.start();
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : String(err);
		console.error(`Failed to start: ${errMsg}`);
		process.exit(1);
	}
}

main();
