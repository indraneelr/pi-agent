/**
 * Failover web-search provider.
 *
 * Wraps an ordered list of SearchProvider into one that races each against a
 * per-call timeout and drops to the next on timeout/error (ADR 0002).
 */

import { type FailoverEvent, runWithFailover } from "../failover.js";
import type { SearchProvider } from "./types.js";

export interface FailoverSearchOptions {
	/** Per-provider timeout in ms. Unset/<=0 disables the timeout. */
	timeoutMs?: number;
	/** Called whenever search drops from one provider to the next. */
	onFailover?: (event: FailoverEvent) => void;
}

/**
 * Compose providers `[primary, ...fallbacks]` into a single failover provider.
 * The composite reports the underlying provider order in its `name`.
 */
export function createFailoverSearchProvider(
	providers: SearchProvider[],
	opts: FailoverSearchOptions = {},
): SearchProvider {
	if (providers.length === 0) {
		throw new Error("createFailoverSearchProvider requires at least one provider");
	}
	if (providers.length === 1) return providers[0];

	return {
		name: `failover(${providers.map((p) => p.name).join(">")})`,
		search(query, numResults, signal) {
			return runWithFailover(
				providers.map((provider) => ({
					name: provider.name,
					run: (s: AbortSignal) => provider.search(query, numResults, s),
				})),
				{ timeoutMs: opts.timeoutMs, signal, onFailover: opts.onFailover },
			);
		},
	};
}
