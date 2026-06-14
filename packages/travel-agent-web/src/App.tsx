import { FormEvent, useEffect, useMemo, useState } from "react";
import { createTravelSession, getTravelSession, sendTravelMessage, type TravelState } from "./api.js";

interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

type RunStatus = "idle" | "starting" | "sending";

export function App() {
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [state, setState] = useState<TravelState | null>(null);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [draft, setDraft] = useState("");
	const [runStatus, setRunStatus] = useState<RunStatus>("idle");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const existingSessionId = new URLSearchParams(window.location.search).get("session");
		if (existingSessionId) {
			void resumeSession(existingSessionId);
		} else {
			void startSession();
		}
	}, []);

	const activePhase = useMemo(() => {
		if (!state) return null;
		return state.checklist.phases[state.checklist.activePhaseIndex] ?? null;
	}, [state]);

	async function startSession() {
		setRunStatus("starting");
		setError(null);
		try {
			const session = await createTravelSession();
			setSession(session.sessionId, session.state);
			setMessages([]);
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setRunStatus("idle");
		}
	}

	async function resumeSession(id: string) {
		setRunStatus("starting");
		setError(null);
		try {
			const session = await getTravelSession(id);
			setSession(session.sessionId, session.state);
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setRunStatus("idle");
		}
	}

	function setSession(id: string, nextState: TravelState) {
		setSessionId(id);
		setState(nextState);
		const url = new URL(window.location.href);
		url.searchParams.set("session", id);
		window.history.replaceState({}, "", url);
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const message = draft.trim();
		if (!sessionId || !message || runStatus !== "idle") return;

		setDraft("");
		setError(null);
		setMessages((current) => [...current, { role: "user", content: message }]);
		setRunStatus("sending");
		try {
			const response = await sendTravelMessage(sessionId, message);
			setState(response.state);
			setMessages((current) => [...current, { role: "assistant", content: response.assistantMessage || "Done." }]);
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setRunStatus("idle");
		}
	}

	return (
		<main className="app-shell">
			<section className="chat-column" aria-label="Travel chat">
				<header className="app-header">
					<div>
						<p className="eyebrow">Pi Travel Agent</p>
						<h1>Plan the trip, keep the choices visible.</h1>
					</div>
					<button type="button" className="secondary-button" onClick={() => void startSession()} disabled={runStatus !== "idle"}>
						New session
					</button>
				</header>

				{error ? <div className="error-banner">{error}</div> : null}

				<div className="messages" aria-live="polite">
					{messages.length === 0 ? (
						<div className="empty-state">
							<h2>Where are we going?</h2>
							<p>Start with dates, origin, budget, vibe, or a rough destination. I’ll keep the planning state visible on the right.</p>
						</div>
					) : (
						messages.map((message, index) => (
							<article className={`message ${message.role}`} key={`${message.role}-${index}`}>
								<strong>{message.role === "user" ? "You" : "Travel agent"}</strong>
								<p>{message.content}</p>
							</article>
						))
					)}
				</div>

				<form className="composer" onSubmit={handleSubmit}>
					<input
						aria-label="Travel request"
						placeholder="Plan 5 days in Japan from Jakarta, mid-range budget..."
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						disabled={!sessionId || runStatus !== "idle"}
					/>
					<button type="submit" disabled={!sessionId || !draft.trim() || runStatus !== "idle"}>
						{runStatus === "sending" ? "Sending…" : "Send"}
					</button>
				</form>
			</section>

			<aside className="sidebar" aria-label="Travel state">
				<div className="session-card">
					<p className="eyebrow">Session</p>
					<code>{sessionId ?? (runStatus === "starting" ? "Creating…" : "Not started")}</code>
				</div>

				<div className="state-card">
					<p className="eyebrow">Current phase</p>
					<h2>{activePhase?.label ?? "Loading"}</h2>
					<p>{activePhase?.description ?? "Creating your planning session."}</p>
				</div>

				<div className="state-card">
					<p className="eyebrow">Checklist</p>
					<ol className="checklist">
						{state?.checklist.phases.map((phase) => (
							<li className={phase.status} key={phase.id}>
								<span>{phase.label}</span>
								<small>{phase.status}</small>
							</li>
						)) ?? <li>Loading checklist…</li>}
					</ol>
				</div>

				<div className="state-card">
					<p className="eyebrow">Preferences</p>
					<pre>{JSON.stringify(state?.preferences ?? {}, null, 2)}</pre>
				</div>
			</aside>
		</main>
	);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
