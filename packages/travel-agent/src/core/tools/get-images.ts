/** get_images tool — deterministic image search with validation. */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import { createSearxngImageSearchProvider } from "../image-search/searxng.js";
import {
	createStagehandImageSearchProvider,
	type StagehandImageSearchOptions,
} from "../image-search/stagehand-images.js";
import type { ImageSearchProvider, ImageSearchProviderName, ValidImageResult } from "../image-search/types.js";
import type { PersistenceOptions } from "../persistence.js";
import { saveTravelState } from "../persistence.js";
import type { TravelState } from "../state.js";

const getImagesSchema = Type.Object({
	query: Type.String({ description: "Image search query, e.g. 'Dolomites Italy mountains landscape'." }),
	destination_name: Type.Optional(
		Type.String({ description: "Optional destination/card name whose imageLinks should be updated." }),
	),
	count: Type.Optional(Type.Number({ description: "Number of images to return. Default 6, max 10." })),
	provider: Type.Optional(
		Type.Union([Type.Literal("auto"), Type.Literal("searxng"), Type.Literal("stagehand")], {
			description: "Image provider. Default auto.",
		}),
	),
	min_height: Type.Optional(Type.Number({ description: "Minimum image height in pixels. Default 720." })),
	max_height: Type.Optional(
		Type.Union([Type.Number(), Type.Null()], {
			description: "Maximum image height in pixels. Default null means no upper bound.",
		}),
	),
});

type GetImagesInput = Static<typeof getImagesSchema>;

export interface GetImagesDetails {
	query: string;
	provider: ImageSearchProviderName | "none";
	minHeight: number;
	maxHeight: number | null;
	images: ValidImageResult[];
	rejectedCount: number;
	updatedDestination?: string;
	providerErrors?: string[];
}

export interface GetImagesDeps {
	getState: () => TravelState;
	setState: (state: TravelState) => void;
	persistOpts: PersistenceOptions;
	searxng?: ImageSearchProvider | null;
	stagehand?: ImageSearchProvider | null;
	stagehandOptions?: StagehandImageSearchOptions;
}

export function createGetImagesTool(deps: GetImagesDeps): AgentTool<typeof getImagesSchema, GetImagesDetails> {
	return {
		name: "get_images",
		label: "Get Images",
		description:
			"Search for real destination/activity images and return only validated, reachable image URLs with width/height. " +
			"Use this whenever the user asks to see images or when destination cards need imageLinks. Never invent image URLs.",
		parameters: getImagesSchema,
		async execute(
			_toolCallId: string,
			params: GetImagesInput,
			signal?: AbortSignal,
		): Promise<AgentToolResult<GetImagesDetails>> {
			const count = Math.min(Math.max(Math.round(params.count ?? 6), 1), 10);
			const minHeight = Math.max(1, Math.round(params.min_height ?? 720));
			const maxHeight =
				params.max_height === undefined || params.max_height === null
					? null
					: Math.max(minHeight, Math.round(params.max_height));
			const providerPreference = params.provider ?? "auto";

			const providers = resolveProviders(deps, providerPreference);
			let lastRejected = 0;
			const providerErrors: string[] = [];
			for (const provider of providers) {
				try {
					const result = await provider.searchImages({ query: params.query, count, minHeight, maxHeight, signal });
					lastRejected += result.rejectedCount;
					if (result.images.length === 0 && providerPreference === "auto") continue;
					const updatedDestination = params.destination_name
						? updateDestinationImages(deps, params.destination_name, result.images)
						: undefined;
					return formatResult(
						params.query,
						result.provider,
						minHeight,
						maxHeight,
						result.images,
						lastRejected,
						updatedDestination,
						providerErrors,
					);
				} catch (e) {
					providerErrors.push(`${provider.name}: ${e instanceof Error ? e.message : String(e)}`);
					if (providerPreference !== "auto") break;
				}
			}

			return formatResult(params.query, "none", minHeight, maxHeight, [], lastRejected, undefined, providerErrors);
		},
	};
}

function resolveProviders(deps: GetImagesDeps, preference: "auto" | ImageSearchProviderName): ImageSearchProvider[] {
	const searxng = deps.searxng === undefined ? createSearxngImageSearchProvider() : deps.searxng;
	const stagehand = deps.stagehand === undefined ? maybeCreateStagehand(deps.stagehandOptions) : deps.stagehand;
	if (preference === "searxng") return searxng ? [searxng] : [];
	if (preference === "stagehand") return stagehand ? [stagehand] : [];
	return [searxng, stagehand].filter((p): p is ImageSearchProvider => !!p);
}

function maybeCreateStagehand(options?: StagehandImageSearchOptions): ImageSearchProvider | null {
	try {
		return createStagehandImageSearchProvider(options);
	} catch {
		return null;
	}
}

function updateDestinationImages(
	deps: GetImagesDeps,
	destinationName: string,
	images: ValidImageResult[],
): string | undefined {
	if (images.length === 0) return undefined;
	const normalized = normalizeName(destinationName);
	const state = deps.getState();
	let matched: { imageLinks?: string[]; name?: string } | undefined;

	for (const destination of state.destinationResearch?.subDestinations ?? []) {
		if (normalizeName(destination.name) === normalized) matched = destination;
	}
	for (const destination of state.selectedDestinations ?? []) {
		if (normalizeName(destination.name) === normalized) matched = destination;
	}
	if (!matched) return undefined;
	matched.imageLinks = images.map((image) => image.url);
	deps.setState(state);
	saveTravelState(state, deps.persistOpts);
	return matched.name ?? destinationName;
}

function formatResult(
	query: string,
	provider: ImageSearchProviderName | "none",
	minHeight: number,
	maxHeight: number | null,
	images: ValidImageResult[],
	rejectedCount: number,
	updatedDestination?: string,
	providerErrors?: string[],
): AgentToolResult<GetImagesDetails> {
	const details = { query, provider, minHeight, maxHeight, images, rejectedCount, updatedDestination, providerErrors };
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify(
					{
						query,
						provider,
						min_height: minHeight,
						max_height: maxHeight,
						images,
						rejectedCount,
						updatedDestination,
						providerErrors,
					},
					null,
					2,
				),
			},
		],
		details,
	};
}

function normalizeName(name: string | undefined): string {
	return (name ?? "").trim().toLowerCase();
}
