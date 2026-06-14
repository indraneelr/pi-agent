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

export interface TravelSessionResponse {
	sessionId: string;
	state: TravelState;
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
