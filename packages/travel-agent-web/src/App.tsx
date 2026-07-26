import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { applyInstantAction, createTravelSession, getFiller, getTravelSession, streamTravelMessage, type ActivityCardsBlock, type ChecklistPhase, type DestinationCardsBlock, type FillerContent, type InstantActionType, type TravelState, type TravelUiBlock } from "./api.js";
import { ConsentGate, FooterDisclaimer, HighRiskCaveat, LegalModal } from "./Legal.js";
import { getRenderableDestinationImages } from "./render-safety.js";
import { type ChatMessage, type RunStatus, TravelCopilotChat } from "./TravelCopilotChat.js";

type ResearchTab = "overview" | "places" | "activities" | "itinerary" | "stays" | "flights";

const RESEARCH_TABS: Array<{ id: ResearchTab; label: string }> = [
	{ id: "overview", label: "Overview" },
	{ id: "places", label: "Places" },
	{ id: "activities", label: "Activities" },
	{ id: "itinerary", label: "Itinerary" },
	{ id: "stays", label: "Stays" },
	{ id: "flights", label: "Flights" },
];

export function App() {
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [state, setState] = useState<TravelState | null>(null);
	const [uiBlocks, setUiBlocks] = useState<TravelUiBlock[]>([]);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [draft, setDraft] = useState("");
	const [runStatus, setRunStatus] = useState<RunStatus>("idle");
	const [error, setError] = useState<string | null>(null);
	const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
	const [activeResearchTab, setActiveResearchTab] = useState<ResearchTab>("overview");
	const [selectedDestinationNames, setSelectedDestinationNames] = useState<Set<string>>(new Set());
	const [selectedActivityNames, setSelectedActivityNames] = useState<Set<string>>(new Set());
	// Live-run responsiveness (ADR 0003): tool narration + streaming assistant text.
	const [narration, setNarration] = useState<string[]>([]);
	const [streamingText, setStreamingText] = useState("");
	const [filler, setFiller] = useState<FillerContent | null>(null);
	const [legalOpen, setLegalOpen] = useState(false);

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

	// Selection is server-owned (ADR 0001): derive both selected sets from the
	// authoritative `selected` flags on the latest UI blocks.
	useEffect(() => {
		const selectedNames = new Set<string>();
		const activityNames = new Set<string>();
		for (const block of uiBlocks) {
			if (block.kind === "destination_cards") {
				for (const card of block.data.cards ?? []) {
					if (card.selected) selectedNames.add(card.name);
				}
			}
			if (block.kind === "activity_cards") {
				for (const activity of block.data.activities ?? []) {
					if (activity.selected) activityNames.add(activity.name);
				}
			}
		}
		setSelectedDestinationNames(selectedNames);
		setSelectedActivityNames(activityNames);
	}, [uiBlocks]);

	const activityResearchFallback = useMemo(() => extractActivityResearchFallback(messages), [messages]);
	const visibleMessages = useMemo(() => messages.filter((message) => !isResearchMessage(message)), [messages]);
	const visibleUiBlocks = useMemo(() => {
		if (!activityResearchFallback || uiBlocks.some((block) => block.kind === "activity_cards")) return uiBlocks;
		const destinationIndex = uiBlocks.findLastIndex((block) => block.kind === "destination_cards");
		if (destinationIndex < 0) return [...uiBlocks, activityResearchFallback.block];
		return [...uiBlocks.slice(0, destinationIndex + 1), activityResearchFallback.block, ...uiBlocks.slice(destinationIndex + 1)];
	}, [activityResearchFallback, uiBlocks]);
	const researchTabs = useMemo(() => buildResearchTabs(visibleUiBlocks), [visibleUiBlocks]);
	const displayedUiBlocks = useMemo(
		() => filterUiBlocksByResearchTab(visibleUiBlocks, activeResearchTab),
		[activeResearchTab, visibleUiBlocks],
	);

	const activePhase = useMemo(() => {
		if (!state) return null;
		return state.checklist.phases[state.checklist.activePhaseIndex] ?? null;
	}, [state]);
	// While sending, live narration replaces a static banner; keep the banner only
	// for session creation, which has no stream.
	const progressMessage = runStatus === "starting" ? "Creating your travel planning session…" : null;

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
		setNarration([]);
		setStreamingText("");
		// Static wait-filler (ADR 0003): fire-and-forget, keyed to what we know.
		setFiller(null);
		void getFiller(sessionId, deriveDestination(state))
			.then(setFiller)
			.catch(() => setFiller(null));
		let runFailed = false;
		try {
			await streamTravelMessage(sessionId, message, (event) => {
				switch (event.type) {
					case "tool_start":
						setNarration((current) => [...current, event.label]);
						break;
					case "text_delta":
						setStreamingText((current) => current + event.delta);
						break;
					case "state_snapshot":
						setState(event.state);
						setUiBlocks(event.uiBlocks);
						break;
					case "run_finished":
						setMessages((current) => [...current, { role: "assistant", content: event.assistantMessage || "Done." }]);
						break;
					case "run_error":
						runFailed = true;
						setLastFailedMessage(message);
						setError(event.message);
						break;
				}
			});
			if (!runFailed) setLastFailedMessage(null);
		} catch (e) {
			// Pre-stream failures (network, 4xx/5xx before the stream opened).
			setLastFailedMessage(message);
			setError(errorMessage(e));
		} finally {
			setRunStatus("idle");
			setNarration([]);
			setStreamingText("");
			setFiller(null);
		}
	}

	// Deterministic instant action (ADR 0001): optimistic update, then the
	// server's authoritative snapshot; revert by refetching on failure.
	async function applyAction(type: InstantActionType, name: string) {
		if (!sessionId) return;
		try {
			const result = await applyInstantAction(sessionId, type, name);
			setState(result.state);
			setUiBlocks(result.uiBlocks);
		} catch (e) {
			setError(errorMessage(e));
			try {
				const session = await getTravelSession(sessionId);
				setState(session.state);
				setUiBlocks(session.uiBlocks);
			} catch {
				// Keep the optimistic state if we can't refetch; the next run reconciles.
			}
		}
	}

	function handleDestinationAction(action: "select" | "images" | "reviews", destinationName: string, imageQuery?: string) {
		if (action === "select") {
			const alreadySelected = selectedDestinationNames.has(destinationName);
			setSelectedDestinationNames((current) => {
				const next = new Set(current);
				if (alreadySelected) next.delete(destinationName);
				else next.add(destinationName);
				return next;
			});
			void applyAction(alreadySelected ? "deselect_place" : "select_place", destinationName);
			return;
		}

		if (action === "reviews") {
			void sendMessageToAgent(
				`What do travelers say about ${destinationName}? Summarize review themes from trusted sources — paraphrased, covering both the good and the honest downsides.`,
			);
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

	function handleActivityToggle(activityName: string) {
		const alreadySelected = selectedActivityNames.has(activityName);
		setSelectedActivityNames((current) => {
			const next = new Set(current);
			if (alreadySelected) next.delete(activityName);
			else next.add(activityName);
			return next;
		});
		void applyAction(alreadySelected ? "deselect_activity" : "select_activity", activityName);
	}

	function handleActivitySelectionDone() {
		if (selectedActivityNames.size === 0) return;
		const selectedNames = Array.from(selectedActivityNames);
		void sendMessageToAgent(`Use these selected activities for the itinerary: ${selectedNames.join(", ")}.`);
	}

	// Client-side plan export (ADR 0001: download is an instant action, no LLM).
	function handleDownloadPlan() {
		if (!state) return;
		const blob = new Blob([buildPlanText(state, messages)], { type: "text/markdown" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `travel-plan-${sessionId ?? "session"}.md`;
		link.click();
		URL.revokeObjectURL(url);
	}

	return (
		<ConsentGate onOpenLegal={() => setLegalOpen(true)}>
		<main className="app-shell">
				<TravelCopilotChat
					draft={draft}
					error={error}
					messages={visibleMessages}
					narration={narration}
					streamingText={streamingText}
					filler={filler}
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

				<HighRiskCaveat />

				<PlanActions
					state={state}
					disabled={runStatus !== "idle"}
					onGenerate={(prompt) => void sendMessageToAgent(prompt)}
					onDownload={handleDownloadPlan}
				/>

				<ResearchTabs
					activeResearchTab={activeResearchTab}
					onResearchTabChange={setActiveResearchTab}
					researchTabs={researchTabs}
				/>

				{displayedUiBlocks.length > 0 ? (
					displayedUiBlocks.map((block, index) => (
						<SafeUiBlockView
							block={block}
							disabled={runStatus !== "idle"}
							key={block.id ?? `${block.kind}-${index}`}
							onActivitySelectionDone={handleActivitySelectionDone}
							onActivityToggle={handleActivityToggle}
							onDestinationAction={handleDestinationAction}
							onDestinationSelectionDone={handleDestinationSelectionDone}
							selectedActivityNames={selectedActivityNames}
							selectedDestinationNames={selectedDestinationNames}
						/>
					))
				) : state ? (
					<ChecklistBreadcrumb activePhaseIndex={state.checklist.activePhaseIndex} phases={state.checklist.phases} />
				) : (
					<div className="state-card">Loading checklist…</div>
				)}
			</aside>
			<FooterDisclaimer onOpenLegal={() => setLegalOpen(true)} />
		</main>
		{legalOpen ? <LegalModal onClose={() => setLegalOpen(false)} /> : null}
		</ConsentGate>
	);
}

function ResearchTabs({
	activeResearchTab,
	onResearchTabChange,
	researchTabs,
}: {
	activeResearchTab: ResearchTab;
	onResearchTabChange: (tab: ResearchTab) => void;
	researchTabs: Array<{ id: ResearchTab; label: string; count: number }>;
}) {
	return (
		<nav className="research-tabs" aria-label="Research sections">
			{researchTabs.map((tab) => (
				<button
					type="button"
					className={tab.id === activeResearchTab ? "active" : undefined}
					onClick={() => onResearchTabChange(tab.id)}
					key={tab.id}
				>
					<span>{tab.label}</span>
					<small>{tab.count}</small>
				</button>
			))}
		</nav>
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
	onActivitySelectionDone: () => void;
	onActivityToggle: (activityName: string) => void;
	onDestinationAction: (action: "select" | "images" | "reviews", destinationName: string, imageQuery?: string) => void;
	onDestinationSelectionDone: () => void;
	disabled: boolean;
	selectedActivityNames: Set<string>;
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
	onActivitySelectionDone,
	onActivityToggle,
	onDestinationAction,
	onDestinationSelectionDone,
	disabled,
	selectedActivityNames,
	selectedDestinationNames,
}: {
	block: TravelUiBlock;
	onActivitySelectionDone: () => void;
	onActivityToggle: (activityName: string) => void;
	onDestinationAction: (action: "select" | "images" | "reviews", destinationName: string, imageQuery?: string) => void;
	onDestinationSelectionDone: () => void;
	disabled: boolean;
	selectedActivityNames: Set<string>;
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
				<ActivityCards
					block={block}
					disabled={disabled}
					onActivitySelectionDone={onActivitySelectionDone}
					onActivityToggle={onActivityToggle}
					selectedActivityNames={selectedActivityNames}
				/>
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
	onDestinationAction: (action: "select" | "images" | "reviews", destinationName: string, imageQuery?: string) => void;
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
								<button type="button" onClick={() => onDestinationAction("reviews", card.name)} disabled={disabled}>Reviews</button>
							</div>
						</article>
					);
				})}
			</div>
		</div>
	);
}

function ActivityCards({
	block,
	onActivitySelectionDone,
	onActivityToggle,
	disabled,
	selectedActivityNames,
}: {
	block: ActivityCardsBlock;
	onActivitySelectionDone: () => void;
	onActivityToggle: (activityName: string) => void;
	disabled: boolean;
	selectedActivityNames: Set<string>;
}) {
	return (
		<div className="state-card activity-block">
			<div className="destination-block-header">
				<div>
					<p className="eyebrow">{block.title}</p>
					<h3>Choose activities</h3>
				</div>
				<button type="button" className="done-button" onClick={onActivitySelectionDone} disabled={disabled || selectedActivityNames.size === 0}>
					Done{selectedActivityNames.size > 0 ? ` (${selectedActivityNames.size})` : ""}
				</button>
			</div>
			<div className="destination-cards activity-cards">
				{(block.data.activities ?? []).map((activity) => {
					const selected = selectedActivityNames.has(activity.name);
					return (
						<article className={selected ? "destination-card selected" : "destination-card"} key={activity.name}>
							<div className="card-header">
								<h4>{activity.name}</h4>
								<span>{activity.type}</span>
							</div>
							<p>{activity.summary}</p>
							<small>{activity.location}{activity.durationHours ? ` · ${activity.durationHours}h` : ""}{activity.cost ? ` · ${activity.cost}` : ""}</small>
							{activity.tips ? <small>Tip: {activity.tips}</small> : null}
							{activity.imageLinks.length > 0 ? (
								<div className="image-strip">{activity.imageLinks.slice(0, 3).map((src) => <SafeImage src={src} alt={activity.name} key={src} />)}</div>
							) : null}
							<div className="card-actions">
								<button type="button" onClick={() => onActivityToggle(activity.name)} disabled={disabled}>
									{selected ? "Remove" : "Select activity"}
								</button>
							</div>
						</article>
					);
				})}
			</div>
		</div>
	);
}

/**
 * Contextual generate-action controls (the USP: right control, not chat). Shows
 * only the actions relevant to what's on screen. Generate actions send a
 * templated agent message; download is instant/client-side.
 */
function PlanActions({
	state,
	disabled,
	onGenerate,
	onDownload,
}: {
	state: TravelState | null;
	disabled: boolean;
	onGenerate: (prompt: string) => void;
	onDownload: () => void;
}) {
	if (!state) return null;
	const hasPlaces = Boolean(state.destinationResearch);
	const hasActivities = Boolean(state.activitiesResearch);
	const hasSelections = (state.selectedDestinations?.length ?? 0) > 0;
	const hasItinerary = Boolean(state.itineraryResearch);
	if (!hasPlaces && !hasActivities && !hasSelections) return null;
	return (
		<div className="plan-actions" aria-label="Plan actions">
			{hasPlaces ? (
				<button type="button" disabled={disabled} onClick={() => onGenerate("Show me more place options — the current ones don't quite fit.")}>
					More places
				</button>
			) : null}
			{hasActivities ? (
				<button type="button" disabled={disabled} onClick={() => onGenerate("Show me more activity options for my selected places.")}>
					More activities
				</button>
			) : null}
			{hasItinerary || hasSelections ? (
				<button type="button" disabled={disabled} onClick={() => onGenerate("Calculate the full budget breakdown for this trip, per person and total.")}>
					Calculate budget
				</button>
			) : null}
			{hasPlaces ? (
				<button type="button" disabled={disabled} onClick={() => onGenerate("I'd like to change my preferences and start over with new destination options.")}>
					Start over
				</button>
			) : null}
			<button type="button" onClick={onDownload}>
				Download plan
			</button>
		</div>
	);
}

/** Render the current plan to Markdown for the client-side download. */
function buildPlanText(state: TravelState, messages: ChatMessage[]): string {
	const lines: string[] = ["# My Travel Plan", ""];
	const prefs = Object.entries(state.preferences ?? {}).filter(
		([, value]) => value !== null && value !== undefined && value !== "",
	);
	if (prefs.length > 0) {
		lines.push("## Preferences");
		for (const [key, value] of prefs) lines.push(`- ${formatPreferenceLabel(key)}: ${formatPreferenceValue(value)}`);
		lines.push("");
	}
	const places = (state.selectedDestinations ?? [])
		.map((d) => (d && typeof d === "object" && "name" in d ? String((d as { name?: unknown }).name ?? "") : ""))
		.filter(Boolean);
	if (places.length > 0) lines.push("## Selected places", ...places.map((place) => `- ${place}`), "");
	const lastPlan = [...messages].reverse().find((m) => m.role === "assistant" && m.content.trim().length > 200);
	if (lastPlan) lines.push("## Itinerary", lastPlan.content.trim(), "");
	lines.push(
		"---",
		"_Generated by Pi Travel Agent. AI-generated estimates only — verify visas, health rules, prices, and bookings with official sources before you commit._",
	);
	return lines.join("\n");
}

function buildResearchTabs(blocks: TravelUiBlock[]): Array<{ id: ResearchTab; label: string; count: number }> {
	return RESEARCH_TABS.map((tab) => ({
		...tab,
		count: countBlocksForResearchTab(blocks, tab.id),
	}));
}

function countBlocksForResearchTab(blocks: TravelUiBlock[], tab: ResearchTab) {
	if (tab === "overview") return blocks.length;
	return blocks.filter((block) => blockMatchesResearchTab(block, tab)).length;
}

function filterUiBlocksByResearchTab(blocks: TravelUiBlock[], tab: ResearchTab) {
	if (tab === "overview") return blocks;
	const pinned = blocks.filter((block) => block.kind === "checklist_progress" || block.kind === "trip_preferences_summary");
	const selectedPlaces = tab === "activities" || tab === "itinerary"
		? blocks.filter((block) => block.kind === "selected_destinations")
		: [];
	const matching = blocks.filter((block) => blockMatchesResearchTab(block, tab));
	return [...pinned, ...selectedPlaces, ...matching].filter(
		(block, index, allBlocks) => allBlocks.findIndex((candidate) => candidate.id === block.id && candidate.kind === block.kind) === index,
	);
}

function blockMatchesResearchTab(block: TravelUiBlock, tab: ResearchTab) {
	switch (tab) {
		case "places":
			return block.kind === "destination_cards" || block.kind === "selected_destinations";
		case "activities":
			return block.kind === "activity_cards";
		case "itinerary":
			return block.kind === "itinerary_timeline";
		case "stays":
			return block.kind === "accommodation_cards";
		case "flights":
			return block.kind === "flight_options";
		case "overview":
			return true;
	}
}

function isResearchMessage(message: ChatMessage) {
	if (message.role !== "assistant") return false;
	const content = message.content;
	return (
		extractActivitiesFromMarkdown(content).length > 0 ||
		/\|\s*Activity\s*\|\s*Why It Fits\s*\|\s*Practicality/i.test(content) ||
		/##\s+.+?Activity Options/i.test(content) ||
		/\b(?:activity|destination|place|itinerary|accommodation|flight|image|photo) (?:lineup|options|shortlist|research|search|galleries?)\b/i.test(content) ||
		/\b(?:photos across|more images|image search tool|photo galleries|travel blogs)\b/i.test(content) ||
		/\|\s*(?:Place|Destination|Area|Hotel|Flight|Carrier|Day)\s*\|/i.test(content)
	);
}

function extractActivityResearchFallback(messages: ChatMessage[]): { block: ActivityCardsBlock; messageIndex: number } | null {
	for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex--) {
		const message = messages[messageIndex];
		if (message.role !== "assistant" || !/activity options/i.test(message.content)) continue;
		const activities = extractActivitiesFromMarkdown(message.content);
		if (activities.length < 4) continue;
		return {
			messageIndex,
			block: {
				id: "activity-cards-from-chat",
				kind: "activity_cards",
				version: 1,
				title: "Activity ideas",
				data: { activities },
				actions: [],
				sourceStatePath: "activitiesResearch",
			},
		};
	}
	return null;
}

function extractActivitiesFromMarkdown(content: string): ActivityCardsBlock["data"]["activities"] {
	const activities: ActivityCardsBlock["data"]["activities"] = [];
	let location = "Selected destination";
	for (const rawLine of content.split("\n")) {
		const line = rawLine.trim();
		const heading = line.match(/^##\s+(?:[^\p{L}\p{N}]+)?(.+?)\s+[—–-]\s+Activity Options/iu);
		if (heading?.[1]) {
			location = stripMarkdown(heading[1]).replace(/^[^\p{L}\p{N}]+/u, "");
			continue;
		}
		if (!line.startsWith("|") || /^\|\s*:?-+/.test(line) || /\|\s*#\s*\|/i.test(line)) continue;
		const cells = line.split("|").slice(1, -1).map((cell) => stripMarkdown(cell));
		if (cells.length < 5 || !/^\d+$/.test(cells[0].replace(/\D/g, ""))) continue;
		const name = cells[1];
		if (!name) continue;
		activities.push({
			name,
			type: "Activity",
			location,
			summary: [cells[2], cells[3]].filter(Boolean).join(" "),
			cost: parseCost(cells[4]),
			durationHours: parseDurationHours(cells[3]),
			tips: cells[3] || undefined,
			imageLinks: [],
		});
	}
	return activities;
}

function stripMarkdown(value: string) {
	return value
		.replace(/<[^>]+>/g, "")
		.replace(/[*_`~]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function parseCost(value: string): number | undefined {
	const match = value.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
	return match ? Number(match[0]) : undefined;
}

function parseDurationHours(value: string): number | undefined {
	const match = value.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/i);
	return match ? Number(match[1]) : undefined;
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

/**
 * Best-effort destination string for wait-filler keying (ADR 0003). Reads the
 * first selected destination, then any preference field that looks like a
 * destination. Returns undefined when nothing is known (→ generic filler).
 */
function deriveDestination(state: TravelState | null): string | undefined {
	if (!state) return undefined;
	const selected = state.selectedDestinations?.[0];
	if (selected && typeof selected === "object" && "name" in selected) {
		const name = (selected as { name?: unknown }).name;
		if (typeof name === "string" && name.trim()) return name.trim();
	}
	const preferences = state.preferences ?? {};
	for (const [key, value] of Object.entries(preferences)) {
		if (/destination|country|region|place/i.test(key) && typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}
	return undefined;
}
