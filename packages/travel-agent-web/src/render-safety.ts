import type { ValidatedImage } from "./api.js";

export interface DestinationImageCarrier {
	imageLinks?: string[];
	validatedImages?: ValidatedImage[];
}

export function requireValidatedImages(): boolean {
	return (import.meta.env.VITE_REQUIRE_VALIDATED_IMAGES ?? "false").toLowerCase() === "true";
}

export function getRenderableDestinationImages(card: DestinationImageCarrier): ValidatedImage[] {
	const validated = (card.validatedImages ?? []).filter(isRenderableValidatedImage);
	if (requireValidatedImages()) return validated;
	if (validated.length > 0) return validated;
	return (card.imageLinks ?? []).filter(isRenderableRawImageUrl).map(toDebugImageEvidence);
}

export function canRenderMarkdownImage(_src: string | undefined): boolean {
	// Assistant Markdown remains model-generated text. Even when raw destination
	// card imageLinks are allowed for debugging, chat Markdown images stay hidden.
	return false;
}

function isRenderableValidatedImage(image: ValidatedImage): boolean {
	return (
		image.kind === "image" &&
		image.validationStatus === "valid" &&
		/^https:\/\//i.test(image.finalUrl) &&
		image.httpStatus >= 200 &&
		image.httpStatus < 400 &&
		image.width > 0 &&
		image.height > 0 &&
		(image.contentType?.toLowerCase().startsWith("image/") ?? false)
	);
}

function isRenderableRawImageUrl(url: string): boolean {
	return /^https?:\/\/.+\.(?:jpe?g|png|webp|gif|avif)(?:[?#].*)?$/i.test(url.trim());
}

function toDebugImageEvidence(url: string): ValidatedImage {
	const now = new Date(0).toISOString();
	return {
		kind: "image",
		url,
		finalUrl: url,
		provider: "debug-raw-imageLinks",
		retrievedAt: now,
		validatedAt: now,
		httpStatus: 200,
		contentType: "image/debug-unvalidated",
		width: 1,
		height: 1,
		validationStatus: "valid",
	};
}
