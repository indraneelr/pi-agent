import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { createTravelSession, getTravelSession, sendTravelMessage, type ChecklistPhase, type DestinationCardsBlock, type TravelState, type TravelUiBlock } from "./api.js";
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
	const [selectedDestinationNames, setSelectedDestinationNames] = useState<Set<string>>(new Set());

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

	useEffect(() => {
		const selectedNames = new Set<string>();
		for (const block of uiBlocks) {
			if (block.kind !== "destination_cards") continue;
			for (const card of block.data.cards ?? []) {
				if (card.selected) selectedNames.add(card.name);
			}
		}
		setSelectedDestinationNames(selectedNames);
	}, [uiBlocks]);

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
		if (action === "select") {
			setSelectedDestinationNames((current) => {
				const next = new Set(current);
				if (next.has(destinationName)) {
					next.delete(destinationName);
				} else {
					next.add(destinationName);
				}
				return next;
			});
			return;
		}

		const message = `Fetch and show images for ${destinationName}${imageQuery ? ` using this image query: ${imageQuery}` : ""}.`;
		void sendMessageToAgent(message);
	}

	function handleDestinationSelectionDone() {
		if (selectedDestinationNames.size === 0) return;
		const selectedNames = Array.from(selectedDestinationNames);
		void sendMessageToAgent(`Use these selected places for this trip: ${selectedNames.join(", ")}.`);
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
					uiBlocks.map((block, index) => (
						<SafeUiBlockView
							block={block}
							disabled={runStatus !== "idle"}
							key={block.id ?? `${block.kind}-${index}`}
							onDestinationAction={handleDestinationAction}
							onDestinationSelectionDone={handleDestinationSelectionDone}
							selectedDestinationNames={selectedDestinationNames}
						/>
					))
				) : state ? (
					<ChecklistBreadcrumb activePhaseIndex={state.checklist.activePhaseIndex} phases={state.checklist.phases} />
				) : (
					<div className="state-card">Loading checklist…</div>
				)}
			</aside>
		</main>
	);
}

function SafeImage({ src, alt, inline }: { src: string; alt: string; inline?: boolean }) {
	const [failed, setFailed] = useState(false);
	if (failed) {
		return <span className="image-placeholder" title={`Image unavailable: ${alt}`}>{inline ? "Image" : "Image unavailable"}</span>;
	}
	return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

function SafeUiBlockView(props: {
	block: TravelUiBlock;
	onDestinationAction: (action: "select" | "images", destinationName: string, imageQuery?: string) => void;
	onDestinationSelectionDone: () => void;
	disabled: boolean;
	selectedDestinationNames: Set<string>;
}) {
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

function UiBlockView({
	block,
	onDestinationAction,
	onDestinationSelectionDone,
	disabled,
	selectedDestinationNames,
}: {
	block: TravelUiBlock;
	onDestinationAction: (action: "select" | "images", destinationName: string, imageQuery?: string) => void;
	onDestinationSelectionDone: () => void;
	disabled: boolean;
	selectedDestinationNames: Set<string>;
}) {
	if (!block?.data) return null;
	switch (block.kind) {
		case "checklist_progress":
			return <ChecklistBreadcrumb activePhaseIndex={block.data.activePhaseIndex} phases={block.data.phases ?? []} />;
		case "trip_preferences_summary":
			return <TripPreferencesSummary preferences={block.data.preferences} title={block.title} />;
		case "destination_cards":
			return (
				<DestinationCards
					block={block}
					disabled={disabled}
					onDestinationAction={onDestinationAction}
					onDestinationSelectionDone={onDestinationSelectionDone}
					selectedDestinationNames={selectedDestinationNames}
				/>
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

function ChecklistBreadcrumb({ activePhaseIndex, phases }: { activePhaseIndex: number; phases: ChecklistPhase[] }) {
	return (
		<nav className="phase-breadcrumb" aria-label="Travel planning progress">
			{phases.map((phase, index) => (
				<div className={`phase-crumb ${phase.status}`} key={phase.id} title={phase.description}>
					<span className="phase-step">{index + 1}</span>
					<span>{phase.label}</span>
					{index === activePhaseIndex ? <strong>Now</strong> : null}
				</div>
			))}
		</nav>
	);
}

function TripPreferencesSummary({ preferences, title }: { preferences: Record<string, unknown>; title: string }) {
	const entries = Object.entries(preferences).filter(([, value]) => value !== null && value !== undefined && value !== "");
	return (
		<div className="state-card preferences-card">
			<p className="eyebrow">{title}</p>
			{entries.length > 0 ? (
				<dl className="preferences-list">
					{entries.map(([key, value]) => (
						<div key={key}>
							<dt>{formatPreferenceLabel(key)}</dt>
							<dd>{formatPreferenceValue(value)}</dd>
						</div>
					))}
				</dl>
			) : (
				<p>No preferences captured yet.</p>
			)}
		</div>
	);
}

function DestinationCards({
	block,
	onDestinationAction,
	onDestinationSelectionDone,
	disabled,
	selectedDestinationNames,
}: {
	block: DestinationCardsBlock;
	onDestinationAction: (action: "select" | "images", destinationName: string, imageQuery?: string) => void;
	onDestinationSelectionDone: () => void;
	disabled: boolean;
	selectedDestinationNames: Set<string>;
}) {
	return (
		<div className="state-card destination-block">
			<div className="destination-block-header">
				<div>
					<p className="eyebrow">{block.title}</p>
					<h3>{block.data.destinationName}</h3>
				</div>
				<button type="button" className="done-button" onClick={onDestinationSelectionDone} disabled={disabled || selectedDestinationNames.size === 0}>
					Done{selectedDestinationNames.size > 0 ? ` (${selectedDestinationNames.size})` : ""}
				</button>
			</div>
			<p>{block.data.overallSummary}</p>
			<div className="destination-cards">
				{(block.data.cards ?? []).map((card) => {
					const selected = selectedDestinationNames.has(card.name);
					return (
						<article className={selected ? "destination-card selected" : "destination-card"} key={card.name}>
							<div className="card-header">
								<h4>{card.name}</h4>
								{selected ? <span>Selected</span> : null}
							</div>
							<p>{card.summary}</p>
							{card.whyItFits ? <small>Fit: {card.whyItFits}</small> : null}
							{card.tradeoff ? <small>Trade-off: {card.tradeoff}</small> : null}
							{card.seasonality ? <small>Season: {card.seasonality}</small> : null}
							{(card.imageLinks ?? []).length > 0 ? (
								<div className="image-strip">{(card.imageLinks ?? []).slice(0, 3).map((src) => <SafeImage src={src} alt={card.name} key={src} />)}</div>
							) : null}
							<div className="card-actions">
								<button type="button" onClick={() => onDestinationAction("select", card.name, card.imageQuery)} disabled={disabled}>
									{selected ? "Remove" : "Select place"}
								</button>
								<button type="button" onClick={() => onDestinationAction("images", card.name, card.imageQuery)} disabled={disabled}>See images</button>
							</div>
						</article>
					);
				})}
			</div>
		</div>
	);
}

function formatPreferenceLabel(key: string) {
	return key
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatPreferenceValue(value: unknown): string {
	if (Array.isArray(value)) return value.map(formatPreferenceValue).join(", ");
	if (typeof value === "object" && value !== null) {
		return Object.entries(value)
			.filter(([, nestedValue]) => nestedValue !== null && nestedValue !== undefined && nestedValue !== "")
			.map(([nestedKey, nestedValue]) => `${formatPreferenceLabel(nestedKey)}: ${formatPreferenceValue(nestedValue)}`)
			.join(" · ");
	}
	return String(value);
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
