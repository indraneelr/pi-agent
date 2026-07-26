/**
 * Static wait-time filler content (ADR 0003).
 *
 * Shown during the unavoidable wait of a generate action to keep the user
 * engaged. This is the **static, instant, non-competing** tier: no live fetch,
 * no calls to the search stack the main task is using. Content is keyed to a
 * destination when known, else generic. Live prefetched content (warmed on
 * destination-lock) is a later enhancement layered on top of this floor.
 */

export interface FillerContent {
	/** Which destination (or "generic") the tips were selected for. */
	topic: string;
	/** A short engaging headline. */
	headline: string;
	/** A few instant, non-competing tips/facts to read while waiting. */
	tips: string[];
}

const GENERIC: FillerContent = {
	topic: "generic",
	headline: "While the agent works…",
	tips: [
		"Shoulder season (just before or after peak) usually means thinner crowds and lower prices for similar weather.",
		"Booking the first activity of the day early beats the tour-bus crowds at popular sights.",
		"A rough daily budget of accommodation + food + one paid activity is a good sanity check before you commit.",
		"Leaving one unplanned afternoon per few days keeps a trip from feeling like a checklist.",
	],
};

const BY_DESTINATION: Record<string, FillerContent> = {
	greece: {
		topic: "Greece",
		headline: "While we plan your Greece trip…",
		tips: [
			"Ferry schedules between islands thin out sharply outside summer — island-hopping plans hinge on them.",
			"The Cyclades (Santorini, Naxos, Milos) are dramatic and busy; the Dodecanese and Ionian isles trade some fame for calm.",
			"September keeps warm seas and sun but sheds the August crowds and peak prices.",
			"Many archaeological sites open early and close mid-afternoon in summer heat — mornings are your friend.",
		],
	},
	japan: {
		topic: "Japan",
		headline: "While we plan your Japan trip…",
		tips: [
			"A Japan Rail Pass can pay for itself fast if you're doing Tokyo–Kyoto–Osaka, but do the math for your route.",
			"Cherry-blossom timing shifts by a week or two year to year and moves south-to-north — flexibility helps.",
			"Cash still matters at smaller restaurants and shrines despite Japan's high-tech reputation.",
			"Kyoto's famous temples are calmest right at opening; by late morning the main ones are packed.",
		],
	},
	portugal: {
		topic: "Portugal",
		headline: "While we plan your Portugal trip…",
		tips: [
			"Lisbon and Porto are hilly — pack shoes for cobblestones and factor in the trams/funiculars.",
			"The Algarve's beaches are stunning but book well ahead in July–August; June and September are gentler.",
			"Pastéis de nata are best straight from the oven — the queue usually means they're fresh.",
			"Day trips from Lisbon (Sintra, Cascais) are easy by train and worth an early start.",
		],
	},
};

/**
 * Return filler content for the wait, keyed loosely to a destination name when
 * one is known. Matching is substring-based so "Greece for 12 days" still hits
 * the Greece set. Always returns something (falls back to generic).
 */
export function getFillerContent(destination?: string | null): FillerContent {
	const key = destination?.trim().toLowerCase();
	if (key) {
		for (const [name, content] of Object.entries(BY_DESTINATION)) {
			if (key.includes(name)) return content;
		}
	}
	return GENERIC;
}
