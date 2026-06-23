import { describe, expect, it } from "vitest";
import type { ChecklistPhaseConfig } from "../src/core/checklist.js";
import { parseSearxngCandidates } from "../src/core/image-search/searxng.js";
import type { ImageSearchProvider } from "../src/core/image-search/types.js";
import { parseImageDimensions, validateImageCandidates } from "../src/core/image-search/validate.js";
import { createTravelState } from "../src/core/state.js";
import { createGetImagesTool } from "../src/core/tools/get-images.js";

const checklist: ChecklistPhaseConfig[] = [{ id: "shortlist_destinations", label: "Shortlist", description: "" }];

describe("get_images", () => {
	it("parses SearXNG image candidates including dimensions", () => {
		const candidates = parseSearxngCandidates({
			results: [
				{
					title: "Dolomites",
					img_src: "https://example.com/dolomites.jpg",
					resolution: "1600x900",
					url: "https://source.example/page",
				},
			],
		});
		expect(candidates[0]).toMatchObject({ url: "https://example.com/dolomites.jpg", width: 1600, height: 900 });
	});

	it("returns only reachable images that satisfy min/max height and include dimensions", async () => {
		const result = await validateImageCandidates(
			[
				{ url: "https://example.com/ok.jpg", width: 1280, height: 720 },
				{ url: "https://example.com/small.jpg", width: 640, height: 360 },
				{ url: "https://example.com/broken.jpg", width: 1280, height: 720 },
			],
			{
				minHeight: 720,
				maxHeight: null,
				limit: 5,
				validate: {
					http: async (url) => ({ status: url.includes("broken") ? 404 : 200, contentType: "image/jpeg" }),
				},
			},
		);
		expect(result.images).toEqual([{ url: "https://example.com/ok.jpg", width: 1280, height: 720 }]);
		expect(result.rejectedCount).toBe(2);
	});

	it("falls back to the next provider when the first image provider fails", async () => {
		const state = createTravelState("s1", checklist);
		const brokenProvider: ImageSearchProvider = {
			name: "searxng",
			async searchImages() {
				throw new Error("SearXNG unavailable");
			},
		};
		const workingProvider: ImageSearchProvider = {
			name: "stagehand",
			async searchImages() {
				return {
					provider: "stagehand",
					rejectedCount: 1,
					images: [{ url: "https://example.com/fallback.jpg", width: 1280, height: 720 }],
				};
			},
		};
		const tool = createGetImagesTool({
			getState: () => state,
			setState: () => undefined,
			persistOpts: { dataDir: "/tmp/get-images-test" },
			searxng: brokenProvider,
			stagehand: workingProvider,
		});

		const result = await tool.execute("tool-1", { query: "fallback test" });

		expect(result.details.provider).toBe("stagehand");
		expect(result.details.images[0].url).toBe("https://example.com/fallback.jpg");
		expect(result.details.providerErrors?.[0]).toContain("SearXNG unavailable");
	});

	it("updates a matching destination card with validated URLs", async () => {
		const state = createTravelState("s1", checklist);
		state.destinationResearch = {
			destination: { title: "Italy", name: "Italy", description: "", bestTimeToVisit: "", reviews: {}, sources: [] },
			overallSummary: "",
			tripHighlights: [],
			travelTips: [],
			preferencesUsed: { themes: [], groupType: "family" },
			subDestinations: [
				{ name: "Dolomites", type: "mountains", description: "", imageLinks: [], reviews: {}, sources: [] },
			],
		};
		const provider: ImageSearchProvider = {
			name: "searxng",
			async searchImages() {
				return {
					provider: "searxng",
					rejectedCount: 0,
					images: [{ url: "https://example.com/dolomites.jpg", width: 1600, height: 900 }],
				};
			},
		};
		let latest = state;
		const tool = createGetImagesTool({
			getState: () => latest,
			setState: (next) => {
				latest = next;
			},
			persistOpts: { dataDir: "/tmp/get-images-test" },
			searxng: provider,
			stagehand: null,
		});

		const result = await tool.execute("tool-1", {
			query: "Dolomites Italy mountains",
			destination_name: "Dolomites",
			provider: "searxng",
		});

		expect(result.details.images[0]).toMatchObject({ width: 1600, height: 900 });
		expect(latest.destinationResearch?.subDestinations[0].imageLinks).toEqual(["https://example.com/dolomites.jpg"]);
	});

	it("parses PNG dimensions from bytes", () => {
		const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000500000002d0000000000", "hex");
		expect(parseImageDimensions(png)).toEqual({ width: 1280, height: 720 });
	});
});
