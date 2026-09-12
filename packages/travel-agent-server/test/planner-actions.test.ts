import { afterEach, expect, test, vi } from "vitest";
import { isPlannerAction, runResearchAction } from "../src/planner-actions.js";
import { createScriptedSession } from "./scripted-session.js";

afterEach(() => vi.restoreAllMocks());

async function selectedSession() {
	const session = await createScriptedSession("test");
	await session.agent.prompt("Plan Japan");
	session.state.selectedDestinations = [session.state.destinationResearch!.subDestinations[0]];
	session.state.checklist = {
		activePhaseIndex: 0,
		phases: [
			{ id: "select_destinations", label: "Select", description: "", status: "active" },
			{ id: "research_experiences", label: "Activities", description: "", status: "pending" },
		],
	};
	return session;
}

test("acknowledgement-only activity run continues and saves cards in the same action", async () => {
	const session = await selectedSession();
	const original = session.agent.prompt.bind(session.agent);
	const prompt = vi.spyOn(session.agent, "prompt").mockResolvedValueOnce().mockImplementationOnce(original);
	const labels: string[] = [];
	await runResearchAction(
		session,
		{ type: "activities" },
		(event) => {
			if (event.type === "tool_start") labels.push(event.label);
		},
		new AbortController().signal,
	);
	expect(prompt).toHaveBeenCalledTimes(2);
	expect(session.state.activitiesResearch?.activities).toHaveLength(5);
	expect(session.state.checklist.activePhaseIndex).toBe(1);
	expect(labels).toContain("Finishing and saving the research…");
});

test("two empty acknowledgements produce an explicit failure, not false success", async () => {
	const session = await selectedSession();
	const prompt = vi.spyOn(session.agent, "prompt").mockResolvedValue();
	await expect(
		runResearchAction(session, { type: "activities" }, () => {}, new AbortController().signal),
	).rejects.toThrow("Nothing is running in the background");
	expect(prompt).toHaveBeenCalledTimes(2);
});

test("cancellation prevents a hidden follow-up prompt", async () => {
	const session = await selectedSession();
	const controller = new AbortController();
	const prompt = vi.spyOn(session.agent, "prompt").mockImplementation(async () => {
		controller.abort();
	});
	await expect(runResearchAction(session, { type: "activities" }, () => {}, controller.signal)).rejects.toThrow();
	expect(prompt).toHaveBeenCalledTimes(1);
});

test("reviews require saved structured data and reject unknown destinations", async () => {
	const session = await selectedSession();
	const prompt = vi.spyOn(session.agent, "prompt").mockResolvedValue();
	await expect(
		runResearchAction(session, { type: "reviews", destinationName: "Kyoto" }, () => {}, new AbortController().signal),
	).rejects.toThrow("without saving reviews");
	expect(prompt).toHaveBeenCalledTimes(2);
	await expect(
		runResearchAction(
			session,
			{ type: "reviews", destinationName: "Missing" },
			() => {},
			new AbortController().signal,
		),
	).rejects.toThrow("no longer in the shortlist");
	expect(isPlannerAction({ type: "images", destinationName: 3 })).toBe(false);
});
