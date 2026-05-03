/**
 * Checklist state machine for the travel agent workflow.
 *
 * Phases are loaded from a config file (author-editable, agent-readonly).
 * The agent can advance, go back, and query the checklist but never
 * modify the phase definitions.
 */

import { readFileSync } from "node:fs";
import { MANDATORY_PREFERENCE_FIELDS, type MandatoryPreferences } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/** Phase definition from the config file. */
export interface ChecklistPhaseConfig {
	id: string;
	label: string;
	description: string;
}

/** Runtime phase with status tracking. */
export interface ChecklistPhase extends ChecklistPhaseConfig {
	status: "pending" | "active" | "done" | "invalidated";
}

/** The full checklist state. */
export interface TravelChecklist {
	phases: ChecklistPhase[];
	activePhaseIndex: number;
}

// =============================================================================
// Config Loading
// =============================================================================

/** Load checklist phase definitions from a JSON config file. */
export function loadChecklistConfig(path: string): ChecklistPhaseConfig[] {
	const raw = readFileSync(path, "utf-8");
	const parsed = JSON.parse(raw) as ChecklistPhaseConfig[];
	validateConfig(parsed);
	return parsed;
}

function validateConfig(config: ChecklistPhaseConfig[]): void {
	if (!Array.isArray(config) || config.length === 0) {
		throw new Error("Checklist config must be a non-empty array");
	}
	const ids = new Set<string>();
	for (const phase of config) {
		if (!phase.id || !phase.label || !phase.description) {
			throw new Error(`Invalid phase config: ${JSON.stringify(phase)}`);
		}
		if (ids.has(phase.id)) {
			throw new Error(`Duplicate phase id: ${phase.id}`);
		}
		ids.add(phase.id);
	}
}

// =============================================================================
// Checklist Operations
// =============================================================================

/** Create a new checklist from config, with the first phase active. */
export function createChecklist(config: ChecklistPhaseConfig[]): TravelChecklist {
	const phases: ChecklistPhase[] = config.map((c, i) => ({
		...c,
		status: i === 0 ? "active" : "pending",
	}));
	return { phases, activePhaseIndex: 0 };
}

/** Get the currently active phase, or null if all phases are done. */
export function getActivePhase(checklist: TravelChecklist): ChecklistPhase | null {
	if (checklist.activePhaseIndex < 0 || checklist.activePhaseIndex >= checklist.phases.length) {
		return null;
	}
	return checklist.phases[checklist.activePhaseIndex];
}

/** Check if all phases are complete. */
export function isComplete(checklist: TravelChecklist): boolean {
	return checklist.phases.every((p) => p.status === "done");
}

/**
 * Advance the checklist: mark the current phase as done and activate the next.
 * Returns a new checklist (immutable).
 * Throws if already at the end or current phase is not active.
 */
export function advanceChecklist(checklist: TravelChecklist): TravelChecklist {
	const { activePhaseIndex, phases } = checklist;
	const current = phases[activePhaseIndex];
	if (!current || current.status !== "active") {
		throw new Error("No active phase to advance");
	}
	if (activePhaseIndex >= phases.length - 1) {
		// Last phase — mark done, no next phase
		const updated = phases.map((p, i) => (i === activePhaseIndex ? { ...p, status: "done" as const } : { ...p }));
		return { phases: updated, activePhaseIndex: phases.length };
	}
	const updated = phases.map((p, i) => {
		if (i === activePhaseIndex) return { ...p, status: "done" as const };
		if (i === activePhaseIndex + 1) return { ...p, status: "active" as const };
		return { ...p };
	});
	return { phases: updated, activePhaseIndex: activePhaseIndex + 1 };
}

/**
 * Go back to a previous phase: set target phase as active, mark all
 * downstream phases as "invalidated".
 * Throws if the target phase is not before the current active phase.
 */
export function goBackToPhase(checklist: TravelChecklist, phaseId: string): TravelChecklist {
	const targetIndex = checklist.phases.findIndex((p) => p.id === phaseId);
	if (targetIndex < 0) {
		throw new Error(`Phase not found: ${phaseId}`);
	}
	if (targetIndex >= checklist.activePhaseIndex) {
		throw new Error(
			`Can only go back to a previous phase. Current: ${checklist.activePhaseIndex}, target: ${targetIndex}`,
		);
	}
	const updated = checklist.phases.map((p, i) => {
		if (i < targetIndex) return { ...p };
		if (i === targetIndex) return { ...p, status: "active" as const };
		return { ...p, status: "invalidated" as const };
	});
	return { phases: updated, activePhaseIndex: targetIndex };
}

/**
 * Format the checklist for display (system prompt or TUI).
 * Uses status indicators: [x] done, [>] active, [ ] pending, [!] invalidated.
 */
export function formatChecklist(checklist: TravelChecklist): string {
	const lines = checklist.phases.map((p, i) => {
		const indicator = formatStatusIndicator(p.status);
		return `${indicator} ${i + 1}. ${p.label} — ${p.description}`;
	});
	return lines.join("\n");
}

function formatStatusIndicator(status: ChecklistPhase["status"]): string {
	switch (status) {
		case "done":
			return "[x]";
		case "active":
			return "[>]";
		case "invalidated":
			return "[!]";
		default:
			return "[ ]";
	}
}

/**
 * Get the list of mandatory preference fields that are still missing.
 * Returns field names that are undefined/null or empty.
 */
export function getMandatoryPendingPreferences(prefs: Partial<MandatoryPreferences>): string[] {
	const pending: string[] = [];
	for (const field of MANDATORY_PREFERENCE_FIELDS) {
		const value = prefs[field];
		if (value === undefined || value === null) {
			pending.push(field);
		} else if (typeof value === "string" && value.trim() === "") {
			pending.push(field);
		}
	}
	return pending;
}
