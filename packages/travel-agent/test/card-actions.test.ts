import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { SearchSources } from "../src/core/search/sources.js";
import { createTravelState } from "../src/core/state.js";
import { createGetImagesTool } from "../src/core/tools/get-images.js";
import { createSaveDestinationReviewsTool } from "../src/core/tools/save-destination-reviews.js";
import { createWebSearchTool } from "../src/core/tools/web-search.js";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function setup() {
	const dataDir = mkdtempSync(join(tmpdir(), "card-actions-"));
	dirs.push(dataDir);
	let state = createTravelState("test", []);
	const card = { name: "Hanoi", type: "city", description: "", reviews: {}, sources: [], imageLinks: [] as string[] };
	state.destinationResearch = {
		destination: {
			title: "Vietnam",
			name: "Vietnam",
			description: "",
			bestTimeToVisit: "",
			reviews: {},
			sources: [],
		},
		subDestinations: [card],
		overallSummary: "",
		tripHighlights: [],
		travelTips: [],
		preferencesUsed: { themes: [], groupType: "family" },
	};
	state.selectedDestinations = [structuredClone(card)];
	return {
		getState: () => state,
		setState: (next: typeof state) => {
			state = next;
		},
		persistOpts: { dataDir },
		sources: new SearchSources(),
	};
}

test("more photos append deduplicated evidence and update both selected and shortlist cards", async () => {
	const deps = setup();
	let call = 0;
	const tool = createGetImagesTool({
		...deps,
		stagehand: null,
		searxng: {
			name: "searxng",
			async searchImages(query) {
				call++;
				expect(query.count).toBe(8);
				if (call > 1) expect(query.excludeUrls).toContain("https://example.com/1.jpg");
				return {
					provider: "searxng",
					rejectedCount: 0,
					images: [1, call].map((n) => ({
						url: `https://example.com/${n}.jpg`,
						width: 1280,
						height: 720,
						validation: {
							finalUrl: `https://example.com/${n}.jpg`,
							httpStatus: 200,
							contentType: "image/jpeg",
							validatedAt: new Date().toISOString(),
						},
					})),
				};
			},
		},
	});
	await tool.execute("1", { query: "Hanoi", destination_name: "Hanoi", count: 1 });
	await tool.execute("2", { query: "Hanoi", destination_name: "Hanoi" });
	expect(deps.getState().validatedImages?.hanoi).toHaveLength(2);
	expect(deps.getState().destinationResearch?.subDestinations[0].imageLinks).toEqual([
		"https://example.com/1.jpg",
		"https://example.com/2.jpg",
	]);
	expect(deps.getState().selectedDestinations[0].imageLinks).toEqual(
		deps.getState().destinationResearch?.subDestinations[0].imageLinks,
	);
});

test("reviews persist pros, cons and sourced ratings without overwriting unrelated card fields", async () => {
	const deps = setup();
	const sourceUrl = "https://www.tripadvisor.com/Tourism-Hanoi.html";
	const sourceId = deps.sources.add({ url: sourceUrl, title: "Hanoi", snippet: "Hanoi rating: 4.5 out of 5" });
	const tool = createSaveDestinationReviewsTool(deps);
	await tool.execute("1", {
		destination_name: "Hanoi",
		pros: ["Great food"],
		cons: ["Traffic"],
		reviewSummary: "Mixed traveler experiences",
		source_ids: [sourceId],
		providerRatings: [{ provider: "tripadvisor", source_id: sourceId, rating: 4.5, placeName: "Hanoi" }],
	});
	const card = deps.getState().destinationResearch!.subDestinations[0];
	expect(card.reviews.pros).toEqual(["Great food"]);
	expect(card.reviews.researchedAt).toBeTruthy();
	expect(deps.getState().selectedDestinations[0].reviews).toEqual(card.reviews);
	expect(card.name).toBe("Hanoi");
});

test.each(["https://www.tripadvisor.com/Tourism-Hanoi.html", "https://tripadvisor.evil.com/Hanoi"])(
	"rejects unsupported rating evidence: %s",
	async (sourceUrl) => {
		const deps = setup();
		const sourceId = deps.sources.add({ url: sourceUrl, title: "Hanoi", snippet: "Hanoi travel guide, no rating" });
		const tool = createSaveDestinationReviewsTool(deps);
		await expect(
			tool.execute("1", {
				destination_name: "Hanoi",
				pros: [],
				cons: [],
				reviewSummary: "",
				source_ids: [sourceId],
				providerRatings: [{ provider: "tripadvisor", source_id: sourceId, rating: 4.5, placeName: "Hanoi" }],
			}),
		).rejects.toThrow("Ratings must reference");
		expect(deps.getState().destinationResearch!.subDestinations[0].reviews.researchedAt).toBeUndefined();
	},
);

test("unavailable ratings may be saved explicitly without inventing stars", async () => {
	const deps = setup();
	const tool = createSaveDestinationReviewsTool(deps);
	await tool.execute("1", {
		destination_name: "Hanoi",
		pros: [],
		cons: [],
		reviewSummary: "No review sources could be verified.",
		source_ids: [],
		providerRatings: [],
	});
	expect(deps.getState().destinationResearch!.subDestinations[0].reviews.providerRatings).toEqual([]);
});

test("review searches preserve opaque source URLs and work after the shortlist budget is exhausted", async () => {
	const deps = setup();
	deps.getState().checklist = {
		activePhaseIndex: 0,
		phases: [{ id: "shortlist_destinations", label: "Shortlist", description: "", status: "active" }],
	};
	const urls = ["AbC_dEf-0123456789".repeat(25), "ZyX_wVu-9876543210".repeat(25)].map(
		(token) => `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${token}`,
	);
	let searches = 0;
	const search = createWebSearchTool(
		{
			name: "fixture",
			async search() {
				searches++;
				return urls.map((url) => ({
					url,
					title: "Hanoi reviews",
					snippet: "Travelers enjoy the food but mention traffic.",
				}));
			},
		},
		{ getState: deps.getState, sources: deps.sources },
	);
	await search.execute("1", { query: "Vietnam destinations" });
	await search.execute("2", { query: "Vietnam destinations" });
	const blocked = await search.execute("3", { query: "Vietnam destinations" });
	expect(blocked.details.provider).toBe("fixture:shortlist-budget");
	const result = await search.execute("4", { query: "Hanoi reviews", purpose: "reviews" });
	expect(searches).toBe(3);
	const text = result.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n");
	const sourceIds = [...text.matchAll(/Source ID: (source-[a-f0-9]+)/g)].map((match) => match[1]);
	expect(sourceIds).toHaveLength(2);
	const save = createSaveDestinationReviewsTool(deps);
	const review = {
		destination_name: "Hanoi",
		pros: ["Food"],
		cons: ["Traffic"],
		reviewSummary: "Traveler themes",
		providerRatings: [],
	};
	await expect(save.execute("bad", { ...review, source_ids: ["source-invented"] })).rejects.toThrow(
		"Unknown source ID",
	);
	await save.execute("5", { ...review, source_ids: sourceIds });
	expect(deps.getState().destinationResearch!.subDestinations[0].reviews.sources).toEqual(urls);
	expect(deps.getState().selectedDestinations[0].reviews.pros).toEqual(["Food"]);
	const again = await search.execute("6", { query: "Hanoi reviews", purpose: "reviews" });
	expect(again.content).toEqual(result.content);
});
