#!/usr/bin/env node

/**
 * Analytics Agent CLI
 *
 * Usage:
 *   analytics-agent                     # auto-detect provider from env vars
 *   analytics-agent --provider anthropic --model claude-sonnet-4-20250514
 *   analytics-agent --provider openai --model gpt-4o
 *   analytics-agent --python /path/to/python3
 */

import { appendFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getEnvApiKey, getModel } from "@mariozechner/pi-ai";
import { createAnalyticsSession } from "./core/sdk.js";
import { InteractiveMode } from "./modes/interactive.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Debug logging to file (doesn't interfere with TUI)
const LOG_FILE = join(__dirname, "..", "analytics-agent.log");

function log(message: string): void {
	const timestamp = new Date().toISOString();
	try {
		appendFileSync(LOG_FILE, `[${timestamp}] [cli] ${message}\n`);
	} catch {
		// ignore write errors
	}
}

interface CliArgs {
	provider?: string;
	model?: string;
	python?: string;
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
			case "--python":
				args.python = argv[++i];
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
Analytics Agent — Interactive data analysis powered by LLMs + pandas

Usage:
  analytics-agent [options]

Options:
  --provider, -p <name>   LLM provider (anthropic, openai, google, etc.)
  --model, -m <id>        Model ID (claude-sonnet-4-20250514, gpt-4o, etc.)
  --python <path>         Path to Python 3 with pandas installed
  --help, -h              Show this help

Environment Variables:
  ANTHROPIC_API_KEY        Anthropic API key
  OPENAI_API_KEY           OpenAI API key
  GEMINI_API_KEY           Google Gemini API key
  GROQ_API_KEY             Groq API key
  XAI_API_KEY              xAI API key
  OPENROUTER_API_KEY       OpenRouter API key

  ANALYTICS_PYTHON_PATH    Default Python path (alternative to --python)

The agent auto-detects your provider from available API keys.
`);
}

interface DetectedModel {
	provider: string;
	modelId: string;
	apiKey: string;
}

/** Map common provider aliases to canonical names used by pi-ai. */
const providerAliases: Record<string, string> = {
	gemini: "google",
};

/** Auto-detect the best available model from environment API keys. */
function detectModel(preferredProvider?: string, preferredModel?: string): DetectedModel | null {
	// Normalize alias to canonical provider name
	if (preferredProvider) {
		preferredProvider = providerAliases[preferredProvider] ?? preferredProvider;
	}

	// Provider preference order
	const providerDefaults: Record<string, string> = {
		anthropic: "claude-sonnet-4-20250514",
		openai: "gpt-4o",
		google: "gemini-2.5-flash",
		groq: "llama-3.3-70b-versatile",
		xai: "grok-3-mini",
		openrouter: "anthropic/claude-sonnet-4",
	};

	// If provider specified, use it
	if (preferredProvider) {
		const apiKey = getEnvApiKey(preferredProvider);
		if (!apiKey) {
			console.error(`No API key found for provider "${preferredProvider}".`);
			console.error(`Set the appropriate environment variable (e.g., ANTHROPIC_API_KEY).`);
			process.exit(1);
		}
		const modelId = preferredModel ?? providerDefaults[preferredProvider];
		if (!modelId) {
			console.error(`No default model for provider "${preferredProvider}". Use --model to specify one.`);
			process.exit(1);
		}
		return { provider: preferredProvider, modelId, apiKey };
	}

	// Auto-detect from env vars
	const searchOrder = ["anthropic", "openai", "google", "groq", "xai", "openrouter"];
	for (const provider of searchOrder) {
		const apiKey = getEnvApiKey(provider);
		if (apiKey) {
			const modelId = preferredModel ?? providerDefaults[provider];
			if (modelId) {
				return { provider, modelId, apiKey };
			}
		}
	}

	return null;
}

function findPythonPath(cliPython?: string): string {
	// CLI flag
	if (cliPython) return cliPython;

	// Env var
	if (process.env.ANALYTICS_PYTHON_PATH) return process.env.ANALYTICS_PYTHON_PATH;

	// Check for local venv
	const localVenv = join(__dirname, "..", "python", ".venv", "bin", "python3");
	if (existsSync(localVenv)) return localVenv;

	// Check for package venv (development)
	const pkgVenv = join(__dirname, "..", ".venv", "bin", "python3");
	if (existsSync(pkgVenv)) return pkgVenv;

	// Fall back to system Python
	return "python3";
}

async function main(): Promise<void> {
	log("=== Analytics Agent starting ===");
	const args = parseArgs();
	log(`Parsed args: provider=${args.provider}, model=${args.model}, python=${args.python}`);

	if (args.help) {
		printHelp();
		process.exit(0);
	}

	// Detect model
	const detected = detectModel(args.provider, args.model);
	if (!detected) {
		console.error("No LLM provider detected. Set an API key environment variable:");
		console.error("  export ANTHROPIC_API_KEY=sk-ant-...");
		console.error("  export OPENAI_API_KEY=sk-...");
		console.error("\nOr specify a provider: analytics-agent --provider anthropic");
		console.error("\nRun analytics-agent --help for more options.");
		process.exit(1);
	}

	log(
		`Detected provider=${detected.provider}, modelId=${detected.modelId}, apiKey=${detected.apiKey ? "***" : "MISSING"}`,
	);

	const model = getModel(detected.provider as any, detected.modelId as any);
	log(
		`getModel result: ${model ? `id=${model.id}, api=${model.api}, provider=${model.provider}` : "undefined (model not found in registry!)"}`,
	);

	if (!model) {
		console.error(`Model "${detected.modelId}" not found for provider "${detected.provider}".`);
		console.error("Use --model to specify a valid model ID.");
		process.exit(1);
	}

	const pythonPath = findPythonPath(args.python);
	const modelName = `${detected.provider}/${detected.modelId}`;

	console.log(`Starting analytics agent with ${modelName}...`);
	console.log(`Python: ${pythonPath}`);
	log(`Python path: ${pythonPath}`);

	try {
		log("Creating analytics session...");
		log("Starting Python runtime...");
		const session = await createAnalyticsSession({
			model,
			apiKey: detected.apiKey,
			pythonOptions: { pythonPath },
		});
		log("Analytics session created successfully");

		log("Starting interactive mode...");
		const interactive = new InteractiveMode({ session, modelName });
		await interactive.start();
		log("Interactive mode started");
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : String(err);
		log(`Failed to start: ${errMsg}`);
		if (err instanceof Error && err.stack) {
			log(`Stack: ${err.stack}`);
		}
		console.error(`Failed to start: ${errMsg}`);
		if (String(err).includes("pandas")) {
			console.error("\nPandas not found. Install it in your Python environment:");
			console.error("  pip install pandas numpy openpyxl");
			console.error("\nOr create a venv:");
			console.error("  python3 -m venv .venv && .venv/bin/pip install pandas numpy openpyxl");
			console.error("  analytics-agent --python .venv/bin/python3");
		}
		process.exit(1);
	}
}

main();
