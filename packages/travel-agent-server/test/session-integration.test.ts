import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import { createTravelState, type TravelSession, type TravelState } from "@mariozechner/pi-travel-agent";
import { describe, expect, it } from "vitest";
import { loadConfig, type ServerConfig } from "../src/config.js";
import type { TravelStreamEvent } from "../src/events.js";
import { SessionBusyError, SessionForbiddenError, TravelSessionManager } from "../src/session-manager.js";

const CHECKLIST = [{ id: "gather_preferences", label: "Prefs", description: "" }];

function assistant(text: string): AgentMessage {
	return { role: "assistant", content: [{ type: "text", text }] } as AgentMessage;
}

interface FakeOptions {
	script?: AgentEvent[];
	finalText?: string;
	throwError?: Error;
	/** When set, prompt() waits on this before emitting — lets a test hold a run "in flight". */
	gate?: Promise<void>;
	seed?: (state: TravelState) => void;
}

/** A scripted fake TravelSession: no LLM, no network — drives streamMessage/applyAction deterministically. */
function createFakeSession(
	sessionId: string,
	opts: FakeOptions,
): { session: TravelSession; promptCalls: () => number } {
	let state = createTravelState(sessionId, CHECKLIST);
	opts.seed?.(state);
	let listener: ((event: AgentEvent) => void | Promise<void>) | undefined;
	let calls = 0;
	const agentState = { messages: [] as AgentMessage[], isStreaming: false };

	const agent = {
		state: agentState,
		subscribe(l: (event: AgentEvent) => void | Promise<void>) {
			listener = l;
			return () => {
				listener = undefined;
			};
		},
		async prompt() {
			calls++;
			if (opts.gate) await opts.gate;
			if (opts.throwError) throw opts.throwError;
			for (const event of opts.script ?? []) {
				await listener?.(event);
			}
			agentState.messages = [assistant(opts.finalText ?? "Done.")];
		},
		abort() {},
		async waitForIdle() {},
	};

	const session: TravelSession = {
		agent: agent as unknown as TravelSession["agent"],
		get state() {
			return state;
		},
		setState(next: TravelState) {
			state = next;
		},
		async shutdown() {},
	};
	return { session, promptCalls: () => calls };
}

function makeManager(factory: (sessionId: string, userId: string) => Promise<TravelSession>): {
	manager: TravelSessionManager;
	config: ServerConfig;
} {
	const config = loadConfig({
		TRAVEL_AGENT_DATA_DIR: mkdtempSync(join(tmpdir(), "travel-int-")),
		AUTH_REQUIRED: "false",
	});
	return { manager: new TravelSessionManager(config, undefined, undefined, factory), config };
}

const GENERATE_SCRIPT: AgentEvent[] = [
	{
		type: "tool_execution_start",
		toolCallId: "1",
		toolName: "web_search",
		args: { query: "Greece islands" },
	} as AgentEvent,
	{ type: "tool_execution_end", toolCallId: "1", toolName: "web_search", result: {}, isError: false } as AgentEvent,
	{ type: "message_start", message: assistant("") } as AgentEvent,
	{ type: "message_update", message: assistant("Here are"), assistantMessageEvent: {} } as unknown as AgentEvent,
	{
		type: "message_update",
		message: assistant("Here are some islands"),
		assistantMessageEvent: {},
	} as unknown as AgentEvent,
	{ type: "message_end", message: assistant("Here are some islands") } as AgentEvent,
];

describe("streamMessage (integration, fake session)", () => {
	it("emits normalized events in order and finishes", async () => {
		const { manager } = makeManager(
			async (id) => createFakeSession(id, { script: GENERATE_SCRIPT, finalText: "Here are some islands" }).session,
		);
		const created = await manager.createSession();
		const events: TravelStreamEvent[] = [];
		await manager.streamMessage(created.sessionId, "plan greece", "dev-user", (e) => events.push(e));

		const types = events.map((e) => e.type);
		expect(types).toContain("tool_start");
		expect(types).toContain("tool_end");
		expect(types).toContain("state_snapshot");
		expect(types[types.length - 1]).toBe("run_finished");
		// Text streamed incrementally.
		const deltas = events.filter(
			(e): e is Extract<TravelStreamEvent, { type: "text_delta" }> => e.type === "text_delta",
		);
		expect(deltas.map((d) => d.delta).join("")).toBe("Here are some islands");
		// Narration carried the tool label.
		const toolStart = events.find((e) => e.type === "tool_start");
		expect(toolStart && "label" in toolStart && toolStart.label).toContain("Searching the web");
		// Never hangs: a run_finished terminates the stream.
		expect(events.filter((e) => e.type === "run_finished")).toHaveLength(1);
	});

	it("emits run_error (not a hang) when the prompt throws", async () => {
		const { manager } = makeManager(async (id) => createFakeSession(id, { throwError: new Error("boom") }).session);
		const created = await manager.createSession();
		const events: TravelStreamEvent[] = [];
		await manager.streamMessage(created.sessionId, "plan greece", "dev-user", (e) => events.push(e));
		expect(events.some((e) => e.type === "run_error")).toBe(true);
	});
});

describe("applyAction (integration, fake session)", () => {
	it("mutates state with zero agent runs", async () => {
		let promptCalls = () => 0;
		const { manager } = makeManager(async (id) => {
			const fake = createFakeSession(id, {
				script: GENERATE_SCRIPT,
				finalText: "ok",
				seed: (state) => {
					state.destinationResearch = {
						destination: { name: "Greece" },
						overallSummary: "",
						subDestinations: [{ name: "Naxos", type: "island", description: "" }],
					} as unknown as TravelState["destinationResearch"];
				},
			});
			promptCalls = fake.promptCalls;
			return fake.session;
		});
		const created = await manager.createSession();
		// One generate to establish the active session + seed state into the record.
		await manager.streamMessage(created.sessionId, "plan greece", "dev-user", () => {});
		const callsAfterGenerate = promptCalls();

		const result = await manager.applyAction(created.sessionId, { type: "select_place", name: "Naxos" }, "dev-user");
		expect(result.state.selectedDestinations.map((p) => p.name)).toEqual(["Naxos"]);
		// The instant action ran no additional agent prompt.
		expect(promptCalls()).toBe(callsAfterGenerate);
	});

	it("rejects an instant action while a generate is in flight (409-equivalent)", async () => {
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const { manager } = makeManager(async (id) => createFakeSession(id, { script: GENERATE_SCRIPT, gate }).session);
		const created = await manager.createSession();

		const running = manager.streamMessage(created.sessionId, "plan greece", "dev-user", () => {});
		// While the run is gated (busy), an instant action must be rejected.
		await expect(
			manager.applyAction(created.sessionId, { type: "select_place", name: "Naxos" }, "dev-user"),
		).rejects.toBeInstanceOf(SessionBusyError);
		release();
		await running;
	});
});

describe("session durability (M7 capacity gate)", () => {
	it("rehydrates a persisted session in a fresh manager, preserving owner isolation", async () => {
		const config = loadConfig({
			TRAVEL_AGENT_DATA_DIR: mkdtempSync(join(tmpdir(), "travel-rehydrate-")),
			AUTH_REQUIRED: "false",
		});
		// First process: create + persist a session owned by user-a.
		const created = await new TravelSessionManager(config).createSession("user-a");

		// Simulated restart: a brand-new manager with empty in-memory maps.
		const restarted = new TravelSessionManager(config);
		const loaded = await restarted.getSession(created.sessionId, "user-a");
		expect(loaded.sessionId).toBe(created.sessionId);
		expect(loaded.state.sessionId).toBe(created.sessionId);

		// Ownership survives the restart: another user cannot read it.
		await expect(restarted.getSession(created.sessionId, "user-b")).rejects.toBeInstanceOf(SessionForbiddenError);
	});
});
