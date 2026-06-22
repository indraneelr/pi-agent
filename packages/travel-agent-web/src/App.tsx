import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { createTravelSession, getTravelSession, sendTravelMessage, type TravelState, type TravelUiBlock } from "./api.js";
import { getRenderableDestinationImages } from "./render-safety.js";
import { type ChatMessage, type RunStatus, TravelCopilotChat } from "./TravelCopilotChat.js";

export function App() {
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [state, setState] = useState<TravelState | null>(null);
	const [uiBlocks, setUiBlocks] = useState<TravelUiBlock[]>([]);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [draft, setDraft] = useState("");
	const [runStatus, setRunStatus] = useState<RunStatus>("idle");
	const [error, setError] = useState<string | null>(null);
	const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);

	useEffect(() => {
		const existingSessionId = new URLSearchParams(window.location.search).get("session");
		if (existingSessionId) {
			void resumeSession(existingSessionId);
		} else {
			void startSession();
		}
	}, []);

	useEffect(() => {
		if (!sessionId) return;
		saveSessionMessages(sessionId, messages);
	}, [sessionId, messages]);

	const activePhase = useMemo(() => {
		if (!state) return null;
		return state.checklist.phases[state.checklist.activePhaseIndex] ?? null;
	}, [state]);
	const progressMessage = runStatus === "starting"
		? "Creating your travel planning session…"
		: runStatus === "sending"
			? "Message received. The agent is working — gathering requirements, researching options, and updating your plan."
			: null;

	async function startSession() {
		setRunStatus("starting");
		setError(null);
		try {
			const session = await createTravelSession();
			setSession(session.sessionId, session.state, session.uiBlocks);
			setMessages([]);
			saveSessionMessages(session.sessionId, []);
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
			setSession(session.sessionId, session.state, session.uiBlocks);
			setMessages(session.conversation?.length ? session.conversation : loadSessionMessages(session.sessionId));
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setRunStatus("idle");
		}
	}

	function setSession(id: string, nextState: TravelState, nextUiBlocks: TravelUiBlock[] = []) {
		setSessionId(id);
		setState(nextState);
		setUiBlocks(nextUiBlocks);
		const url = new URL(window.location.href);
		url.searchParams.set("session", id);
		window.history.replaceState({}, "", url);
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const message = draft.trim();
		if (!sessionId || !message || runStatus !== "idle") return;

		setDraft("");
		await sendMessageToAgent(message);
	}

	async function sendMessageToAgent(message: string) {
		if (!sessionId || runStatus !== "idle") return;
		setError(null);
		setMessages((current) => [...current, { role: "user", content: message }]);
		setRunStatus("sending");
		try {
			const response = await sendTravelMessage(sessionId, message);
			setLastFailedMessage(null);
			setState(response.state);
			setUiBlocks(response.uiBlocks);
			if (response.conversation?.length) {
				setMessages(response.conversation);
			} else {
				setMessages((current) => [...current, { role: "assistant", content: response.assistantMessage || "Done." }]);
			}
		} catch (e) {
			setLastFailedMessage(message);
			setError(errorMessage(e));
		} finally {
			setRunStatus("idle");
		}
	}

	function handleDestinationAction(action: "select" | "images", destinationName: string, imageQuery?: string) {
		const message = action === "select"
			? `Select ${destinationName} as a place of interest for this trip.`
			: `Fetch and show images for ${destinationName}${imageQuery ? ` using this image query: ${imageQuery}` : ""}.`;
		void sendMessageToAgent(message);
	}

	return (
		<main className="app-shell">
				<TravelCopilotChat
					draft={draft}
					error={error}
					messages={messages}
					onDraftChange={setDraft}
					onNewSession={() => void startSession()}
					onSubmit={handleSubmit}
					progressMessage={progressMessage}
					runStatus={runStatus}
					sessionReady={Boolean(sessionId)}
					onRetry={lastFailedMessage ? () => sendMessageToAgent(lastFailedMessage) : undefined}
				/>

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

				{uiBlocks.length > 0 ? (
					uiBlocks.map((block, index) => <SafeUiBlockView block={block} key={block.id ?? `${block.kind}-${index}`} onDestinationAction={handleDestinationAction} disabled={runStatus !== "idle"} />)
				) : (
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
				)}
			</aside>
		</main>
	);
}

function SafeImage({ src, alt, inline, source }: { src: string; alt: string; inline?: boolean; source?: string }) {
	const [failed, setFailed] = useState(false);
	if (failed) {
		return <span className="image-placeholder" title={`Image unavailable: ${alt}`}>{inline ? "🖼" : "Image unavailable"}</span>;
	}
	return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} title={source ? `Source: ${source}` : undefined} />;
}

function SafeUiBlockView(props: { block: TravelUiBlock; onDestinationAction: (action: "select" | "images", destinationName: string, imageQuery?: string) => void; disabled: boolean }) {
	try {
		return UiBlockView(props);
	} catch (error) {
		console.error("Failed to render UI block", props.block, error);
		return (
			<div className="state-card error-card">
				<p className="eyebrow">UI block unavailable</p>
				<p>One travel state card could not be rendered. The rest of the app is still usable.</p>
			</div>
		);
	}
}

function UiBlockView({ block, onDestinationAction, disabled }: { block: TravelUiBlock; onDestinationAction: (action: "select" | "images", destinationName: string, imageQuery?: string) => void; disabled: boolean }) {
	if (!block?.data) return null;
	switch (block.kind) {
		case "checklist_progress":
			return (
				<div className="state-card">
					<p className="eyebrow">{block.title}</p>
					<ol className="checklist">
						{(block.data.phases ?? []).map((phase) => (
							<li className={phase.status} key={phase.id}>
								<span>{phase.label}</span>
								<small>{phase.status}</small>
							</li>
						))}
					</ol>
				</div>
			);
		case "trip_preferences_summary":
			return (
				<div className="state-card">
					<p className="eyebrow">{block.title}</p>
					<pre>{JSON.stringify(block.data.preferences, null, 2)}</pre>
				</div>
			);
		case "destination_cards":
			return (
				<div className="state-card destination-block">
					<p className="eyebrow">{block.title}</p>
					<h3>{block.data.destinationName}</h3>
					<p>{block.data.overallSummary}</p>
					<div className="destination-cards">
						{(block.data.cards ?? []).map((card) => {
							const renderableImages = getRenderableDestinationImages(card);
							return (
								<article className={card.selected ? "destination-card selected" : "destination-card"} key={card.name}>
									<div className="card-header">
										<h4>{card.name}</h4>
										{card.selected ? <span>Selected</span> : null}
									</div>
									<p>{card.summary}</p>
									{card.whyItFits ? <small>Fit: {card.whyItFits}</small> : null}
									{card.tradeoff ? <small>Trade-off: {card.tradeoff}</small> : null}
									{card.seasonality ? <small>Season: {card.seasonality}</small> : null}
									{renderableImages.length > 0 ? (
										<div className="image-strip">
											{renderableImages.slice(0, 3).map((image) => (
												<SafeImage src={image.finalUrl} alt={image.title ?? card.name} source={image.source ?? image.provider} key={image.finalUrl} />
											))}
										</div>
									) : (
										<span className="image-placeholder">No verified images yet</span>
									)}
									<div className="card-actions">
										<button type="button" onClick={() => onDestinationAction("select", card.name, card.imageQuery)} disabled={disabled || card.selected}>{card.selected ? "Selected" : "Select place"}</button>
										<button type="button" onClick={() => onDestinationAction("images", card.name, card.imageQuery)} disabled={disabled}>See images</button>
									</div>
								</article>
							);
						})}
					</div>
				</div>
			);
		case "selected_destinations":
			return (
				<div className="state-card">
					<p className="eyebrow">{block.title}</p>
					<ul className="compact-list">
						{(block.data.destinations ?? []).map((destination) => (
							<li key={destination.name}>
								<strong>{destination.name}</strong>
								{destination.whyItFits ? <small>{destination.whyItFits}</small> : null}
							</li>
						))}
					</ul>
				</div>
			);
		case "budget_summary":
			return (
				<div className="state-card">
					<p className="eyebrow">{block.title}</p>
					<p>{String(block.data.budget ?? "Not set")}</p>
				</div>
			);
		case "activity_cards":
			return (
				<div className="state-card">
					<p className="eyebrow">{block.title}</p>
					<div className="destination-cards">
						{(block.data.activities ?? []).map((activity) => (
							<article className="destination-card" key={activity.name}>
								<div className="card-header"><h4>{activity.name}</h4><span>{activity.type}</span></div>
								<p>{activity.summary}</p>
								<small>{activity.location}{activity.durationHours ? ` · ${activity.durationHours}h` : ""}{activity.cost ? ` · ${activity.cost}` : ""}</small>
								{activity.tips ? <small>Tip: {activity.tips}</small> : null}
							</article>
						))}
					</div>
				</div>
			);
		case "itinerary_timeline":
			return (
				<div className="state-card">
					<p className="eyebrow">{block.title}</p>
					{block.data.description ? <p>{block.data.description}</p> : null}
					<ol className="timeline-list">
						{(block.data.days ?? []).map((day) => (
							<li key={`${day.dayNumber}-${day.date}`}>
								<strong>Day {day.dayNumber}: {day.place}</strong>
								<small>{day.date} · {day.activityCount} activities</small>
								<p>{(day.activities ?? []).join(" → ")}</p>
							</li>
						))}
					</ol>
				</div>
			);
		case "accommodation_cards":
			return (
				<div className="state-card">
					<p className="eyebrow">{block.title}</p>
					<div className="destination-cards">
						{(block.data.areas ?? []).map((area) => (
							<article className="destination-card" key={`${area.city}-${area.areaToStay}`}>
								<h4>{area.areaToStay}, {area.city}</h4>
								<p>{area.summary}</p>
								<small>{area.highlights}</small>
								{area.transport ? <small>Transport: {area.transport}</small> : null}
							</article>
						))}
					</div>
				</div>
			);
		case "flight_options":
			return (
				<div className="state-card">
					<p className="eyebrow">{block.title}</p>
					<h3>{block.data.route}</h3>
					<p>{block.data.dates} · Typical {block.data.typicalFare}</p>
					<ul className="compact-list">
						{(block.data.options ?? []).map((option) => (
							<li key={option.rank}>
								<strong>#{option.rank} {option.carriers}</strong>
								<small>{option.stops} · {option.fare} · {option.bookingLabel}</small>
							</li>
						))}
					</ul>
				</div>
			);
	}
}

function loadSessionMessages(sessionId: string): ChatMessage[] {
	try {
		const raw = window.localStorage.getItem(chatStorageKey(sessionId));
		if (!raw) return [];
		const parsed = JSON.parse(raw) as ChatMessage[];
		return Array.isArray(parsed) ? parsed.filter((message) => message.role && typeof message.content === "string") : [];
	} catch {
		return [];
	}
}

function saveSessionMessages(sessionId: string, messages: ChatMessage[]) {
	try {
		window.localStorage.setItem(chatStorageKey(sessionId), JSON.stringify(messages));
	} catch {
		// Ignore storage quota/private-mode failures; the live chat still works.
	}
}

function chatStorageKey(sessionId: string) {
	return `pi-travel-agent:chat:${sessionId}`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
