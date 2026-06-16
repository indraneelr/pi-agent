import { describe, expect, it, vi } from "vitest";
import {
	cleanDestinationImageLinks,
	fetchImageUrlsFromQuery,
	filterValidImageUrls,
	type ImageHttpProbe,
	validateImageUrls,
} from "../src/core/image-validation.js";

/**
 * Image link validation tests.
 *
 * The HTTP transport is injectable, so these tests never touch the network.
 */
function probeFrom(map: Record<string, { status: number; contentType: string | null }>): ImageHttpProbe {
	return async (url) => map[url] ?? { status: 404, contentType: null };
}

describe("validateImageUrls", () => {
	it("marks 2xx image content-type links ok", async () => {
		const results = await validateImageUrls(["https://x/a.jpg"], {
			http: probeFrom({ "https://x/a.jpg": { status: 200, contentType: "image/jpeg" } }),
		});
		expect(results[0].ok).toBe(true);
	});

	it("marks links whose GET returned a non-image content-type as broken", async () => {
		const results = await validateImageUrls(["https://x/page"], {
			http: probeFrom({ "https://x/page": { status: 200, contentType: "text/html" } }),
		});
		expect(results[0].ok).toBe(false);
	});

	it("marks 404 links broken", async () => {
		const results = await validateImageUrls(["https://x/missing.jpg"], {
			http: probeFrom({ "https://x/missing.jpg": { status: 404, contentType: null } }),
		});
		expect(results[0].ok).toBe(false);
		expect(results[0].status).toBe(404);
	});

	it("rejects non-http(s) input without probing", async () => {
		const probe = vi.fn();
		const results = await validateImageUrls(["ftp://x/a.jpg"], { http: probe });
		expect(results[0].ok).toBe(false);
		expect(probe).not.toHaveBeenCalled();
	});

	it("dedupes and preserves input order", async () => {
		const results = await validateImageUrls(["https://x/a.jpg", "https://x/a.jpg", "https://x/b.png"], {
			http: probeFrom({
				"https://x/a.jpg": { status: 200, contentType: "image/jpeg" },
				"https://x/b.png": { status: 200, contentType: "image/png" },
			}),
		});
		expect(results.map((r) => r.url)).toEqual(["https://x/a.jpg", "https://x/a.jpg", "https://x/b.png"]);
		expect(results.every((r) => r.ok)).toBe(true);
	});
});

describe("filterValidImageUrls", () => {
	it("splits into valid/broken buckets", async () => {
		const { valid, broken } = await filterValidImageUrls(["https://x/ok.jpg", "https://x/broken.jpg"], {
			http: probeFrom({
				"https://x/ok.jpg": { status: 200, contentType: "image/jpeg" },
				"https://x/broken.jpg": { status: 404, contentType: null },
			}),
		});
		expect(valid).toEqual(["https://x/ok.jpg"]);
		expect(broken[0].url).toBe("https://x/broken.jpg");
	});
});

describe("fetchImageUrlsFromQuery", () => {
	it("parses thumburls out of the Wikimedia API response", async () => {
		const fakeHttp = async () =>
			JSON.stringify({
				query: {
					pages: {
						1: {
							title: "Florence.jpg",
							imageinfo: [{ thumburl: "https://upload/thumb/Florence.jpg", mime: "image/jpeg" }],
						},
						2: { title: "Rome.jpg", imageinfo: [{ thumburl: "https://upload/thumb/Rome.jpg" }] },
					},
				},
			});
		const urls = await fetchImageUrlsFromQuery("Florence Duomo", { http: fakeHttp });
		expect(urls).toEqual(["https://upload/thumb/Florence.jpg", "https://upload/thumb/Rome.jpg"]);
	});

	it("returns [] when the API errors or is unparseable", async () => {
		const failingHttp = async () => {
			throw new Error("network down");
		};
		const urls = await fetchImageUrlsFromQuery("nothing", { http: failingHttp });
		expect(urls).toEqual([]);
	});

	it("returns [] for an empty query", async () => {
		const urls = await fetchImageUrlsFromQuery("   ", { http: async () => "{}" });
		expect(urls).toEqual([]);
	});
});

describe("cleanDestinationImageLinks", () => {
	it("keeps valid links, drops broken ones, and refetches when a card is left empty", async () => {
		const cards = [
			{ name: "Florence", imageQuery: "Florence Duomo", imageLinks: ["https://x/ok.jpg", "https://x/404.jpg"] },
			{ name: "Rome", imageQuery: "Rome Colosseum", imageLinks: ["https://x/broken.jpg"] },
		];

		const report = await cleanDestinationImageLinks(cards, {
			validate: {
				http: probeFrom({
					"https://x/ok.jpg": { status: 200, contentType: "image/jpeg" },
					"https://x/404.jpg": { status: 404, contentType: null },
					"https://x/broken.jpg": { status: 404, contentType: null },
					"https://upload/thumb/Rome.jpg": { status: 200, contentType: "image/jpeg" },
				}),
			},
			wikimedia: {
				http: async () =>
					JSON.stringify({
						query: {
							pages: {
								1: {
									title: "Rome.jpg",
									imageinfo: [{ thumburl: "https://upload/thumb/Rome.jpg", mime: "image/jpeg" }],
								},
							},
						},
					}),
			},
		});
		expect(report.totalChecked).toBe(3);
		expect(report.broken).toBe(2);
		expect(report.refetched).toBe(1);
		expect(cards[0].imageLinks).toEqual(["https://x/ok.jpg"]);
		expect(cards[1].imageLinks).toEqual(["https://upload/thumb/Rome.jpg"]);
	});

	it("is a no-op for cards with no candidates and no refetch", async () => {
		const cards = [{ name: "X", imageQuery: "X", imageLinks: [] as string[] }];
		const report = await cleanDestinationImageLinks(cards, { refetch: false });
		expect(report.totalChecked).toBe(0);
		expect(cards[0].imageLinks).toEqual([]);
	});
});
