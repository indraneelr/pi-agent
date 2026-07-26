export interface ChecklistPhase {
	id: string;
	label: string;
	description: string;
	status: "pending" | "active" | "complete";
}

export interface TravelState {
	sessionId: string;
	checklist: {
		phases: ChecklistPhase[];
		activePhaseIndex: number;
	};
	preferences: Record<string, unknown>;
	destinationResearch: unknown | null;
	selectedDestinations: unknown[];
	activitiesResearch: unknown | null;
	itineraryResearch: unknown | null;
	accommodationResearch: unknown | null;
	flightResearch: unknown | null;
}

/**
 * Server-validated image evidence (ADR 0005). The UI renders an image only when
 * backed by one of these — never a raw model-supplied URL. Attribution fields
 * carry the credit line required for licensed sources.
 */
export interface ValidatedImage {
	kind: "image";
	url: string;
	finalUrl: string;
	provider: string;
	/** The page/source the image was found on (for attribution + linking). */
	source?: string;
	retrievedAt: string;
	validatedAt: string;
	httpStatus: number;
	contentType?: string;
	width: number;
	height: number;
	validationStatus: "valid" | "invalid" | "pending";
	rejectionReason?: string;
	/** Attribution (ADR 0005): shown as a credit line under the image. */
	license?: string;
	author?: string;
	attribution?: string;
}

export type TravelUiBlock =
	| ChecklistProgressBlock
	| TripPreferencesSummaryBlock
	| DestinationCardsBlock
	| SelectedDestinationsBlock
	| BudgetSummaryBlock
	| ActivityCardsBlock
	| ItineraryTimelineBlock
	| AccommodationCardsBlock
	| FlightOptionsBlock;

interface UiBlockEnvelope<TKind extends string, TData> {
	id: string;
	kind: TKind;
	version: 1;
	title: string;
	data: TData;
	actions: Array<{ id: string; label: string; type: "placeholder" }>;
	sourceStatePath: string;
}

export type ChecklistProgressBlock = UiBlockEnvelope<
	"checklist_progress",
	{ activePhaseIndex: number; phases: ChecklistPhase[] }
>;

export type TripPreferencesSummaryBlock = UiBlockEnvelope<
	"trip_preferences_summary",
	{ preferences: Record<string, unknown> }
>;

export type DestinationCardsBlock = UiBlockEnvelope<
	"destination_cards",
	{
		destinationName: string;
		overallSummary: string;
		cards: Array<{
			name: string;
			summary: string;
			whyItFits?: string;
			tradeoff?: string;
			seasonality?: string;
			budgetFit?: string;
			logisticsFit?: string;
			imageQuery?: string;
			imageLinks: string[];
			selected: boolean;
		}>;
	}
>;

export type SelectedDestinationsBlock = UiBlockEnvelope<
	"selected_destinations",
	{ destinations: Array<{ name: string; summary?: string; whyItFits?: string }> }
>;

export type BudgetSummaryBlock = UiBlockEnvelope<"budget_summary", { budget?: unknown }>;

export type ActivityCardsBlock = UiBlockEnvelope<
	"activity_cards",
	{
		activities: Array<{
			name: string;
			type: string;
			location: string;
			summary: string;
			cost?: number;
			durationHours?: number;
			tips?: string;
			imageLinks: string[];
			selected?: boolean;
		}>;
	}
>;

export type ItineraryTimelineBlock = UiBlockEnvelope<
	"itinerary_timeline",
	{
		description?: string;
		days: Array<{ dayNumber: number; date: string; place: string; activityCount: number; activities: string[] }>;
	}
>;

export type AccommodationCardsBlock = UiBlockEnvelope<
	"accommodation_cards",
	{
		areas: Array<{
			city: string;
			areaToStay: string;
			summary: string;
			highlights: string;
			nightlyRate?: unknown;
			transport?: string;
		}>;
	}
>;

export type FlightOptionsBlock = UiBlockEnvelope<
	"flight_options",
	{
		route: string;
		dates: string;
		typicalFare: string;
		options: Array<{
			rank: number;
			carriers: string;
			stops: string;
			fare: string;
			bookingLabel: string;
			notes?: string;
		}>;
		caveats: string[];
	}
>;

export interface TravelConversationMessage {
	role: "user" | "assistant";
	content: string;
}

export interface TravelSessionResponse {
	sessionId: string;
	state: TravelState;
	uiBlocks: TravelUiBlock[];
	conversation: TravelConversationMessage[];
	status: "idle" | "busy";
}

export interface SendMessageResponse extends TravelSessionResponse {
	assistantMessage: string;
}

export type InstantActionType =
	| "select_place"
	| "deselect_place"
	| "remove_place"
	| "select_activity"
	| "deselect_activity"
	| "remove_activity";

export interface InstantActionResult {
	state: TravelState;
	uiBlocks: TravelUiBlock[];
}

/** Apply a deterministic instant action (ADR 0001) — no LLM run. */
export async function applyInstantAction(
	sessionId: string,
	type: InstantActionType,
	name: string,
): Promise<InstantActionResult> {
	return requestJson<InstantActionResult>(`/api/travel/sessions/${sessionId}/actions`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ type, name }),
	});
}

export interface FillerContent {
	topic: string;
	headline: string;
	tips: string[];
}

/** Fetch static wait-filler content (ADR 0003) for the current run's wait. */
export async function getFiller(sessionId: string, destination?: string): Promise<FillerContent> {
	const query = destination ? `?destination=${encodeURIComponent(destination)}` : "";
	return requestJson<FillerContent>(`/api/travel/sessions/${sessionId}/filler${query}`);
}

export async function createTravelSession(): Promise<TravelSessionResponse> {
	return requestJson<TravelSessionResponse>("/api/travel/sessions", { method: "POST" });
}

export async function getTravelSession(sessionId: string): Promise<TravelSessionResponse> {
	return requestJson<TravelSessionResponse>(`/api/travel/sessions/${sessionId}`);
}

export async function sendTravelMessage(sessionId: string, message: string): Promise<SendMessageResponse> {
	return requestJson<SendMessageResponse>(`/api/travel/sessions/${sessionId}/messages`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ message }),
	});
}

/** Normalized live-run events streamed from the server over SSE (ADR 0003). */
export type TravelStreamEvent =
	| { type: "tool_start"; tool: string; label: string }
	| { type: "tool_end"; tool: string; isError: boolean }
	| { type: "text_delta"; delta: string }
	| { type: "state_snapshot"; state: TravelState; uiBlocks: TravelUiBlock[] }
	| { type: "run_error"; message: string }
	| { type: "run_finished"; assistantMessage: string };

/**
 * Send a message and consume the SSE progress stream.
 *
 * Uses fetch + a stream reader (not `EventSource`, which is GET-only) so the
 * message body can be POSTed. `onEvent` fires for each parsed event as it
 * arrives; pre-stream HTTP errors (400/403/404/409/503) are thrown as JSON.
 */
export async function streamTravelMessage(
	sessionId: string,
	message: string,
	onEvent: (event: TravelStreamEvent) => void,
	signal?: AbortSignal,
): Promise<void> {
	const response = await fetch(`/api/travel/sessions/${sessionId}/messages/stream`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ message }),
		signal,
	});
	if (!response.ok || !response.body) {
		const body = (await response.json().catch(() => ({}))) as { error?: unknown };
		const msg = typeof body.error === "string" ? body.error : `Request failed with status ${response.status}`;
		throw new Error(msg);
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let boundary = buffer.indexOf("\n\n");
			while (boundary !== -1) {
				const frame = buffer.slice(0, boundary);
				buffer = buffer.slice(boundary + 2);
				const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
				const json = dataLine?.slice("data:".length).trim();
				if (json) {
					try {
						onEvent(JSON.parse(json) as TravelStreamEvent);
					} catch {
						// Ignore a malformed frame rather than aborting the whole stream.
					}
				}
				boundary = buffer.indexOf("\n\n");
			}
		}
	} finally {
		reader.releaseLock();
	}
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
	const response = init ? await fetch(url, init) : await fetch(url);
	const body = (await response.json().catch(() => ({}))) as { error?: unknown };
	if (!response.ok) {
		const message = typeof body.error === "string" ? body.error : `Request failed with status ${response.status}`;
		throw new Error(message);
	}
	return body as T;
}
