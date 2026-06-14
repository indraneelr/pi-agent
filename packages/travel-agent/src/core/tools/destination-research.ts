/**
 * Shared destination-research normalization and validation.
 *
 * Used by both update_travel_state (field="destination_research") and the
 * dedicated save_destination_shortlist tool so that option-card quality rules
 * stay consistent regardless of which tool the model calls.
 */

import type { TravelState } from "../state.js";
import type { DestinationResearch, SubDestination } from "../types.js";

/**
 * Normalize a raw destination-research payload into a DestinationResearch
 * object, validating option-card counts and required fields against the
 * current session preferences.
 */
export function normalizeDestinationResearch(data: unknown, state: TravelState): DestinationResearch {
	if (!data || typeof data !== "object") {
		throw new Error("destination_research must be an object.");
	}
	const raw = data as Record<string, any>;
	const rawOptions = raw.subDestinations ?? raw.destinations ?? raw.destination_research;
	if (!Array.isArray(rawOptions)) {
		throw new Error(
			"destination_research must include subDestinations, destinations, or destination_research as an array of option cards.",
		);
	}

	const options = rawOptions.map((item: Record<string, any>) => normalizeSubDestination(item));
	validateDestinationOptionCards(options, state);

	return {
		destination: raw.destination ?? {
			title: String(state.preferences.destination ?? "Destination options"),
			name: String(state.preferences.destination ?? "Destination options"),
			description: raw.overallSummary ?? raw.summary ?? "Curated destination options.",
			bestTimeToVisit: raw.bestTimeToVisit ?? "Check current seasonal guidance for the travel dates.",
			reviews: raw.reviews ?? {},
			sources: raw.sources ?? [],
		},
		subDestinations: options,
		overallSummary: raw.overallSummary ?? raw.summary ?? "Curated options matching the user's preferences.",
		tripHighlights: Array.isArray(raw.tripHighlights) ? raw.tripHighlights : [],
		travelTips: Array.isArray(raw.travelTips) ? raw.travelTips : [],
		preferencesUsed: raw.preferencesUsed ?? {
			themes: state.preferences.travel_themes ?? state.preferences.interests ?? [],
			groupType: state.preferences.group_type ?? "unknown",
			numNights: state.preferences.num_nights,
			interests: state.preferences.interests,
		},
		nextUserAction:
			raw.nextUserAction ??
			`Choose the places you want to include${state.preferences.num_nights ? ` for the ${state.preferences.num_nights}-night trip` : ""}.`,
		schemaVersion: "2.0.0",
	};
}

export function normalizeSubDestination(item: Record<string, any>): SubDestination {
	const name = item.name ?? item.location ?? item.title;
	const why = item.why ?? item.reason;
	const bestFor = item.bestFor ?? item.best_for ?? inferBestFor(item);
	const imageQuery =
		item.imageQuery ?? item.imageKeywords ?? (name ? `${name} travel ${bestFor ?? "highlights"}` : undefined);
	const imageLinks = item.imageLinks ?? item.image_urls ?? item.imageUrls ?? item.images;
	return {
		...item,
		name,
		type: item.type ?? "place",
		description: item.description,
		bestFor,
		why,
		roughDays: item.roughDays ?? item.rough_days ?? item.dayAllocation ?? item.day_allocation,
		logisticsFit: item.logisticsFit ?? item.logistics_fit ?? item.logistics,
		budgetFit: item.budgetFit ?? item.budget_fit ?? item.budgetNote ?? item.budget_note,
		seasonNote: item.seasonNote ?? item.season_note ?? item.weatherNote ?? item.weather_note,
		tradeoff: item.tradeoff ?? item.tradeOff ?? item.downside,
		imageQuery,
		imageLinks: Array.isArray(imageLinks) ? imageLinks : [],
		selected: item.selected ?? false,
		reviews: item.reviews ?? {},
		sources: Array.isArray(item.sources) ? item.sources : [],
	};
}

export function inferBestFor(item: Record<string, any>): string | undefined {
	const text = JSON.stringify(item).toLowerCase();
	if (text.includes("beach")) return "best for beaches";
	if (text.includes("food")) return "best for food";
	if (text.includes("history") || text.includes("archaeolog") || text.includes("myth")) return "best for history";
	if (text.includes("family") || text.includes("kid")) return "best for families";
	if (text.includes("value") || text.includes("budget")) return "best value";
	return undefined;
}

export function validateDestinationOptionCards(options: SubDestination[], state: TravelState): void {
	const destination = String(state.preferences.destination ?? "").trim();
	const numNights = Number(state.preferences.num_nights ?? 0);
	const broadDestination = destination.length > 0;
	if (broadDestination) {
		const isSurprise = /surprise|anywhere|options|not sure|undecided/i.test(destination);
		const min = isSurprise ? 3 : 8;
		const max = isSurprise ? 5 : numNights > 14 ? 12 : 10;
		if (options.length < min || options.length > max) {
			throw new Error(`destination_research must include ${min}-${max} option cards; received ${options.length}.`);
		}
	}

	const seen = new Set<string>();
	for (const option of options) {
		const name = String(option.name ?? "").trim();
		if (!name) throw new Error("Each destination option must include a non-empty name.");
		const key = name.toLowerCase();
		if (seen.has(key)) throw new Error(`Duplicate destination option: ${name}`);
		seen.add(key);
		for (const field of [
			"description",
			"bestFor",
			"why",
			"logisticsFit",
			"budgetFit",
			"seasonNote",
			"tradeoff",
		] as const) {
			const value = option[field];
			if (typeof value !== "string" || value.trim().length < 6) {
				throw new Error(`Destination option "${name}" is missing a useful ${field} field.`);
			}
		}
		const roughDays = option.roughDays;
		if (typeof roughDays !== "string" || !/[0-9]/.test(roughDays.trim())) {
			throw new Error(`Destination option "${name}" is missing a useful roughDays field.`);
		}
		if (!hasUsefulImageLinks(option.imageLinks)) {
			throw new Error(
				`Destination option "${name}" must include imageLinks with at least one valid .jpg/.jpeg/.png/.webp URL.`,
			);
		}
		if (looksLikeCopiedDescription(option, options)) {
			throw new Error(`Destination option "${name}" appears to reuse another option's description.`);
		}
	}
}

export function looksLikeCopiedDescription(option: SubDestination, options: SubDestination[]): boolean {
	const own = normalizeText(option.description ?? "");
	if (own.length < 40) return false;
	return options.some((other) => other !== option && normalizeText(other.description ?? "") === own);
}

function hasUsefulImageLinks(imageLinks: unknown): boolean {
	return (
		Array.isArray(imageLinks) &&
		imageLinks.some(
			(url) => typeof url === "string" && /^https?:\/\/.+\.(?:jpe?g|png|webp)(?:[?#].*)?$/i.test(url.trim()),
		)
	);
}

export function normalizeText(text: string): string {
	return text.toLowerCase().replace(/\s+/g, " ").trim();
}
