/**
 * Normalized travel stream events (ADR 0003).
 *
 * Maps the agent harness's low-level `AgentEvent` stream into a small, stable
 * set of events the web client renders as live progress: tool narration,
 * streaming assistant text, and state snapshots. Transport is plain SSE — no
 * AG-UI / CopilotKit.
 */

import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import type { TravelState } from "@mariozechner/pi-travel-agent";
import { composeTravelUiBlocks, type TravelUiBlock } from "./ui-blocks.js";

export type TravelStreamEvent =
	| { type: "tool_start"; tool: string; label: string }
	| { type: "tool_end"; tool: string; isError: boolean }
	| { type: "text_delta"; delta: string }
	| { type: "state_snapshot"; state: TravelState; uiBlocks: TravelUiBlock[] }
	| { type: "run_error"; message: string }
	| { type: "run_finished"; assistantMessage: string };

/** Plain-language narration for each tool, shown live during the tool-heavy middle. */
const TOOL_NARRATION: Record<string, string> = {
	web_search: "Searching the web",
	get_images: "Finding photos",
	save_destination_shortlist: "Putting together your shortlist",
	update_state: "Updating your plan",
	advance_checklist: "Moving to the next step",
	go_back: "Revisiting an earlier step",
	show_checklist: "Checking your progress",
	verify_data: "Double-checking the details",
};

/**
 * Human-readable progress line for a tool call. Interpolates a safe query/subject
 * argument when present (e.g. "Searching the web: best beaches in Naxos").
 */
export function narrateTool(toolName: string, args?: unknown): string {
	const base = TOOL_NARRATION[toolName] ?? `Working on ${toolName.replace(/_/g, " ")}`;
	const subject = extractNarrationSubject(args);
	return subject ? `${base}: ${subject}` : `${base}…`;
}

function extractNarrationSubject(args: unknown): string | undefined {
	if (!args || typeof args !== "object") return undefined;
	const record = args as Record<string, unknown>;
	for (const key of ["query", "destination_name", "place", "name"]) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value.trim().slice(0, 80);
	}
	return undefined;
}

/** Build a state-snapshot event from the current travel state. */
export function stateSnapshotEvent(state: TravelState): Extract<TravelStreamEvent, { type: "state_snapshot" }> {
	return { type: "state_snapshot", state, uiBlocks: composeTravelUiBlocks(state) };
}

/**
 * Stateful translator from `AgentEvent` to `TravelStreamEvent`s.
 *
 * Holds per-message text-accumulation state so `message_update` events yield
 * incremental `text_delta`s rather than re-sending the whole message each time.
 * One mapper instance per run.
 */
export class AgentEventMapper {
	private sentTextLen = 0;

	map(event: AgentEvent): TravelStreamEvent[] {
		switch (event.type) {
			case "message_start":
				// A new assistant message begins — reset the text cursor so this
				// message's text streams from the start.
				this.sentTextLen = 0;
				return [];
			case "message_update": {
				const full = assistantText(event.message);
				if (full.length <= this.sentTextLen) return [];
				const delta = full.slice(this.sentTextLen);
				this.sentTextLen = full.length;
				return [{ type: "text_delta", delta }];
			}
			case "tool_execution_start":
				return [{ type: "tool_start", tool: event.toolName, label: narrateTool(event.toolName, event.args) }];
			case "tool_execution_end":
				return [{ type: "tool_end", tool: event.toolName, isError: event.isError }];
			default:
				return [];
		}
	}
}

/** Join the text content parts of a single assistant message. */
function assistantText(message: AgentMessage): string {
	if (message.role !== "assistant") return "";
	return message.content
		.filter((part): part is TextContent => part.type === "text")
		.map((part) => part.text)
		.join("");
}
