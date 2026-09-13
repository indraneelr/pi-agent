import { afterEach, expect, test, vi } from "vitest";
import { createSearxngImageSearchProvider, parseSearxngCandidates } from "../src/core/image-search/searxng.js";
import { validateImageCandidates } from "../src/core/image-search/validate.js";

afterEach(() => vi.restoreAllMocks());
const rows = Array.from({ length: 16 }, (_, i) => ({
	img_src: `https://photos.example/${i}.jpg`,
	thumbnail_src: `https://thumbs.example/${i}.jpg`,
	resolution: "1280x960",
	url: `https://publisher.example/photos/${i}`,
	source: "publisher.example",
}));

test("originals and thumbnails share identity but not dimensions", () => {
	const candidates = parseSearxngCandidates({ results: rows.slice(0, 1) });
	expect(candidates).toHaveLength(2);
	expect(candidates[0]).toMatchObject({ identityUrl: rows[0].img_src, width: 1280, height: 960, source: rows[0].url });
	expect(candidates[1]).toMatchObject({ identityUrl: rows[0].img_src });
	expect(candidates[1].height).toBeUndefined();
	expect(parseSearxngCandidates({ results: [{ img_src: "//photos.example/1.jpg" }] })[0].url).toBe(
		"https://photos.example/1.jpg",
	);
});

test("retrieves eight distinct results and then eight new photos with photo-engine request parameters", async () => {
	const requests: string[] = [];
	vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
		requests.push(String(url));
		return new Response(JSON.stringify({ results: rows }), { headers: { "content-type": "application/json" } });
	});
	const checked: string[] = [];
	const provider = createSearxngImageSearchProvider({
		baseUrl: "http://localhost:8888",
		validate: {
			http: async (url) => {
				checked.push(url);
				return { status: 200, contentType: "image/jpeg", finalUrl: url };
			},
		},
	})!;
	const query = { query: "Da Nang beaches", count: 8, minHeight: 720, maxHeight: null };
	const first = await provider.searchImages(query);
	const second = await provider.searchImages({
		...query,
		excludeUrls: first.images.map((image) => image.identityUrl!),
	});
	expect(first.images.map((image) => image.url)).toEqual(rows.slice(0, 8).map((row) => row.img_src));
	expect(second.images.map((image) => image.url)).toEqual(rows.slice(8).map((row) => row.img_src));
	expect(checked.some((url) => url.includes("thumbs"))).toBe(false);
	const params = new URL(requests[0]).searchParams;
	expect(Object.fromEntries(params)).toMatchObject({
		q: query.query,
		format: "json",
		safesearch: "1",
		engines: "bing images,duckduckgo images,flickr,wikicommons",
	});
	expect(params.has("categories")).toBe(false);
});

test.each([240, 900])(
	"probes fallback thumbnail dimensions instead of trusting the original height: %s",
	async (height) => {
		const probe = vi.fn(async () => ({ width: 1200, height }));
		const result = await validateImageCandidates(parseSearxngCandidates({ results: rows.slice(0, 1) }), {
			minHeight: 720,
			maxHeight: null,
			limit: 8,
			dimensionProbe: probe,
			validate: { http: async (url) => ({ status: url.includes("thumbs") ? 200 : 404, contentType: "image/jpeg" }) },
		});
		expect(probe).toHaveBeenCalledOnce();
		expect(result.images).toHaveLength(height >= 720 ? 1 : 0);
		if (height >= 720) expect(result.images[0]).toMatchObject({ identityUrl: rows[0].img_src, height });
	},
);

test("redirect aliases and previously saved final URLs do not consume the unique-photo limit", async () => {
	const result = await validateImageCandidates(
		rows.slice(0, 4).map((row) => ({ url: row.img_src, width: 1280, height: 960 })),
		{
			minHeight: 720,
			maxHeight: null,
			limit: 8,
			excludeUrls: ["https://cdn.example/old.jpg"],
			validate: {
				http: async (url) => ({
					status: 200,
					contentType: "image/jpeg",
					finalUrl: url.endsWith("0.jpg") ? "https://cdn.example/old.jpg" : "https://cdn.example/new.jpg",
				}),
			},
		},
	);
	expect(result.images).toHaveLength(1);
	expect(result.images[0].validation?.finalUrl).toBe("https://cdn.example/new.jpg");
});
