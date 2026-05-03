/**
 * End-to-end test for createAnalyticsSession.
 *
 * Uses the faux provider from pi-ai to simulate LLM responses,
 * verifying the full agent loop: prompt → tool calls → tool results → response.
 */

import { fauxAssistantMessage, fauxText, fauxToolCall, registerFauxProvider } from "@mariozechner/pi-ai";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { type AnalyticsSession, createAnalyticsSession } from "../src/core/sdk.js";

const TEST_DIR = join(tmpdir(), `analytics-e2e-test-${Date.now()}`);
const VENV_PYTHON = join(import.meta.dirname, "..", ".venv", "bin", "python3");
const TEST_TIMEOUT = 30_000;

describe("Analytics Session E2E", () => {
	let session: AnalyticsSession | null = null;

	afterEach(async () => {
		if (session) {
			await session.shutdown();
			session = null;
		}
	});

	it("should execute a full load → describe → query workflow", { timeout: TEST_TIMEOUT }, async () => {
		mkdirSync(TEST_DIR, { recursive: true });

		// Create test data
		const csvPath = join(TEST_DIR, "revenue.csv");
		writeFileSync(
			csvPath,
			[
				"month,product,revenue",
				"Jan,Widget,1000",
				"Jan,Gadget,800",
				"Feb,Widget,1200",
				"Feb,Gadget,900",
				"Mar,Widget,1500",
				"Mar,Gadget,1100",
			].join("\n"),
		);

		// Register faux LLM provider
		const faux = registerFauxProvider();
		const model = faux.getModel();

		// Script the LLM responses:
		// 1. First response: call load_data
		faux.setResponses([
			fauxAssistantMessage([fauxToolCall("load_data", { path: csvPath, name: "revenue" })], {
				stopReason: "toolUse",
			}),
		]);

		session = await createAnalyticsSession({
			model,
			thinkingLevel: "off",
			pythonOptions: { pythonPath: VENV_PYTHON },
			cwd: TEST_DIR,
		});

		// Collect events
		const events: string[] = [];
		session.agent.subscribe((event) => {
			events.push(event.type);
		});

		// After tool result, LLM calls describe_data
		faux.appendResponses([
			fauxAssistantMessage([fauxToolCall("describe_data", { name: "revenue" })], { stopReason: "toolUse" }),
		]);

		// After describe result, LLM calls query_data
		faux.appendResponses([
			fauxAssistantMessage([fauxToolCall("query_data", { code: "revenue.groupby('product')['revenue'].sum()" })], {
				stopReason: "toolUse",
			}),
		]);

		// Final text response
		faux.appendResponses([
			fauxAssistantMessage([fauxText("Analysis complete. Widget total: 3700, Gadget total: 2800.")]),
		]);

		// Run the agent
		await session.agent.prompt("Analyze revenue.csv and tell me total revenue by product");

		// Verify event sequence includes tool executions
		expect(events).toContain("agent_start");
		expect(events).toContain("tool_execution_start");
		expect(events).toContain("tool_execution_end");
		expect(events).toContain("agent_end");

		// Verify the agent processed all 4 turns (load → describe → query → text)
		const turnStarts = events.filter((e) => e === "turn_start");
		expect(turnStarts.length).toBe(4);

		// Verify final message contains the analysis
		const messages = session.agent.state.messages;
		const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
		expect(lastAssistant).toBeDefined();
		if (lastAssistant && "content" in lastAssistant) {
			const textContent = (lastAssistant.content as Array<{ type: string; text?: string }>).find(
				(c) => c.type === "text",
			);
			expect(textContent?.text).toContain("3700");
			expect(textContent?.text).toContain("2800");
		}

		faux.unregister();

		try {
			rmSync(TEST_DIR, { recursive: true, force: true });
		} catch {}
	});
});
