#!/usr/bin/env node

/**
 * Travel Agent CLI
 *
 * Usage:
 *   travel-agent                           # auto-detect provider from env vars
 *   travel-agent --provider anthropic      # specify provider
 *   travel-agent --session-id my-trip      # resume a session
 */

import { randomUUID } from "node:crypto";
import { getEnvApiKey, getModel } from "@mariozechner/pi-ai";
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
  --provider, -p <name>      LLM provider (anthropic, openai, google, etc.)
  --model, -m <id>           Model ID (claude-sonnet-4-20250514, gpt-4o, etc.)
  --session-id, -s <id>      Session ID for persistence (auto-generated if not set)
  --data-dir <path>          Directory for session data (default: ./travel-data)
  --checklist-config <path>  Path to checklist config JSON
  --help, -h                 Show this help

Environment Variables:
  ANTHROPIC_API_KEY          Anthropic
  OPENAI_API_KEY             OpenAI
  GEMINI_API_KEY             Google Gemini
  GROQ_API_KEY               Groq
  XAI_API_KEY                xAI
  OPENROUTER_API_KEY         OpenRouter

  Web search (Stagehand is the default — opt-out with USE_STAGEHAND=0):
  OLLAMA_API_KEY             API key for the default Stagehand LLM
                             (ollama/minimax-m2.7:cloud). Create one at
                             https://ollama.com/settings/keys
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

At least one LLM API key is required. Stagehand (default) needs OLLAMA_API_KEY
unless STAGEHAND_MODEL is changed to a non-Ollama model.
`);
}

// =============================================================================
// Provider Detection
// =============================================================================

const PROVIDER_ALIASES: Record<string, string> = { gemini: "google" };

const PROVIDER_DEFAULTS: Record<string, string> = {
	anthropic: "claude-sonnet-4-20250514",
	openai: "gpt-4o",
	google: "gemini-2.5-flash",
	groq: "llama-3.3-70b-versatile",
	xai: "grok-3-mini",
	openrouter: "anthropic/claude-sonnet-4",
};

interface DetectedModel {
	provider: string;
	modelId: string;
	apiKey: string;
}

function detectModel(preferredProvider?: string, preferredModel?: string): DetectedModel | null {
	if (preferredProvider) {
		const provider = PROVIDER_ALIASES[preferredProvider] ?? preferredProvider;
		const apiKey = getEnvApiKey(provider);
		if (!apiKey) {
			console.error(`No API key found for provider "${provider}".`);
			process.exit(1);
		}
		const modelId = preferredModel ?? PROVIDER_DEFAULTS[provider];
		if (!modelId) {
			console.error(`No default model for "${provider}". Use --model.`);
			process.exit(1);
		}
		return { provider, modelId, apiKey };
	}

	const searchOrder = ["anthropic", "openai", "google", "groq", "xai", "openrouter"];
	for (const provider of searchOrder) {
		const apiKey = getEnvApiKey(provider);
		if (apiKey) {
			const modelId = preferredModel ?? PROVIDER_DEFAULTS[provider];
			if (modelId) return { provider, modelId, apiKey };
		}
	}
	return null;
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

	const model = getModel(detected.provider as any, detected.modelId as any);
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
