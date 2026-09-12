import { type Api, getModels, type KnownProvider, type Model } from "@earendil-works/pi-ai";

export function resolveTravelModel(provider: string, modelId: string): Model<Api> {
	const custom = resolveCustomModel(provider, modelId);
	if (custom) return custom;
	const model = getModels(provider as KnownProvider).find((candidate) => candidate.id === modelId);
	if (!model) throw new Error(`Unknown model: ${provider}/${modelId}`);
	return model;
}

function resolveCustomModel(provider: string, modelId: string): Model<"openai-completions"> | undefined {
	if (provider !== "ollama" || modelId !== "kimi-k2.6") return undefined;

	return {
		id: modelId,
		name: "Ollama Cloud: kimi-k2.6",
		api: "openai-completions",
		provider: "ollama",
		baseUrl: "https://ollama.com/v1",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 8_192,
		compat: {
			supportsStore: false,
			supportsDeveloperRole: false,
			supportsReasoningEffort: false,
			supportsUsageInStreaming: true,
			maxTokensField: "max_tokens",
			supportsStrictMode: false,
			supportsLongCacheRetention: false,
		},
	};
}
