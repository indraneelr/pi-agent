import { Markdown } from "@copilotkit/react-ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test } from "vitest";
import type { ValidatedImage } from "../src/api.js";
import {
	assistantMarkdownRehypePlugins,
	canRenderMarkdownImage,
	getRenderableDestinationImages,
} from "../src/render-safety.js";

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

afterEach(() => {
	import.meta.env.VITE_REQUIRE_VALIDATED_IMAGES = "false";
});

describe("render safety", () => {
	test("renders a final image URL only once even when repeated in saved evidence", () => {
		expect(
			getRenderableDestinationImages({
				validatedImages: [validImage, { ...validImage, url: "https://other.example/alias.jpg" }],
			}),
		).toEqual([validImage]);
	});
	test("can render raw destination imageLinks when strict validation toggle is off", () => {
		import.meta.env.VITE_REQUIRE_VALIDATED_IMAGES = "false";
		const images = getRenderableDestinationImages({ imageLinks: ["https://fake.example/image.jpg"] });
		expect(images[0]).toMatchObject({
			finalUrl: "https://fake.example/image.jpg",
			provider: "debug-raw-imageLinks",
		});
	});

	test("does not render raw destination imageLinks when strict validation toggle is on", () => {
		import.meta.env.VITE_REQUIRE_VALIDATED_IMAGES = "true";
		expect(getRenderableDestinationImages({ imageLinks: ["https://fake.example/image.jpg"] })).toEqual([]);
	});

	test("renders valid image evidence regardless of toggle", () => {
		import.meta.env.VITE_REQUIRE_VALIDATED_IMAGES = "true";
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

	test("strips executable and embedding HTML from assistant Markdown", () => {
		const content = [
			"**Naxos** is great.",
			"<iframe srcdoc=\"<script>fetch('/api/credentials')</script>\"></iframe>",
			"<script>alert(1)</script>",
			"<style>body{display:none}</style>",
			'<form action="https://evil.example"><input name="key"></form>',
			'<a href="javascript:alert(1)">bad</a> <a href="https://ok.example">good</a>',
			'<b onclick="alert(1)">bold</b>',
		].join("\n\n");
		const html = renderToStaticMarkup(
			createElement(Markdown, { content, rehypePlugins: assistantMarkdownRehypePlugins }),
		);
		expect(html).toContain("<strong>Naxos</strong>");
		expect(html).toContain('href="https://ok.example"');
		expect(html).toContain("<b>bold</b>");
		for (const forbidden of ["<iframe", "srcdoc", "<script", "<style", "<form", "javascript:", "onclick"]) {
			expect(html, forbidden).not.toContain(forbidden);
		}
		// Only GFM task-list checkboxes survive: forced disabled, outside any form.
		for (const input of html.match(/<input[^>]*>/g) ?? []) {
			expect(input).toContain('type="checkbox"');
			expect(input).toContain("disabled");
		}
	});
});
