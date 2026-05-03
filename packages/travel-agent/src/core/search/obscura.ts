import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { SearchProvider, SearchResult } from "./types.js";

const execFileAsync = promisify(execFile);

export function createObscuraSearchProvider(): SearchProvider {
	return {
		name: "obscura",
		async search(query: string, numResults = 5, signal?: AbortSignal): Promise<SearchResult[]> {
			const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

			// The JS code to run inside the headless browser
			const evalScript = `
				JSON.stringify(
					Array.from(document.querySelectorAll('.result')).map(r => {
						const titleEl = r.querySelector('.result__title');
						const urlEl = r.querySelector('.result__url');
						const snippetEl = r.querySelector('.result__snippet');
						
						let href = urlEl ? urlEl.getAttribute('href') : '';
						if (href && href.includes('uddg=')) {
							try {
								href = decodeURIComponent(href.split('uddg=')[1].split('&')[0]);
							} catch (e) {}
						}

						return {
							title: titleEl ? titleEl.textContent.trim() : 'Unknown Title',
							url: href,
							snippet: snippetEl ? snippetEl.textContent.trim() : ''
						};
					}).filter(r => r.url && r.snippet)
				);
			`;

			const binPath = process.env.OBSCURA_BIN_PATH || join(homedir(), ".obscura", "obscura");

			try {
				const { stdout } = await execFileAsync(binPath, ["fetch", url, "--quiet", "--eval", evalScript], {
					signal,
				});

				let parsed: any[];
				try {
					// We might need to extract the JSON if Obscura prints other things
					const jsonMatch = stdout.match(/\[.*\]/s);
					parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(stdout);
				} catch (_err) {
					console.error("Obscura stdout:", stdout);
					throw new Error("Failed to parse JSON from Obscura output");
				}

				return parsed.slice(0, numResults);
			} catch (err: any) {
				if (err.code === "ENOENT") {
					throw new Error(
						`Obscura is not installed at ${binPath}. Download it from https://github.com/h4ckf0r0day/obscura and add it to your PATH.`,
					);
				}
				throw new Error(`Obscura search failed: ${err.message}`);
			}
		},
	};
}
