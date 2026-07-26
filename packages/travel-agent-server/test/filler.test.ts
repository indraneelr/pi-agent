import { describe, expect, it } from "vitest";
import { getFillerContent } from "../src/filler.js";

describe("getFillerContent", () => {
	it("returns generic content when no destination is known", () => {
		expect(getFillerContent().topic).toBe("generic");
		expect(getFillerContent(null).topic).toBe("generic");
		expect(getFillerContent("").topic).toBe("generic");
	});

	it("matches a destination by loose substring", () => {
		expect(getFillerContent("Greece for 12 days").topic).toBe("Greece");
		expect(getFillerContent("two weeks in JAPAN").topic).toBe("Japan");
		expect(getFillerContent("Portugal").topic).toBe("Portugal");
	});

	it("falls back to generic for an unknown destination", () => {
		expect(getFillerContent("Mongolia").topic).toBe("generic");
	});

	it("always returns non-empty tips", () => {
		for (const d of [undefined, "Greece", "Japan", "Portugal", "nowhere"]) {
			expect(getFillerContent(d).tips.length).toBeGreaterThan(0);
		}
	});
});
