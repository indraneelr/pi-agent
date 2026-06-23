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

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
	const response = init ? await fetch(url, init) : await fetch(url);
	const body = (await response.json().catch(() => ({}))) as { error?: unknown };
	if (!response.ok) {
		const message = typeof body.error === "string" ? body.error : `Request failed with status ${response.status}`;
		throw new Error(message);
	}
	return body as T;
}
