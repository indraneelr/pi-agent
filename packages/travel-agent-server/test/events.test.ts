import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";
import { AgentEventMapper, narrateTool } from "../src/events.js";

function assistantMessage(text: string): AgentMessage {
	return { role: "assistant", content: [{ type: "text", text }] } as AgentMessage;
}

describe("narrateTool", () => {
	it("produces friendly copy for known tools", () => {
		expect(narrateTool("web_search")).toBe("Searching the web…");
		expect(narrateTool("get_images")).toBe("Finding photos…");
	});

	it("interpolates a safe query subject", () => {
		expect(narrateTool("web_search", { query: "best beaches in Naxos" })).toBe(
			"Searching the web: best beaches in Naxos",
		);
		expect(narrateTool("get_images", { destination_name: "Kyoto" })).toBe("Finding photos: Kyoto");
	});

	it("falls back gracefully for unknown tools", () => {
		expect(narrateTool("do_something_new")).toBe("Working on do something new…");
	});
});

describe("AgentEventMapper", () => {
	it("maps tool lifecycle to tool_start/tool_end with narration", () => {
		const mapper = new AgentEventMapper();
		const start = mapper.map({
			type: "tool_execution_start",
			toolCallId: "1",
			toolName: "web_search",
			args: { query: "Greece islands" },
		} as AgentEvent);
		expect(start).toEqual([{ type: "tool_start", tool: "web_search", label: "Searching the web: Greece islands" }]);

		const end = mapper.map({
			type: "tool_execution_end",
			toolCallId: "1",
			toolName: "web_search",
			result: {},
			isError: false,
		} as AgentEvent);
		expect(end).toEqual([{ type: "tool_end", tool: "web_search", isError: false }]);
	});

	it("streams only the incremental text on successive message_update events", () => {
		const mapper = new AgentEventMapper();
		mapper.map({ type: "message_start", message: assistantMessage("") } as AgentEvent);

		const first = mapper.map({
			type: "message_update",
			message: assistantMessage("Here are"),
			assistantMessageEvent: {},
		} as unknown as AgentEvent);
		expect(first).toEqual([{ type: "text_delta", delta: "Here are" }]);

		const second = mapper.map({
			type: "message_update",
			message: assistantMessage("Here are some islands"),
			assistantMessageEvent: {},
		} as unknown as AgentEvent);
		expect(second).toEqual([{ type: "text_delta", delta: " some islands" }]);

		// No new text → no event.
		const third = mapper.map({
			type: "message_update",
			message: assistantMessage("Here are some islands"),
			assistantMessageEvent: {},
		} as unknown as AgentEvent);
		expect(third).toEqual([]);
	});

	it("resets the text cursor when a new assistant message starts", () => {
		const mapper = new AgentEventMapper();
		mapper.map({
			type: "message_update",
			message: assistantMessage("first message"),
			assistantMessageEvent: {},
		} as unknown as AgentEvent);
		mapper.map({ type: "message_start", message: assistantMessage("") } as AgentEvent);
		const delta = mapper.map({
			type: "message_update",
			message: assistantMessage("second"),
			assistantMessageEvent: {},
		} as unknown as AgentEvent);
		expect(delta).toEqual([{ type: "text_delta", delta: "second" }]);
	});

	it("ignores events that don't affect the stream", () => {
		const mapper = new AgentEventMapper();
		expect(mapper.map({ type: "agent_start" } as AgentEvent)).toEqual([]);
		expect(mapper.map({ type: "turn_start" } as AgentEvent)).toEqual([]);
	});
});
