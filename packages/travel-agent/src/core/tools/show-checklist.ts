/**
 * show_checklist tool — Read-only view of current checklist progress.
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { formatChecklist, type TravelChecklist } from "../checklist.js";

const showChecklistSchema = Type.Object({});

export interface ShowChecklistDetails {
	activePhase: string | null;
	completedCount: number;
	totalCount: number;
}

export function createShowChecklistTool(
	getChecklist: () => TravelChecklist,
): AgentTool<typeof showChecklistSchema, ShowChecklistDetails> {
	return {
		name: "show_checklist",
		label: "Show Checklist",
		description: "Show the current travel planning checklist with progress status for each phase.",
		parameters: showChecklistSchema,
		async execute(): Promise<AgentToolResult<ShowChecklistDetails>> {
			const checklist = getChecklist();
			const formatted = formatChecklist(checklist);
			const activePhase = checklist.phases[checklist.activePhaseIndex]?.id ?? null;
			const completedCount = checklist.phases.filter((p) => p.status === "done").length;

			return {
				content: [{ type: "text", text: formatted }],
				details: {
					activePhase,
					completedCount,
					totalCount: checklist.phases.length,
				},
			};
		},
	};
}
