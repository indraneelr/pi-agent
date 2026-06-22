import type { ValidatedImage } from "./api.js";

export interface DestinationImageCarrier {
	imageLinks?: string[];
	validatedImages?: ValidatedImage[];
}

export function getRenderableDestinationImages(card: DestinationImageCarrier): ValidatedImage[] {
	return (card.validatedImages ?? []).filter(isRenderableValidatedImage);
}

export function canRenderMarkdownImage(_src: string | undefined): boolean {
	// Assistant Markdown is model-generated text. Until the server can attach
	// resource IDs/evidence to a specific Markdown image, do not render arbitrary
	// image URLs from chat content.
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
