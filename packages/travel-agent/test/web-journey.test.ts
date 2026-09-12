import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as ai from "@earendil-works/pi-ai";
import { chromium } from "playwright";
import { expect, test, vi } from "vitest";
import { loadConfig } from "../../travel-agent-server/src/config.js";
import { createServer } from "../../travel-agent-server/src/server.js";
import { TravelSessionManager } from "../../travel-agent-server/src/session-manager.js";
import { createScriptedSession } from "../../travel-agent-server/test/scripted-session.js";
import { SearchSources } from "../src/core/search/sources.js";
import { createSaveDestinationReviewsTool } from "../src/core/tools/save-destination-reviews.js";

test("browser: consent, places, activities, itinerary, export, reload and mobile navigation", async () => {
	const dir = mkdtempSync(join(tmpdir(), "wander-browser-"));
	const config = loadConfig({
		AUTH_REQUIRED: "false",
		TRAVEL_AGENT_DATA_DIR: dir,
		TRAVEL_AGENT_WEB_DIR: resolve("../travel-agent-web/dist"),
	});
	let activityAttempts = 0;
	const manager = new TravelSessionManager(config, undefined, undefined, async (id) => {
		const session = await createScriptedSession(id);
		const prompt = session.agent.prompt.bind(session.agent);
		session.agent.prompt = async (input) => {
			if (input.startsWith("[Planner action: reviews]")) {
				const sourceUrl = "https://www.tripadvisor.com/Tourism-Kyoto.html";
				const sources = new SearchSources();
				const sourceId = sources.add({ url: sourceUrl, title: "Kyoto", snippet: "Kyoto rating: 4.5 out of 5" });
				await createSaveDestinationReviewsTool({
					getState: () => session.state,
					setState: session.setState,
					persistOpts: { dataDir: dir },
					sources,
				}).execute("review", {
					destination_name: "Kyoto",
					pros: ["Beautiful gardens and food"],
					cons: ["Crowded temples"],
					reviewSummary: "Sourced review summary for the card",
					source_ids: [sourceId],
					providerRatings: [{ provider: "tripadvisor", rating: 4.5, source_id: sourceId, placeName: "Kyoto" }],
				});
				return;
			}
			if (input.startsWith("[Planner action: activities]")) {
				activityAttempts++;
				await new Promise((resolve) => setTimeout(resolve, 300));
				if (activityAttempts <= 2) return;
			}
			await prompt(input);
		};
		return session;
	});
	vi.stubEnv("USE_STAGEHAND", "0");
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
		const url = String(input);
		if (new URL(url).pathname === "/search")
			return new Response(
				JSON.stringify({
					results: Array.from({ length: 16 }, (_, i) => ({
						img_src: `https://photos.example/${i}.png`,
						width: 1280,
						height: 720,
						url: "https://photos.example/source",
					})),
				}),
				{ headers: { "content-type": "application/json" } },
			);
		if (url.startsWith("https://photos.example/")) {
			const response = new Response(null, { headers: { "content-type": "image/png" } });
			Object.defineProperty(response, "url", { value: url });
			return response;
		}
		throw new Error(`Offline test blocked unexpected request: ${new URL(url).hostname}`);
	});
	const app = createServer(config, manager);
	app.log.level = "silent";
	const probe = vi.spyOn(ai, "completeSimple").mockResolvedValue({ stopReason: "error" } as ai.AssistantMessage);
	const browser = await chromium.launch({
		headless: true,
		executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
	});
	const artifacts = process.env.TRAVEL_TEST_ARTIFACTS ?? dir;
	mkdirSync(artifacts, { recursive: true });
	try {
		const address = await app.listen({ host: "127.0.0.1", port: 0 });
		const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
		await page.route("https://**/*", (route) =>
			route.fulfill({
				contentType: "image/png",
				body: Buffer.from(
					"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lH0AAAAASUVORK5CYII=",
					"base64",
				),
			}),
		);
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto(address);
		await page.getByRole("button", { name: "Terms & Privacy", exact: true }).click();
		await page.getByRole("dialog", { name: "Terms and Privacy" }).waitFor();
		await page.getByRole("button", { name: "Close", exact: true }).click();
		await page.getByRole("button", { name: "I understand — continue" }).click();
		await page.getByLabel("API key", { exact: true }).fill("invalid-fixture-key");
		await page.getByRole("button", { name: "Save and check key" }).click();
		await page.getByRole("alert").filter({ hasText: "test request" }).waitFor();
		probe.mockResolvedValue({ stopReason: "stop" } as ai.AssistantMessage);
		await page.getByLabel("API key", { exact: true }).fill("valid-fixture-key");
		await page.getByRole("button", { name: "Save and check key" }).click();
		const input = page.getByRole("textbox", { name: "Travel request" });
		await input.fill("Plan five days in Japan from Jakarta for two, USD 2000.");
		await page.getByRole("button", { name: "Send", exact: true }).click();
		await page.getByRole("button", { name: "Select place", exact: true }).first().click();
		const card = page.getByRole("article", { name: "Kyoto", exact: true });
		await card.getByRole("button", { name: "See images", exact: true }).click();
		await card.getByText("1 / 8", { exact: true }).waitFor();
		await card.getByRole("button", { name: "See more images", exact: true }).click();
		await card.getByText("1 / 16", { exact: true }).waitFor();
		await card.getByRole("button", { name: "Next photo of Kyoto" }).click();
		await card.getByText("2 / 16", { exact: true }).waitFor();
		await card.getByRole("button", { name: "Reviews", exact: false }).click();
		await card.getByText("Beautiful gardens and food").waitFor();
		await card.getByText("Crowded temples").waitFor();
		await card.getByLabel("4.5 out of 5 stars").waitFor();
		expect(await card.getByText("Rating unavailable — not verified").count()).toBe(1);
		expect(await page.locator(".messages").getByText("Sourced review summary for the card").count()).toBe(0);
		await page.screenshot({ path: join(artifacts, "destination-details.png"), fullPage: true });
		await card.getByRole("button", { name: "Reviews", exact: false }).first().click();
		expect(await card.getByRole("region", { name: "Kyoto reviews" }).count()).toBe(0);
		await page.locator(".sidebar").evaluate((element) => {
			element.scrollTop = element.scrollHeight;
		});
		const exploreBounds = await page
			.getByRole("button", { name: "Explore activities (1)", exact: true })
			.boundingBox();
		const paneBounds = await page.locator(".sidebar").boundingBox();
		expect(exploreBounds!.y).toBeGreaterThanOrEqual(paneBounds!.y);
		expect(exploreBounds!.y + exploreBounds!.height).toBeLessThan(paneBounds!.y + paneBounds!.height);
		await page.getByRole("button", { name: "Explore activities (1)", exact: true }).click();
		await page.getByText("Researching activities for your selected places…", { exact: true }).first().waitFor();
		await page.getByRole("button", { name: "Retry activity research", exact: true }).waitFor();
		expect(await page.locator(".activity-progress").textContent()).toContain("Nothing is running in the background");
		await page.screenshot({ path: join(artifacts, "activity-retry.png"), fullPage: true });
		await page.getByRole("button", { name: "Retry activity research", exact: true }).click();
		await page.getByRole("button", { name: "Select activity", exact: true }).first().click();
		await page.getByRole("button", { name: "Build itinerary (1)", exact: true }).click();
		await page.getByText("Your itinerary is ready.", { exact: false }).waitFor();
		expect(await page.getByText("Riverside dinner", { exact: false }).count()).toBeGreaterThan(0);
		const downloadPromise = page.waitForEvent("download");
		await page.getByRole("button", { name: "Download plan" }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/travel-plan-.*\.md/);
		const artifact = await download.createReadStream();
		let exported = "";
		for await (const chunk of artifact!) exported += chunk;
		expect(exported).toContain("Day 1: Kyoto");
		expect(exported).toContain("Riverside dinner");
		await page.reload();
		await page.getByText("Your Kyoto itinerary", { exact: true }).waitFor();
		await page.screenshot({ path: join(artifacts, "desktop.png"), fullPage: true });
		await page.setViewportSize({ width: 390, height: 844 });
		await page.getByRole("button", { name: "My plan", exact: true }).click();
		await page.getByText("Your Kyoto itinerary", { exact: true }).waitFor({ state: "visible" });
		expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
		await page.screenshot({ path: join(artifacts, "mobile-plan.png"), fullPage: true });
		await page.getByRole("button", { name: "Chat", exact: true }).click();
		await input.fill("slow adjustment");
		await page.getByRole("button", { name: "Send", exact: true }).click();
		await page.getByRole("button", { name: "Stop", exact: true }).click();
		await page.getByRole("button", { name: "Send", exact: true }).waitFor();
		await page.screenshot({ path: join(artifacts, "mobile-chat.png"), fullPage: true });
		expect(errors).toEqual([]);
	} finally {
		probe.mockRestore();
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		await browser.close();
		await app.close();
		rmSync(dir, { recursive: true, force: true });
	}
}, 30_000);
