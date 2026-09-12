import { createHash } from "node:crypto";
import type { SearchResult } from "./types.js";

/** Tool-owned URLs: the model cites a short ID instead of retyping signed redirect URLs. */
export class SearchSources {
	private readonly entries = new Map<string, SearchResult>();
	add(result: SearchResult): string {
		const id = `source-${createHash("sha256").update(result.url).digest("hex").slice(0, 12)}`;
		if (/^https?:\/\//i.test(result.url)) this.entries.set(id, result);
		return id;
	}
	get(id: string): SearchResult | undefined {
		return this.entries.get(id);
	}
}
