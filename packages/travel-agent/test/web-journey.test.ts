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

test("browser: consent, places, activities, itinerary, export, reload and mobile navigation", async () => {
	const dir = mkdtempSync(join(tmpdir(), "wander-browser-"));
	const config = loadConfig({
		AUTH_REQUIRED: "false",
		TRAVEL_AGENT_DATA_DIR: dir,
		TRAVEL_AGENT_WEB_DIR: resolve("../travel-agent-web/dist"),
	});
	const manager = new TravelSessionManager(config, undefined, undefined, createScriptedSession);
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
		await page.getByRole("button", { name: "Explore activities (1)", exact: true }).click();
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
		await browser.close();
		await app.close();
		rmSync(dir, { recursive: true, force: true });
	}
}, 30_000);
