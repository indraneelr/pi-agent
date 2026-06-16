/**
 * Accommodation and flight research quality scoring.
 *
 * Deterministic release-readiness checks for the research_accommodation_flights
 * phase. These checks are intentionally stricter than schema validation: they
 * verify selected overnight-place coverage, 4-6 lodging options per city,
 * useful rates/safety/transport/booking notes, and bounded flight option
 * coverage with dates, fares, booking links, sources, caveats, and confidence.
 */

import type {
	AccommodationArea,
	AccommodationResearch,
	FlightResearch,
	ItineraryResearch,
	TravelPreferences,
} from "./types.js";

export interface AccommodationFlightQuality {
	overnightCities: string[];
	accommodationCountsByCity: Record<string, number>;
	flightOptionCount: number;
	issues: string[];
	pass: boolean;
}

export function scoreAccommodationFlightResearchQuality(
	accommodationResearch: AccommodationResearch | null | undefined,
	flightResearch: FlightResearch | null | undefined,
	prefs: Partial<TravelPreferences>,
	itineraryResearch: ItineraryResearch | null | undefined,
): AccommodationFlightQuality {
	const overnightCities = deriveOvernightCities(itineraryResearch);
	const areas = accommodationResearch?.areasToStay ?? [];
	const issues: string[] = [];

	if (
		!accommodationResearch ||
		!Array.isArray(accommodationResearch.areasToStay) ||
		accommodationResearch.areasToStay.length === 0
	) {
		issues.push("accommodationResearch was not persisted with areasToStay.");
	}

	const accommodationCountsByCity: Record<string, number> = {};
	for (const city of overnightCities) {
		const count = areas.filter((area) => samePlace(area.city, city) || coversCity(area, city)).length;
		accommodationCountsByCity[city] = count;
		if (count < 4 || count > 6) issues.push(`City ${city} has ${count} accommodation option(s); expected 4-6.`);
	}

	for (const area of areas) issues.push(...scoreAccommodationArea(area));
	issues.push(...scoreFlightResearch(flightResearch, prefs));

	return {
		overnightCities,
		accommodationCountsByCity,
		flightOptionCount: flightResearch?.sample_options?.length ?? 0,
		issues,
		pass: issues.length === 0,
	};
}

function deriveOvernightCities(itineraryResearch: ItineraryResearch | null | undefined): string[] {
	const days = itineraryResearch?.itinerary ?? [];
	const cityLike = days
		.slice(0, Math.max(0, days.length - 1))
		.map((day) => cleanPlace(day.city || day.place))
		.filter(Boolean);
	return unique(cityLike.map((place) => place.split(/\s*(?:→|->| to )\s*/i)[0]?.trim()).filter(Boolean));
}

function scoreAccommodationArea(area: AccommodationArea): string[] {
	const issues: string[] = [];
	const label = area.areaToStay || area.city || "unknown area";
	const text = fieldText(area);
	if (!area.city || area.city.trim().length < 2) issues.push(`Accommodation area ${label} is missing city.`);
	if (!area.areaToStay || area.areaToStay.trim().length < 2)
		issues.push(`Accommodation area in ${area.city || "unknown city"} is missing areaToStay.`);
	if (!area.description || area.description.trim().length < 40)
		issues.push(`Accommodation area ${label} needs a useful description.`);
	if (!area.nearbyTransport || area.nearbyTransport.trim().length < 8)
		issues.push(`Accommodation area ${label} is missing nearby transport guidance.`);
	if (!hasNightlyRates(area))
		issues.push(`Accommodation area ${label} is missing budget/mid-range/luxury nightly rates.`);
	if (!hasListOrText(area.safetyTips)) issues.push(`Accommodation area ${label} is missing safety tips.`);
	if (!hasListOrText(area.bookingTips)) issues.push(`Accommodation area ${label} is missing booking tips.`);
	if (!Array.isArray(area.sources) || area.sources.length === 0)
		issues.push(`Accommodation area ${label} is missing sources.`);
	if (!/\b(walk|metro|train|bus|tram|taxi|transit|station|airport|ferry|near|minutes?)\b/i.test(text))
		issues.push(`Accommodation area ${label} lacks logistics/proximity evidence.`);
	if (!/(\b(budget|mid[- ]?range|luxury|rate|nightly|eur|usd|cost|price)\b|€|\$)/i.test(text))
		issues.push(`Accommodation area ${label} lacks budget/rate evidence.`);
	return issues;
}

function scoreFlightResearch(
	flightResearch: FlightResearch | null | undefined,
	prefs: Partial<TravelPreferences>,
): string[] {
	const issues: string[] = [];
	if (!flightResearch) {
		issues.push("flightResearch was not persisted.");
		return issues;
	}
	const options = flightResearch.sample_options ?? [];
	if (options.length !== 0 && (options.length < 4 || options.length > 6)) {
		issues.push(
			`Flight research has ${options.length} sample option(s); expected 4-6 or 0 if flights are explicitly deferred.`,
		);
	}
	const record = flightResearch as FlightResearch & Record<string, any>;
	const routeSummary = fieldText(record.route_summary);
	const optionText = fieldText(options);
	if (!flightResearch.route_origin && !routeSummary && !/\b[A-Z]{3}\b/.test(optionText))
		issues.push("Flight research is missing route_origin or route_summary.");
	if (!flightResearch.route_destination && !routeSummary && !/\b[A-Z]{3}\b/.test(optionText))
		issues.push("Flight research is missing route_destination or route_summary.");
	const departDate =
		flightResearch.route_depart_date ??
		record.dates?.outbound ??
		record.travel_dates?.outbound ??
		record.outboundDate;
	const returnDate =
		flightResearch.route_return_date ?? record.dates?.return ?? record.travel_dates?.return ?? record.returnDate;
	if (!dateMatches(departDate, prefs.from_date, optionText))
		issues.push("Flight research has invalid route_depart_date.");
	if (!dateMatches(returnDate, prefs.to_date, optionText))
		issues.push("Flight research has invalid route_return_date.");
	if (prefs.from_date && !dateMatches(departDate, prefs.from_date, optionText))
		issues.push("Flight depart date does not match preferences.");
	if (prefs.to_date && !dateMatches(returnDate, prefs.to_date, optionText))
		issues.push("Flight return date does not match preferences.");
	const hasTopLevelFare =
		positive(flightResearch.fare_min_per_person_round_trip) &&
		positive(flightResearch.fare_typical_per_person_round_trip) &&
		positive(flightResearch.fare_max_per_person_round_trip);
	const hasOptionFares = options.every((option) => hasFareEvidence(option));
	if (!hasTopLevelFare && !hasOptionFares) issues.push("Flight research is missing positive fare estimates.");
	if (
		positive(flightResearch.fare_min_per_person_round_trip) &&
		positive(flightResearch.fare_typical_per_person_round_trip) &&
		flightResearch.fare_min_per_person_round_trip > flightResearch.fare_typical_per_person_round_trip
	) {
		issues.push("Flight fare min exceeds typical fare.");
	}
	if (
		(!Array.isArray(flightResearch.typical_carriers) || flightResearch.typical_carriers.length === 0) &&
		!options.some((option) => hasCarrierEvidence(option))
	)
		issues.push("Flight research is missing typical carriers.");
	if (
		(!Array.isArray(flightResearch.quick_booking_links) || flightResearch.quick_booking_links.length === 0) &&
		!options.some((option) => hasBookingUrl(option))
	)
		issues.push("Flight research is missing quick booking links.");
	if (
		(!Array.isArray(flightResearch.caveats) || flightResearch.caveats.length === 0) &&
		!fieldText(record.live_data_caveat) &&
		!fieldText(record.liveDataCaveat) &&
		!fieldText(record.disclaimers)
	)
		issues.push("Flight research is missing caveats/live-data assumptions.");
	if (
		flightResearch.meta_provider_type !== "web_search" &&
		!options.some((option) => (option as Record<string, any>).meta_provider_type === "web_search")
	)
		issues.push("Flight research must label provider type as web_search.");
	if (
		!flightResearch.meta_confidence &&
		!record.confidence &&
		!options.some((option) => fieldText((option as Record<string, any>).confidence))
	)
		issues.push("Flight research is missing confidence.");
	for (const option of options) {
		const optionRecord = option as typeof option & Record<string, any>;
		const label = option.option_id || optionRecord.label || optionRecord.type || "?";
		if (!hasCarrierEvidence(option)) issues.push(`Flight option ${label} is missing carrier names.`);
		if (!hasFareEvidence(option)) issues.push(`Flight option ${label} is missing positive estimated fare.`);
		if (!hasBookingUrl(option)) issues.push(`Flight option ${label} is missing booking URL.`);
		if (
			!hasListOrText(option.source_urls) &&
			!hasListOrText(optionRecord.sources) &&
			!hasListOrText(optionRecord.booking_links) &&
			!hasListOrText(optionRecord.booking_link) &&
			!hasListOrText(optionRecord.bookingLink) &&
			!hasListOrText(record.sources)
		)
			issues.push(`Flight option ${label} is missing sources.`);
	}
	return issues;
}

function hasNightlyRates(area: AccommodationArea): boolean {
	const rates = area.typicalNightlyRate as unknown;
	if (typeof rates === "string") return /(budget|mid|mid[- ]?range|luxury|€|\$|eur|usd|gbp|£)/i.test(rates);
	const rateRecord = rates as Record<string, unknown>;
	return Boolean(rateRecord?.budget && (rateRecord.midRange || rateRecord.mid_range) && rateRecord?.luxury);
}

function hasListOrText(value: unknown): boolean {
	return (Array.isArray(value) && value.length > 0) || (typeof value === "string" && value.trim().length > 0);
}

function hasCarrierEvidence(option: Record<string, any>): boolean {
	return Boolean(
		option.carrier_names_csv ||
			option.carrier ||
			option.carrier_airline ||
			option.carriers ||
			option.airline ||
			option.airlines,
	);
}

function hasFareEvidence(option: Record<string, any>): boolean {
	if (positive(option.estimated_fare_amount)) return true;
	const explicitFareText = fieldText(
		option.fare_estimate ??
			option.fare_estimate_per_person_eur ??
			option.fareEstimatePerPerson ??
			option.total_estimate_family_4_eur ??
			option.price ??
			option.fare ??
			option.cost,
	);
	if (/(?:€|\$|eur|usd|gbp|£|¥|jpy)\s?\d|\d+\s?(?:€|\$|eur|usd|gbp|£|¥|jpy)|\d+\s*[–-]\s*\d+/i.test(explicitFareText))
		return true;
	if (
		Object.entries(option).some(
			([key, value]) => /fare|price|cost|estimate/i.test(key) && /\d/.test(fieldText(value)),
		)
	)
		return true;
	return /(?:€|\$|eur|usd|gbp|£|¥|jpy)\s?\d|\d+\s?(?:€|\$|eur|usd|gbp|£|¥|jpy)|\d+\s*[–-]\s*\d+/.test(
		fieldText(option),
	);
}

function dateMatches(value: unknown, expectedIso: string | undefined, fallbackText: string): boolean {
	if (!expectedIso)
		return (
			isIsoDate(value) ||
			/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i.test(fallbackText)
		);
	const rawText = fieldText(value);
	if (value === expectedIso || rawText.includes(expectedIso) || fallbackText.includes(expectedIso)) return true;
	const date = new Date(`${expectedIso}T00:00:00Z`);
	const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
	const longMonth = date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
	const day = date.getUTCDate();
	const text = `${rawText} ${fallbackText}`;
	return new RegExp(`\\b(?:${month}|${longMonth})\\.?\\s+0?${day}\\b`, "i").test(text);
}

function hasBookingUrl(option: Record<string, any>): boolean {
	return Boolean(
		option.booking_url ||
			option.booking_link ||
			option.bookingLink ||
			option.url ||
			option.bookingUrl ||
			hasListOrText(option.booking_links),
	);
}

function coversCity(area: AccommodationArea, city: string): boolean {
	return (area.itineraryPlacesCovered ?? []).some((place) => samePlace(place, city));
}

function cleanPlace(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function samePlace(a: string | undefined, b: string): boolean {
	return normalize(a ?? "") === normalize(b);
}

function normalize(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function fieldText(value: unknown): string {
	if (typeof value === "string") return value;
	if (typeof value === "number") return String(value);
	if (Array.isArray(value)) return value.map(fieldText).join(" ");
	if (value && typeof value === "object")
		return Object.values(value as Record<string, unknown>)
			.map(fieldText)
			.join(" ");
	return "";
}

function positive(value: unknown): boolean {
	const n = Number(value);
	return Number.isFinite(n) && n > 0;
}

function isIsoDate(value: unknown): value is string {
	return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function unique<T>(values: T[]): T[] {
	return [...new Set(values)];
}
