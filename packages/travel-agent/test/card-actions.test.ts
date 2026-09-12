import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createTravelState } from "../src/core/state.js";
import { createGetImagesTool } from "../src/core/tools/get-images.js";
import { createSaveDestinationReviewsTool } from "../src/core/tools/save-destination-reviews.js";

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
	await tool.execute("1", { query: "Hanoi", destination_name: "Hanoi" });
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
	const tool = createSaveDestinationReviewsTool({ ...deps, getSourceText: () => "Hanoi rating: 4.5 out of 5" });
	await tool.execute("1", {
		destination_name: "Hanoi",
		pros: ["Great food"],
		cons: ["Traffic"],
		reviewSummary: "Mixed traveler experiences",
		sources: [sourceUrl],
		providerRatings: [{ provider: "tripadvisor", sourceUrl, rating: 4.5, placeName: "Hanoi" }],
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
		const tool = createSaveDestinationReviewsTool({ ...deps, getSourceText: () => "Hanoi travel guide, no rating" });
		await expect(
			tool.execute("1", {
				destination_name: "Hanoi",
				pros: [],
				cons: [],
				reviewSummary: "",
				sources: [sourceUrl],
				providerRatings: [{ provider: "tripadvisor", sourceUrl, rating: 4.5, placeName: "Hanoi" }],
			}),
		).rejects.toThrow("Ratings must reference");
		expect(deps.getState().destinationResearch!.subDestinations[0].reviews.researchedAt).toBeUndefined();
	},
);

test("unavailable ratings may be saved explicitly without inventing stars", async () => {
	const deps = setup();
	const tool = createSaveDestinationReviewsTool({ ...deps, getSourceText: () => undefined });
	await tool.execute("1", {
		destination_name: "Hanoi",
		pros: [],
		cons: [],
		reviewSummary: "No review sources could be verified.",
		sources: [],
		providerRatings: [],
	});
	expect(deps.getState().destinationResearch!.subDestinations[0].reviews.providerRatings).toEqual([]);
});
