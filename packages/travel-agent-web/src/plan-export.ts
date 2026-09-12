import type { TravelState, TravelUiBlock } from "./api.js";

export function formatPlanValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (Array.isArray(value)) return value.map(formatPlanValue).join(", ");
	if (typeof value === "object")
		return Object.entries(value)
			.map(([key, item]) => `${key}: ${formatPlanValue(item)}`)
			.join(" · ");
	return String(value);
}

/** Export server-owned state, never a guessed chat response. */
export function buildPlanText(state: TravelState, blocks: TravelUiBlock[]): string {
	const lines = ["# My travel plan", "", "## Preferences"];
	for (const [key, value] of Object.entries(state.preferences)) lines.push(`- ${key}: ${formatPlanValue(value)}`);
	for (const block of blocks) {
		if (block.kind === "selected_destinations")
			lines.push("", "## Selected places", ...block.data.destinations.map((item) => `- ${item.name}`));
		if (block.kind === "activity_cards")
			lines.push(
				"",
				"## Selected activities",
				...block.data.activities.filter((item) => item.selected).map((item) => `- ${item.name} — ${item.location}`),
			);
		if (block.kind === "itinerary_timeline") {
			lines.push("", "## Itinerary", block.data.description ?? "");
			for (const day of block.data.days)
				lines.push(
					"",
					`### Day ${day.dayNumber}: ${day.place} (${day.date})`,
					...day.activities.map((activity) => `- ${activity}`),
				);
		}
		if (block.kind === "budget_summary") lines.push("", "## Budget", formatPlanValue(block.data.budget));
	}
	lines.push(
		"",
		"---",
		"AI-generated plan and estimates. Verify important details with official sources before booking.",
	);
	return lines.join("\n");
}
