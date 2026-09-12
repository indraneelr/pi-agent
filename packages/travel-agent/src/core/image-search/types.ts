/** Shared image-search provider types. */

export type ImageSearchProviderName = "searxng" | "stagehand";

export interface ImageSearchQuery {
	query: string;
	count: number;
	minHeight: number;
	maxHeight: number | null;
	signal?: AbortSignal;
}

export interface ImageCandidate {
	url: string;
	width?: number;
	height?: number;
	title?: string;
	source?: string;
}

export interface ValidImageResult {
	url: string;
	width: number;
	height: number;
	title?: string;
	source?: string;
	validation?: { finalUrl: string; httpStatus: number; contentType: string; validatedAt: string };
}

export interface ValidatedImage {
	kind: "image";
	url: string;
	finalUrl: string;
	provider: string;
	source?: string;
	retrievedAt: string;
	validatedAt: string;
	httpStatus: number;
	contentType: string;
	width: number;
	height: number;
	validationStatus: "valid";
}

export interface ImageSearchResult {
	provider: ImageSearchProviderName;
	images: ValidImageResult[];
	rejectedCount: number;
}

export interface ImageSearchProvider {
	name: ImageSearchProviderName;
	searchImages(query: ImageSearchQuery): Promise<ImageSearchResult>;
}
