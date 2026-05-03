/**
 * Session persistence for travel state.
 *
 * Saves and loads travel state to/from JSON files keyed by session-id.
 * Storage path: {dataDir}/{sessionId}.json
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TravelState } from "./state.js";

export interface PersistenceOptions {
	/** Base directory for session state files. */
	dataDir: string;
}

/** Save travel state to disk. Creates dataDir if it doesn't exist. */
export function saveTravelState(state: TravelState, options: PersistenceOptions): void {
	mkdirSync(options.dataDir, { recursive: true });
	const filePath = sessionFilePath(state.sessionId, options);
	writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}

/** Load travel state from disk. Returns null if no saved state exists. */
export function loadTravelState(sessionId: string, options: PersistenceOptions): TravelState | null {
	const filePath = sessionFilePath(sessionId, options);
	if (!existsSync(filePath)) return null;
	const raw = readFileSync(filePath, "utf-8");
	return JSON.parse(raw) as TravelState;
}

/** Delete a saved travel state from disk. */
export function deleteTravelState(sessionId: string, options: PersistenceOptions): void {
	const filePath = sessionFilePath(sessionId, options);
	if (existsSync(filePath)) {
		rmSync(filePath);
	}
}

function sessionFilePath(sessionId: string, options: PersistenceOptions): string {
	const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
	return join(options.dataDir, `${safeId}.json`);
}
