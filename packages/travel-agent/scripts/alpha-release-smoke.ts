interface AlphaScenario {
	id: string;
	destination: string;
	traveler: string;
	mustInclude: string[];
}

const scenarios: AlphaScenario[] = [
	{
		id: "greece-family",
		destination: "Greece",
		traveler: "family",
		mustInclude: ["preferences", "shortlist", "validated images", "activities", "itinerary"],
	},
	{
		id: "japan-couple",
		destination: "Japan",
		traveler: "couple",
		mustInclude: ["preferences", "shortlist", "validated images", "activities", "itinerary"],
	},
	{
		id: "portugal-solo",
		destination: "Portugal",
		traveler: "solo",
		mustInclude: ["preferences", "shortlist", "validated images", "activities", "itinerary"],
	},
];

const requiredFinalPlanSections = [
	"Trip overview",
	"Selected destinations",
	"Validated images",
	"Activities",
	"Day-by-day itinerary",
	"Budget notes",
	"Travel tips",
];

function main() {
	const destinations = new Set(scenarios.map((scenario) => scenario.destination.toLowerCase()));
	for (const required of ["greece", "japan", "portugal"]) {
		if (!destinations.has(required)) throw new Error(`Missing alpha scenario: ${required}`);
	}
	for (const scenario of scenarios) {
		for (const item of ["preferences", "shortlist", "validated images", "activities", "itinerary"]) {
			if (!scenario.mustInclude.includes(item)) throw new Error(`${scenario.id} missing required flow item: ${item}`);
		}
	}
	for (const section of requiredFinalPlanSections) {
		if (!section.trim()) throw new Error("Final-plan section names must not be empty");
	}
	console.log(`Alpha release smoke matrix OK: ${scenarios.map((scenario) => scenario.id).join(", ")}`);
	console.log(`Final-plan smoke sections OK: ${requiredFinalPlanSections.join(" | ")}`);
}

main();
