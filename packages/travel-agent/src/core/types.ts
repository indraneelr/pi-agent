/**
 * Travel Agent Types
 *
 * TypeScript interfaces derived from the Gemini JSON schemas in types-schema.js.
 * These cover travel preferences, destination research, activities, itinerary,
 * accommodation, and flight research outputs.
 */

// =============================================================================
// Reviews (shared across multiple types)
// =============================================================================

export interface Reviews {
	rating?: number;
	reviewSummary?: string;
	sources?: string[];
}

export interface ValidatedImage {
	kind: "image";
	url: string;
	finalUrl: string;
	provider: string;
	source?: string;
	title?: string;
	retrievedAt: string;
	validatedAt: string;
	httpStatus: number;
	contentType: string | null;
	width: number;
	height: number;
	validationStatus: "valid" | "invalid" | "stale";
	rejectionReason?: string;
}

// =============================================================================
// Preferences
// =============================================================================

/** Mandatory preferences — agent must gather these before proceeding. */
export interface MandatoryPreferences {
	destination: string;
	origin: string;
	from_date: string;
	to_date: string;
	num_nights: number;
	group_size: number;
	group_type: string;
	budget: Budget;
}

export interface Budget {
	amount: number;
	currency: string;
	category: string;
}

/** Optional preferences — agent asks about these but they are not blocking. */
export interface OptionalPreferences {
	ages_in_group?: number[];
	travel_themes?: string[];
	pace_of_travel?: string;
	accommodation_type?: string;
	location_preferences?: string[];
	min_hotel_rating?: number;
	must_have_amenities?: string[];
	max_daily_travel_time_hours?: number;
	prefer_grouped_attractions?: boolean;
	activity_intensity?: string;
	safety_priority?: string;
	accessibility_needs?: string[];
	avoid_crowds?: boolean;
	want_itinerary?: boolean;
	want_photos?: boolean;
	want_reviews?: boolean;
	want_local_tips?: boolean;
	want_food_recommendations?: boolean;
	dietary_restrictions?: string[];
	language_preferences?: string[];
	interests?: string[];
	areas_to_cover?: string[];
}

export interface TravelPreferences extends MandatoryPreferences, OptionalPreferences {}

/** All mandatory preference field names. */
export const MANDATORY_PREFERENCE_FIELDS: (keyof MandatoryPreferences)[] = [
	"destination",
	"origin",
	"from_date",
	"to_date",
	"num_nights",
	"group_size",
	"group_type",
	"budget",
];

// =============================================================================
// Destination Research (from GEMINI_DESTINATION_RESEARCH_SCHEMA)
// =============================================================================

export interface PreferenceMatch {
	name: string;
	score: string;
	reason?: string;
}

export interface SubDestination {
	name: string;
	type: string;
	description: string;
	/** Compact decision label, e.g. "best for beaches" or "best value". */
	bestFor?: string;
	/** Why this option matches the user's profile. */
	why?: string;
	/** Rough number of days/nights to allocate to this place. */
	roughDays?: string;
	/** Logistical fit: route/base/proximity note, e.g. "easy ferry from Athens". */
	logisticsFit?: string;
	/** Budget fit for the user's stated budget; label estimates clearly. */
	budgetFit?: string;
	/** Season/weather note for the trip window. */
	seasonNote?: string;
	/** Honest downside/tradeoff to support choosing. */
	tradeoff?: string;
	/** Search query or prompt for the UI/image tool. */
	imageQuery?: string;
	/** UI selection state; defaults false when rendered. */
	selected?: boolean;
	imageKeywords?: string;
	imageLinks?: string[];
	validatedImages?: ValidatedImage[];
	city?: string;
	country?: string;
	themes?: string[];
	suitableForGroups?: string[];
	overallScore?: number;
	preferenceMatch?: PreferenceMatch[];
	reviews: Reviews;
	sources: string[];
}

export interface Destination {
	title: string;
	name: string;
	description: string;
	bestTimeToVisit: string;
	imageKeywords?: string;
	imageLinks?: string[];
	validatedImages?: ValidatedImage[];
	reviews: Reviews;
	sources: string[];
}

export interface PreferencesUsed {
	themes: string[];
	groupType: string;
	numNights?: number;
	interests?: string[];
}

export interface DestinationResearch {
	destination: Destination;
	subDestinations: SubDestination[];
	overallSummary: string;
	tripHighlights: string[];
	travelTips: string[];
	preferencesUsed: PreferencesUsed;
	/** What the UI should ask the user to do next, e.g. choose 3-4 places. */
	nextUserAction?: string;
	schemaVersion?: "2.0.0";
}

// =============================================================================
// Activities Research (from GEMINI_ACTIVITIES_RESEARCH_SCHEMA)
// =============================================================================

export interface Activity {
	name: string;
	type: string;
	description: string;
	location: string;
	estimatedDurationHours: number;
	estimatedCost?: number;
	imageKeywords?: string;
	imageLinks?: string[];
	validatedImages?: ValidatedImage[];
	reviews: Reviews;
	suitableForGroups?: string[];
	themes?: string[];
	tips?: string;
	bestTimeToVisit?: string;
	sources: string[];
}

export interface ActivitiesResearch {
	activities: Activity[];
}

// =============================================================================
// Itinerary (from GEMINI_ITINERARY_SCHEMA)
// =============================================================================

export interface ItineraryActivity {
	name: string;
	type: string;
	description: string;
	location: string;
	estimatedDurationHours: number;
	estimatedCost: number;
	timeSlot?: string;
	approxStartTime?: string;
	reviews?: Reviews;
	sources?: string[];
	suitableForGroups?: string[];
	tips?: string;
	bestTimeToVisit?: string;
	themes?: string[];
	sourceActivityId?: string;
}

export interface ItineraryDay {
	date: string;
	place: string;
	city?: string;
	country?: string;
	dayNumber: number;
	imageKeywords?: string;
	imageLinks?: string[];
	validatedImages?: ValidatedImage[];
	activities: ItineraryActivity[];
}

export interface ItineraryResearch {
	description?: string;
	itinerary: ItineraryDay[];
}

// =============================================================================
// Accommodation (from GEMINI_ACCOMMODATION_SCHEMA)
// =============================================================================

export interface NightlyRate {
	budget: string;
	midRange: string;
	luxury: string;
}

export interface AccommodationArea {
	city: string;
	country: string;
	itineraryPlacesCovered?: string[];
	areaToStay: string;
	description: string;
	highlights: string;
	typicalNightlyRate: NightlyRate;
	tips: string;
	safetyTips: string[];
	bookingTips: string[];
	nearbyTransport: string;
	reviews: Reviews;
	imageKeywords?: string[];
	imageLinks?: string[];
	validatedImages?: ValidatedImage[];
	accommodationLinks?: string[];
	sources: string[];
}

export interface AccommodationResearch {
	description?: string;
	areasToStay: AccommodationArea[];
}

// =============================================================================
// Flights (from GEMINI_FLIGHTS_SCHEMA)
// =============================================================================

export type CabinClass = "economy" | "premium_economy" | "business" | "first";
export type ServicePattern = "nonstop_common" | "one_stop_common" | "mixed";
export type StopType = "nonstop" | "1_stop" | "2_plus" | "mixed";
export type BookingProvider = "google_flights" | "kayak" | "skyscanner";
export type Volatility = "low" | "medium" | "high";
export type Confidence = "low" | "medium" | "high";

export interface FlightCarrier {
	carrier_name: string;
	carrier_iata_code?: string;
	service_pattern: ServicePattern;
	carrier_note?: string;
	confidence_score: number;
	source_urls: string[];
}

export interface FlightOption {
	option_id: string;
	option_rank: number;
	carrier_names_csv: string;
	stops: StopType;
	duration_hours?: number;
	estimated_fare_amount: number;
	estimated_fare_currency: string;
	booking_provider: BookingProvider;
	booking_label: string;
	booking_url: string;
	booking_deep_link: boolean;
	option_notes?: string;
	source_urls: string[];
}

export interface BookingLink {
	booking_provider: BookingProvider;
	booking_label: string;
	booking_url: string;
	booking_deep_link: boolean;
}

export interface FlightResearch {
	route_origin: string;
	route_origin_airport_code?: string;
	route_destination: string;
	route_destination_airport_code?: string;
	route_depart_date: string;
	route_return_date: string;
	route_cabin_class?: CabinClass;
	route_travelers?: number;
	fare_currency: string;
	fare_min_per_person_round_trip: number;
	fare_typical_per_person_round_trip: number;
	fare_max_per_person_round_trip: number;
	fare_group_round_trip_total?: number;
	fare_volatility?: Volatility;
	fare_assumptions?: string[];
	typical_carriers: FlightCarrier[];
	sample_options: FlightOption[];
	quick_booking_links: BookingLink[];
	caveats: string[];
	meta_provider_type: "web_search";
	meta_generated_at: string;
	meta_confidence: Confidence;
	schema_version: "1.0.0";
}
