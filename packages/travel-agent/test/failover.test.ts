import { describe, expect, it, vi } from "vitest";
import { AllProvidersFailedError, type FailoverEvent, runWithFailover } from "../src/core/failover.js";
import { createFailoverSearchProvider } from "../src/core/search/failover.js";
import type { SearchProvider, SearchResult } from "../src/core/search/types.js";

function stubProvider(name: string, impl: SearchProvider["search"]): SearchProvider {
	return { name, search: impl };
}

const result = (title: string): SearchResult[] => [{ title, url: `https://x/${title}`, snippet: "" }];

describe("runWithFailover", () => {
	it("returns the primary's result when it succeeds in time", async () => {
		const onFailover = vi.fn();
		const value = await runWithFailover(
			[
				{ name: "primary", run: async () => "P" },
				{ name: "fallback", run: async () => "F" },
			],
			{ timeoutMs: 100, onFailover },
		);
		expect(value).toBe("P");
		expect(onFailover).not.toHaveBeenCalled();
	});

	it("fails over to the next provider on ERROR", async () => {
		const events: FailoverEvent[] = [];
		const value = await runWithFailover(
			[
				{
					name: "primary",
					run: async () => {
						throw new Error("boom");
					},
				},
				{ name: "fallback", run: async () => "F" },
			],
			{ timeoutMs: 100, onFailover: (e) => events.push(e) },
		);
		expect(value).toBe("F");
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ from: "primary", to: "fallback", reason: "error" });
	});

	it("fails over on TIMEOUT (slowness, not error) and aborts the slow attempt", async () => {
		const events: FailoverEvent[] = [];
		let aborted = false;
		const value = await runWithFailover(
			[
				{
					name: "slow",
					run: (signal) =>
						new Promise((_resolve, reject) => {
							signal.addEventListener("abort", () => {
								aborted = true;
								reject(new Error("aborted"));
							});
							// never resolves on its own
						}),
				},
				{ name: "fast", run: async () => "F" },
			],
			{ timeoutMs: 20, onFailover: (e) => events.push(e) },
		);
		expect(value).toBe("F");
		expect(aborted).toBe(true);
		expect(events[0]).toMatchObject({ from: "slow", to: "fast", reason: "timeout" });
	});

	it("throws AllProvidersFailedError when every provider fails", async () => {
		await expect(
			runWithFailover(
				[
					{
						name: "a",
						run: async () => {
							throw new Error("a-fail");
						},
					},
					{
						name: "b",
						run: async () => {
							throw new Error("b-fail");
						},
					},
				],
				{ timeoutMs: 50 },
			),
		).rejects.toBeInstanceOf(AllProvidersFailedError);
	});

	it("does not fall through when the caller aborts", async () => {
		const controller = new AbortController();
		const run = runWithFailover(
			[
				{
					name: "primary",
					run: (signal) =>
						new Promise((_r, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
				},
				{ name: "fallback", run: async () => "F" },
			],
			{ signal: controller.signal },
		);
		controller.abort();
		await expect(run).rejects.toThrow();
	});
});

describe("createFailoverSearchProvider", () => {
	it("returns the single provider unchanged when only one is given", () => {
		const p = stubProvider("only", async () => result("x"));
		expect(createFailoverSearchProvider([p])).toBe(p);
	});

	it("uses the fallback provider's results when the primary times out", async () => {
		const onFailover = vi.fn();
		const primary = stubProvider(
			"gemini",
			(_q, _n, signal) =>
				new Promise<SearchResult[]>((_r, reject) =>
					signal?.addEventListener("abort", () => reject(new Error("aborted"))),
				),
		);
		const fallback = stubProvider("stagehand", async () => result("from-fallback"));
		const provider = createFailoverSearchProvider([primary, fallback], { timeoutMs: 20, onFailover });

		const results = await provider.search("greece beaches", 5);
		expect(results[0].title).toBe("from-fallback");
		expect(onFailover).toHaveBeenCalledOnce();
		expect(provider.name).toContain("failover(gemini>stagehand)");
	});
});
