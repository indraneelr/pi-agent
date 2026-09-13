/** get_images tool — deterministic image search with validation. */

import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
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
	count: Type.Optional(
		Type.Number({
			description:
				"Request 8 images per call. The service normalizes this value to 8; fewer may be returned if unavailable.",
		}),
	),
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

/** Default per-provider image-search timeout; a slow provider yields to the next (ADR 0002). */
const DEFAULT_IMAGE_TIMEOUT_MS = 15_000;

export interface GetImagesDetails {
	query: string;
	provider: ImageSearchProviderName | "none";
	minHeight: number;
	maxHeight: number | null;
	images: ValidImageResult[];
	rejectedCount: number;
	updatedDestination?: string;
	providerErrors?: string[];
	notice?: string;
}

export interface GetImagesDeps {
	getState: () => TravelState;
	setState: (state: TravelState) => void;
	persistOpts: PersistenceOptions;
	searxng?: ImageSearchProvider | null;
	stagehand?: ImageSearchProvider | null;
	stagehandOptions?: StagehandImageSearchOptions;
	/** Per-provider timeout before failing over to the next provider. Default 15s. */
	imageTimeoutMs?: number;
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
			const count = 8;
			const minHeight = Math.max(1, Math.round(params.min_height ?? 720));
			const maxHeight =
				params.max_height === undefined || params.max_height === null
					? null
					: Math.max(minHeight, Math.round(params.max_height));
			const providerPreference = params.provider ?? "auto";

			const providers = resolveProviders(deps, providerPreference);
			const key = (params.destination_name ?? params.query).trim().toLowerCase();
			const existing = deps.getState().validatedImages?.[key] ?? [];
			const timeoutMs = deps.imageTimeoutMs ?? DEFAULT_IMAGE_TIMEOUT_MS;
			let lastRejected = 0;
			const providerErrors: string[] = [];
			for (const provider of providers) {
				try {
					const result = await searchImagesWithTimeout(
						provider,
						{
							query: params.query,
							count,
							minHeight,
							maxHeight,
							signal,
							excludeUrls: existing.flatMap((image) => [
								image.url,
								image.finalUrl,
								image.identityUrl ?? image.url,
							]),
						},
						timeoutMs,
					);
					lastRejected += result.rejectedCount;
					if (result.images.length === 0 && providerPreference === "auto") continue;
					const state = deps.getState();
					signal?.throwIfAborted();
					state.validatedImages = {
						...state.validatedImages,
						[key]: [
							...existing,
							...result.images.flatMap((image) =>
								image.validation
									? [
											{
												kind: "image" as const,
												url: image.url,
												identityUrl: image.identityUrl,
												...image.validation,
												provider: result.provider,
												source: image.source,
												width: image.width,
												height: image.height,
												retrievedAt: image.validation.validatedAt,
												validationStatus: "valid" as const,
											},
										]
									: [],
							),
						].filter(
							(image, index, all) => all.findIndex((entry) => entry.finalUrl === image.finalUrl) === index,
						),
					};
					deps.setState(state);
					saveTravelState(state, deps.persistOpts);
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

/**
 * Race an image search against a timeout, aborting the slow attempt so the
 * caller's failover loop moves on (ADR 0002). A timeout surfaces as a thrown
 * error, which the loop treats like any provider failure.
 */
async function searchImagesWithTimeout(
	provider: ImageSearchProvider,
	query: Parameters<ImageSearchProvider["searchImages"]>[0],
	timeoutMs: number,
) {
	if (!timeoutMs || timeoutMs <= 0) return provider.searchImages(query);
	const controller = new AbortController();
	const onAbort = () => controller.abort();
	query.signal?.addEventListener("abort", onAbort, { once: true });
	let timer: ReturnType<typeof setTimeout> | undefined;
	const attempt = provider.searchImages({ ...query, signal: controller.signal });
	// Swallow a post-timeout rejection (from the abort) to avoid unhandled rejections.
	void attempt.catch(() => {});
	try {
		return await Promise.race([
			attempt,
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(() => {
					controller.abort();
					reject(new Error(`timeout after ${timeoutMs}ms`));
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
		query.signal?.removeEventListener("abort", onAbort);
	}
}

function resolveProviders(deps: GetImagesDeps, preference: "auto" | ImageSearchProviderName): ImageSearchProvider[] {
	const searxng = deps.searxng === undefined ? createSearxngImageSearchProvider() : deps.searxng;
	const stagehand = deps.stagehand === undefined ? maybeCreateStagehand(deps.stagehandOptions) : deps.stagehand;
	if (preference === "searxng") return searxng ? [searxng] : [];
	if (preference === "stagehand") return stagehand ? [stagehand] : [];
	return [searxng, stagehand].filter((p): p is ImageSearchProvider => !!p);
}

function maybeCreateStagehand(options?: StagehandImageSearchOptions): ImageSearchProvider | null {
	if (["0", "false"].includes((process.env.USE_STAGEHAND ?? "").toLowerCase())) return null;
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
	const matches = [
		...(state.destinationResearch?.subDestinations ?? []),
		...state.selectedDestinations,
		...(state.activitiesResearch?.activities ?? []),
	].filter((card) => normalizeName(card.name) === normalized);
	if (!matches.length) return undefined;
	for (const card of matches)
		card.imageLinks = [...new Set([...(card.imageLinks ?? []), ...images.map((image) => image.url)])];
	deps.setState(state);
	saveTravelState(state, deps.persistOpts);
	return destinationName;
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
	const notice =
		images.length === 0
			? "No photos available. Continue planning and save the option cards with imageLinks: []. Do not retry an unavailable provider with different queries or ask the user to wait for photos. Never invent image URLs."
			: undefined;
	const details = {
		query,
		provider,
		minHeight,
		maxHeight,
		images,
		rejectedCount,
		updatedDestination,
		providerErrors,
		notice,
	};
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
						notice,
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
