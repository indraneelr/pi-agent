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
