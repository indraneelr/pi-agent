/**
 * Generic timeout-failover runner.
 *
 * Runs an ordered list of candidates, racing each against a per-call timeout.
 * On timeout OR error it aborts the in-flight attempt and drops to the next
 * candidate — the mechanism behind per-capability provider failover (ADR 0002).
 * A manual switch cannot rescue an in-flight request, and only a timeout (not an
 * error) catches a provider that has gone slow rather than down.
 */

/** Reason a candidate was abandoned. */
export type FailoverReason = "timeout" | "error";

/** Emitted whenever the runner drops from one candidate to the next. */
export interface FailoverEvent {
	/** Name of the candidate that was abandoned. */
	from: string;
	/** Name of the candidate being tried next, or null if none remain. */
	to: string | null;
	/** Why `from` was abandoned. */
	reason: FailoverReason;
	/** Milliseconds spent on `from` before abandoning it. */
	ms: number;
	/** The underlying error when reason is "error". */
	error?: unknown;
}

export interface FailoverCandidate<T> {
	/** Provider name, for logging. */
	name: string;
	/** Perform the work; must honor `signal` so timeouts actually cancel. */
	run(signal: AbortSignal): Promise<T>;
}

export interface FailoverOptions {
	/** Per-candidate timeout. When unset or <= 0, candidates run without a timeout. */
	timeoutMs?: number;
	/** Caller's abort signal; aborting rejects the whole run. */
	signal?: AbortSignal;
	/** Called each time the runner drops to the next candidate. */
	onFailover?: (event: FailoverEvent) => void;
}

/** Error thrown when every candidate has failed. */
export class AllProvidersFailedError extends Error {
	constructor(
		message: string,
		public readonly errors: Array<{ name: string; reason: FailoverReason; error?: unknown }>,
	) {
		super(message);
		this.name = "AllProvidersFailedError";
	}
}

class TimeoutSentinel {}

/**
 * Try each candidate in order, returning the first success.
 *
 * Each attempt gets its own AbortController so a timeout cancels the in-flight
 * work; the caller's signal, if provided, aborts the active attempt and rejects.
 */
export async function runWithFailover<T>(candidates: FailoverCandidate<T>[], opts: FailoverOptions = {}): Promise<T> {
	if (candidates.length === 0) {
		throw new AllProvidersFailedError("runWithFailover called with no candidates", []);
	}
	if (opts.signal?.aborted) {
		throw new DOMException("Aborted", "AbortError");
	}

	const failures: Array<{ name: string; reason: FailoverReason; error?: unknown }> = [];

	for (let i = 0; i < candidates.length; i++) {
		const candidate = candidates[i];
		const next = candidates[i + 1] ?? null;
		const controller = new AbortController();
		const onCallerAbort = () => controller.abort();
		opts.signal?.addEventListener("abort", onCallerAbort, { once: true });

		const startedAt = Date.now();
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const attempt = candidate.run(controller.signal);
			const timeoutMs = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : undefined;
			const raced: Promise<T | TimeoutSentinel> = timeoutMs
				? Promise.race([
						attempt,
						new Promise<TimeoutSentinel>((resolve) => {
							timer = setTimeout(() => resolve(new TimeoutSentinel()), timeoutMs);
						}),
					])
				: attempt;

			const result = await raced;
			if (result instanceof TimeoutSentinel) {
				controller.abort();
				// The abandoned attempt may reject later (from the abort) — swallow it
				// so it doesn't surface as an unhandled rejection.
				void attempt.catch(() => {});
				const event: FailoverEvent = {
					from: candidate.name,
					to: next?.name ?? null,
					reason: "timeout",
					ms: Date.now() - startedAt,
				};
				failures.push({ name: candidate.name, reason: "timeout" });
				opts.onFailover?.(event);
				if (!next) break;
				continue;
			}
			return result as T;
		} catch (error) {
			// A caller-initiated abort is terminal — do not fall through to the next provider.
			if (opts.signal?.aborted) throw error;
			const event: FailoverEvent = {
				from: candidate.name,
				to: next?.name ?? null,
				reason: "error",
				ms: Date.now() - startedAt,
				error,
			};
			failures.push({ name: candidate.name, reason: "error", error });
			opts.onFailover?.(event);
			if (!next) break;
		} finally {
			if (timer) clearTimeout(timer);
			opts.signal?.removeEventListener("abort", onCallerAbort);
		}
	}

	const summary = failures.map((f) => `${f.name}:${f.reason}`).join(", ");
	throw new AllProvidersFailedError(`All providers failed (${summary})`, failures);
}
