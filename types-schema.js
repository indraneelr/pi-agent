/**
 * Gemini-Compatible JSON Schema for Destination Research
 * 
 * This file contains two schemas:
 * 1. GEMINI_DESTINATION_RESEARCH_SCHEMA - Full overview with destination info
 * 2. GEMINI_ACTIVITIES_RESEARCH_SCHEMA - Activities-only for selected places
 * 
 * IMPORTANT: Keep in sync with types.ts
 */

/**
 * Fully flattened schema for Gemini compatibility
 * No nested references, no unsupported JSON Schema features
 */
export const GEMINI_DESTINATION_RESEARCH_SCHEMA = {
    type: 'object',
    required: [
        'destination',
        'subDestinations',
        'overallSummary',
        'tripHighlights',
        'travelTips',
        'preferencesUsed',
    ],
    properties: {
        destination: {
            type: 'object',
            required: ['title', 'name', 'description', 'bestTimeToVisit', 'reviews', 'sources'],
            properties: {
                title: { type: 'string', description: 'A catchy title for the trip' },
                name: { type: 'string', description: 'Destination name' },
                description: { type: 'string', description: 'Overall destination description' },
                bestTimeToVisit: { type: 'string', description: 'Best season/months to visit' },
                imageKeywords: {
                    type: 'string',
                    description: 'Search string used to search relevant images on web',
                },
                reviews: {
                    type: 'object',
                    properties: {
                        rating: { type: 'number', description: 'Rating from 1-5 stars' },
                        reviewSummary: { type: 'string', description: 'Summary of reviews' },
                        sources: { type: 'array', items: { type: 'string' }, description: 'Links to full reviews' },
                    },
                },
                sources: { type: 'array', items: { type: 'string' }, description: 'Source links or references for the destination research' },
            },
        },
        subDestinations: {
            type: 'array',
            items: {
                type: 'object',
                required: ['name', 'type', 'description', 'reviews', 'sources'],
                properties: {
                    name: { type: 'string', description: 'Area name' },
                    type: { type: 'string', description: 'neighborhood, district, area, or attraction_zone' },
                    description: { type: 'string', description: 'Area description' },
                    imageKeywords: {
                        type: 'string',
                        description: 'Search string used to search relevant images on web',
                    },
                    city: {
                        type: 'string',
                        description: 'City name of the area',
                    },
                    country: {
                        type: 'string',
                        description: 'Country name of the area',
                    },
                    themes: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Themes of the area',
                    },
                    suitableForGroups: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Groups suitable for this area',
                    },
                    overallScore: {
                        type: 'number',
                        description: 'Overall score for this area based on the preferences',
                    },
                    preferenceMatch: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['name', 'score'],
                            properties: {
                                name: { type: 'string', description: 'Preference name' },
                                score: { type: 'string', description: 'Preference match score' },
                                reason: { type: 'string', description: 'Reason for the score' },
                            },
                        },
                        description: 'Preference match scores for this area',
                    },
                    reviews: {
                        type: 'object',
                        properties: {
                            rating: { type: 'number', description: 'Rating from 1-5 stars' },
                            reviewSummary: { type: 'string', description: 'Summary of reviews' },
                            sources: { type: 'array', items: { type: 'string' }, description: 'Links to full reviews' },
                        },
                    },
                    sources: { type: 'array', items: { type: 'string' }, description: 'Source links or references for the sub destination research' },
                },
            },
            description: 'Sub-destinations like neighborhoods',
        },
        overallSummary: { type: 'string', description: 'Comprehensive trip summary' },
        tripHighlights: {
            type: 'array',
            items: { type: 'string' },
            description: 'Top highlights for this trip (at least 3)',
        },
        travelTips: {
            type: 'array',
            items: { type: 'string' },
            description: 'Useful travel tips',
        },
        preferencesUsed: {
            type: 'object',
            required: ['themes', 'groupType'],
            properties: {
                themes: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Trip themes used',
                },
                groupType: { type: 'string', description: 'Travel group type' },
                numNights: { type: 'integer', description: 'Number of nights' },
                interests: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'User interests',
                },
            },
        },
    },
} as const;

/**
 * Activities-Only Research Schema
 * Used when researching activities for specific selected places
 * Returns a flat list of activities with location field containing the place name
 */
export const GEMINI_ACTIVITIES_RESEARCH_SCHEMA = {
    type: 'object',
    required: [
        'activities',
    ],
    properties: {
        activities: {
            type: 'array',
            items: {
                type: 'object',
                required: ['name', 'type', 'description', 'location', 'estimatedDurationHours', 'reviews', 'sources'],
                properties: {
                    name: { type: 'string', description: 'Activity name' },
                    type: { type: 'string', description: 'museum, restaurant, landmark, tour, etc.' },
                    description: { type: 'string', description: 'Detailed description (at least 2-3 sentences)' },
                    location: { type: 'string', description: 'Place/neighborhood name (must be one of the selected places)' },
                    estimatedDurationHours: { type: 'number', description: 'Time to spend' },
                    estimatedCost: { type: 'number', description: 'Estimated cost in USD' },
                    imageKeywords: {
                        type: 'string',
                        description: 'Search string for finding relevant images',
                    },
                    reviews: {
                        type: 'object',
                        properties: {
                            rating: { type: 'number', description: 'Rating from 1-5 stars' },
                            reviewSummary: { type: 'string', description: 'Summary of reviews' },
                            sources: { type: 'array', items: { type: 'string' }, description: 'Links to review sources' },
                        },
                    },
                    suitableForGroups: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Suitable group types',
                    },
                    themes: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Themes',
                    },
                    tips: { type: 'string', description: 'Local tips and recommendations' },
                    bestTimeToVisit: { type: 'string', description: 'Best time of day to visit this activity' },
                    sources: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Source URLs for this activity',
                    },
                },
            },
            description: 'Flat list of activities across all selected places (top 4 per place)',
        },
    },
} as const;




export const GEMINI_ITINERARY_SCHEMA = {
    type: 'object',
    required: [
        'itinerary',
    ],
    properties: {
        description: { type: 'string', description: 'Description of the itinerary, plan rationale' },
        itinerary: {
            type: 'array',
            items: {
                type: 'object',
                required: ['date', 'place', 'dayNumber', 'activities'],
                properties: {
                    date: { type: 'string', description: 'Date of the itinerary' },
                    place: { type: 'string', description: 'Place name' },
                    city: { type: 'string', description: 'City name' },
                    country: { type: 'string', description: 'Country name' },
                    dayNumber: { type: 'integer', description: 'Day number' },
                    imageKeywords: {
                        type: 'string',
                        description: 'Search string for finding relevant images for this day (e.g. the place name + highlights)',
                    },
                    activities: {
                        type: 'array',
                        items: {
                            type: 'object', required: ['name', 'type', 'description', 'location', 'estimatedDurationHours', 'estimatedCost'],
                            properties: {
                                name: { type: 'string', description: 'Activity name' },
                                type: { type: 'string', description: 'one of transport, activity, accommodation, dining, shopping' },
                                description: { type: 'string', description: 'Detailed description (at least 2-3 sentences)' },
                                location: { type: 'string', description: 'Place/neighborhood name (must be one of the selected places)' },
                                estimatedDurationHours: { type: 'number', description: 'Time to spend' },
                                estimatedCost: { type: 'number', description: 'Estimated cost in USD per person' },
                                timeSlot: { type: 'string', description: 'Time slot for the activity Can be morning, afternoon, evening, night' },
                                approxStartTime: { type: 'string', description: 'Approximate start time' },
                                // Optional enrichment fields (populated in place-based mode)
                                reviews: {
                                    type: 'object',
                                    properties: {
                                        rating: { type: 'number', description: 'Rating from 1-5 stars' },
                                        reviewSummary: { type: 'string', description: 'Summary of reviews' },
                                        sources: { type: 'array', items: { type: 'string' }, description: 'Links to review sources' },
                                    },
                                },
                                sources: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Source URLs',
                                },
                                suitableForGroups: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Suitable group types',
                                },
                                tips: { type: 'string', description: 'Local tips and recommendations' },
                                bestTimeToVisit: { type: 'string', description: 'Best time of day to visit this activity' },
                                themes: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Themes for this activity',
                                },
                                sourceActivityId: { type: 'string', description: 'Optional ID of the source activity from ActivityResearchOutput (only in activity-based mode)' },
                            },
                        },
                        description: 'Activities for this day',
                    },
                },
            },
            description: 'Itinerary for the trip',
        },
    },
} as const;

// =============================================================================
// Accommodation Research Schema
// =============================================================================

/**
 * Accommodation Research Schema
 * Used when researching accommodation areas for itinerary cities
 * Returns recommended areas to stay with rate tiers and tips
 *
 * IMPORTANT: Keep in sync with types.ts AccommodationResearchOutputSchema
 */
export const GEMINI_ACCOMMODATION_SCHEMA = {
    type: 'object',
    required: ['areasToStay'],
    properties: {
        description: { type: 'string', description: 'Overview of accommodation options for this trip' },
        areasToStay: {
            type: 'array',
            items: {
                type: 'object',
                required: [
                    'city', 'country', 'areaToStay', 'description',
                    'highlights', 'typicalNightlyRate', 'tips',
                    'safetyTips', 'bookingTips', 'nearbyTransport',
                    'reviews', 'sources',
                ],
                properties: {
                    city: { type: 'string', description: 'City name' },
                    country: { type: 'string', description: 'Country name' },
                    itineraryPlacesCovered: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Itinerary places this area is closest to',
                    },
                    areaToStay: { type: 'string', description: 'Recommended neighborhood/area name' },
                    description: { type: 'string', description: 'Description of the area and why it is recommended (at least 2-3 sentences)' },
                    highlights: { type: 'string', description: 'Key highlights of staying here' },
                    typicalNightlyRate: {
                        type: 'object',
                        required: ['budget', 'midRange', 'luxury'],
                        properties: {
                            budget: { type: 'string', description: 'Budget range, e.g. "$60-90/night"' },
                            midRange: { type: 'string', description: 'Mid-range, e.g. "$120-200/night"' },
                            luxury: { type: 'string', description: 'Luxury range, e.g. "$300+/night"' },
                        },
                    },
                    tips: { type: 'string', description: 'General tips for staying in this area' },
                    safetyTips: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Safety and anti-scam advice',
                    },
                    bookingTips: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Booking advice and what to watch for',
                    },
                    nearbyTransport: { type: 'string', description: 'How to get to/from this area (transport options)' },
                    reviews: {
                        type: 'object',
                        properties: {
                            rating: { type: 'number', description: 'Rating from 1-5 stars' },
                            reviewSummary: { type: 'string', description: 'Summary of reviews' },
                            sources: { type: 'array', items: { type: 'string', format: 'uri' }, description: 'Valid URL links to review sources (must be complete URLs starting with http:// or https://)' },
                        },
                    },
                    imageKeywords: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Keywords for image search',
                    },
                    sources: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Source URLs for this accommodation area',
                    },
                },
            },
            description: 'Recommended areas to stay, one per city in the itinerary',
        },
    },
} as const;

// =============================================================================
// Flights Research Schema (Flat)
// =============================================================================

/**
 * Flat flights schema to improve structured-output reliability.
 * IMPORTANT: Keep in sync with types.ts FlightResearchOutputSchema.
 */
export const GEMINI_FLIGHTS_SCHEMA = {
    type: 'object',
    required: [
        'route_origin',
        'route_destination',
        'route_depart_date',
        'route_return_date',
        'fare_currency',
        'fare_min_per_person_round_trip',
        'fare_typical_per_person_round_trip',
        'fare_max_per_person_round_trip',
        'typical_carriers',
        'sample_options',
        'quick_booking_links',
        'caveats',
        'meta_provider_type',
        'meta_generated_at',
        'meta_confidence',
        'schema_version',
    ],
    properties: {
        route_origin: { type: 'string' },
        route_origin_airport_code: { type: 'string' },
        route_destination: { type: 'string' },
        route_destination_airport_code: { type: 'string' },
        route_depart_date: { type: 'string', description: 'YYYY-MM-DD' },
        route_return_date: { type: 'string', description: 'YYYY-MM-DD' },
        route_cabin_class: {
            type: 'string',
            enum: ['economy', 'premium_economy', 'business', 'first'],
        },
        route_travelers: { type: 'integer' },

        fare_currency: { type: 'string', description: '3-letter currency code' },
        fare_min_per_person_round_trip: { type: 'number' },
        fare_typical_per_person_round_trip: { type: 'number' },
        fare_max_per_person_round_trip: { type: 'number' },
        fare_group_round_trip_total: { type: 'number' },
        fare_volatility: { type: 'string', enum: ['low', 'medium', 'high'] },
        fare_assumptions: {
            type: 'array',
            items: { type: 'string' },
        },

        typical_carriers: {
            type: 'array',
            items: {
                type: 'object',
                required: [
                    'carrier_name',
                    'service_pattern',
                    'confidence_score',
                    'source_urls',
                ],
                properties: {
                    carrier_name: { type: 'string' },
                    carrier_iata_code: { type: 'string' },
                    service_pattern: {
                        type: 'string',
                        enum: ['nonstop_common', 'one_stop_common', 'mixed'],
                    },
                    carrier_note: { type: 'string' },
                    confidence_score: { type: 'number' },
                    source_urls: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                },
            },
        },

        sample_options: {
            type: 'array',
            items: {
                type: 'object',
                required: [
                    'option_id',
                    'option_rank',
                    'carrier_names_csv',
                    'stops',
                    'estimated_fare_amount',
                    'estimated_fare_currency',
                    'booking_provider',
                    'booking_label',
                    'booking_url',
                    'booking_deep_link',
                    'source_urls',
                ],
                properties: {
                    option_id: { type: 'string' },
                    option_rank: { type: 'integer' },
                    carrier_names_csv: { type: 'string' },
                    stops: {
                        type: 'string',
                        enum: ['nonstop', '1_stop', '2_plus', 'mixed'],
                    },
                    duration_hours: { type: 'number' },
                    estimated_fare_amount: { type: 'number' },
                    estimated_fare_currency: { type: 'string' },
                    booking_provider: {
                        type: 'string',
                        enum: ['google_flights', 'kayak', 'skyscanner'],
                    },
                    booking_label: { type: 'string' },
                    booking_url: { type: 'string' },
                    booking_deep_link: { type: 'boolean' },
                    option_notes: { type: 'string' },
                    source_urls: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                },
            },
        },

        quick_booking_links: {
            type: 'array',
            items: {
                type: 'object',
                required: [
                    'booking_provider',
                    'booking_label',
                    'booking_url',
                    'booking_deep_link',
                ],
                properties: {
                    booking_provider: {
                        type: 'string',
                        enum: ['google_flights', 'kayak', 'skyscanner'],
                    },
                    booking_label: { type: 'string' },
                    booking_url: { type: 'string' },
                    booking_deep_link: { type: 'boolean' },
                },
            },
        },
        caveats: {
            type: 'array',
            items: { type: 'string' },
        },

        meta_provider_type: { type: 'string', enum: ['web_search'] },
        meta_generated_at: { type: 'string' },
        meta_confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        schema_version: { type: 'string', enum: ['1.0.0'] },
    },
} as const;
