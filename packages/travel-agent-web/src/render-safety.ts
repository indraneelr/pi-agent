import rehypeSanitize from "rehype-sanitize";
import type { ValidatedImage } from "./api.js";

/**
 * Rehype plugins for model-generated Markdown. CopilotKit's Markdown always
 * enables rehype-raw, so raw HTML from the model (or a prompt-injected search
 * result it echoes) must be sanitized after parsing: no scripts, iframes,
 * styles, forms, event handlers or non-http(s)/mailto links.
 */
export const assistantMarkdownRehypePlugins = [rehypeSanitize];

export interface DestinationImageCarrier {
	imageLinks?: string[];
	validatedImages?: ValidatedImage[];
}

export function requireValidatedImages(): boolean {
	return import.meta.env.PROD || (import.meta.env.VITE_REQUIRE_VALIDATED_IMAGES ?? "true").toLowerCase() === "true";
}

export function getRenderableDestinationImages(card: DestinationImageCarrier): ValidatedImage[] {
	const seen = new Set<string>();
	const validated = (card.validatedImages ?? []).filter((image) => {
		if (!isRenderableValidatedImage(image) || seen.has(image.finalUrl)) return false;
		seen.add(image.finalUrl);
		return true;
	});
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
