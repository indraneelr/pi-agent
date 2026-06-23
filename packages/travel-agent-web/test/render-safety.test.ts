import { describe, expect, test } from "vitest";
import type { ValidatedImage } from "../src/api.js";
import { canRenderMarkdownImage, getRenderableDestinationImages } from "../src/render-safety.js";

const validImage: ValidatedImage = {
	kind: "image",
	url: "https://example.com/original.jpg",
	finalUrl: "https://cdn.example.com/final.jpg",
	provider: "searxng",
	source: "https://source.example/page",
	retrievedAt: "2026-06-22T00:00:00.000Z",
	validatedAt: "2026-06-22T00:00:01.000Z",
	httpStatus: 200,
	contentType: "image/jpeg",
	width: 1280,
	height: 720,
	validationStatus: "valid",
};

describe("render safety", () => {
	test("does not render raw destination imageLinks without validation evidence", () => {
		expect(getRenderableDestinationImages({ imageLinks: ["https://fake.example/image.jpg"] })).toEqual([]);
	});

	test("renders only valid image evidence", () => {
		expect(getRenderableDestinationImages({ validatedImages: [validImage] })).toEqual([validImage]);
	});

	test("rejects invalid or non-image evidence", () => {
		expect(
			getRenderableDestinationImages({
				validatedImages: [
					{ ...validImage, finalUrl: "http://cdn.example.com/final.jpg" },
					{ ...validImage, contentType: "text/html" },
					{ ...validImage, validationStatus: "invalid", rejectionReason: "broken" },
				],
			}),
		).toEqual([]);
	});

	test("silently blocks model-generated Markdown image URLs", () => {
		expect(canRenderMarkdownImage("https://example.com/plausible-but-unverified.jpg")).toBe(false);
	});
});
