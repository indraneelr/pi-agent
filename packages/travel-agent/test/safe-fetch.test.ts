import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Response } from "undici";
import { describe, expect, it } from "vitest";
import { defaultImageDimensionProbe } from "../src/core/image-search/validate.js";
import { defaultImageHttpProbe } from "../src/core/image-validation.js";
import {
	isNonPublicAddress,
	publicOnlyLookup,
	SAFE_FETCH_MAX_REDIRECTS,
	type SafeFetchTransport,
	safeFetch,
	UnsafeUrlError,
} from "../src/core/safe-fetch.js";

function redirect(location: string): Response {
	return new Response(null, { status: 302, headers: { location } });
}

describe("isNonPublicAddress", () => {
	it.each([
		"127.0.0.1",
		"10.1.2.3",
		"172.16.0.1",
		"192.168.1.1",
		"169.254.169.254",
		"100.64.0.1",
		"0.0.0.0",
		"::1",
		"::",
		"fd12:3456::1",
		"fe80::1",
		"::ffff:127.0.0.1",
		"::ffff:7f00:1",
		"::ffff:a9fe:a9fe",
		"not-an-ip",
	])("blocks %s", (address) => {
		expect(isNonPublicAddress(address)).toBe(true);
	});

	it.each(["8.8.8.8", "208.80.154.224", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows %s", (address) => {
		expect(isNonPublicAddress(address)).toBe(false);
	});
});

describe("safeFetch", () => {
	const neverCalled: SafeFetchTransport = async () => {
		throw new Error("transport must not be called");
	};

	it.each([
		"http://127.0.0.1:3001/ready",
		"http://169.254.169.254/latest/meta-data/",
		"http://[::1]/",
		"http://[::ffff:127.0.0.1]/",
		"http://10.0.0.5/image.jpg",
		"ftp://example.com/image.jpg",
		"file:///etc/passwd",
		"https://user:pass@example.com/image.jpg",
		"not a url",
	])("rejects %s before any request", async (url) => {
		await expect(safeFetch(url, {}, neverCalled)).rejects.toBeInstanceOf(UnsafeUrlError);
	});

	it("re-validates every redirect hop", async () => {
		const transport: SafeFetchTransport = async () => redirect("http://169.254.169.254/latest/meta-data/");
		await expect(safeFetch("https://images.example/a.jpg", {}, transport)).rejects.toThrow(/non-public/);
	});

	it("caps the number of redirects", async () => {
		let calls = 0;
		const transport: SafeFetchTransport = async () => redirect(`https://images.example/hop-${++calls}.jpg`);
		await expect(safeFetch("https://images.example/a.jpg", {}, transport)).rejects.toThrow(/Too many redirects/);
		expect(calls).toBe(SAFE_FETCH_MAX_REDIRECTS + 1);
	});

	it("follows public redirects manually and reports the final URL", async () => {
		const requested: string[] = [];
		const transport: SafeFetchTransport = async (url, init) => {
			requested.push(url);
			expect(init.redirect).toBe("manual");
			return url.endsWith("/a.jpg")
				? redirect("/cdn/b.jpg")
				: new Response("ok", { status: 200, headers: { "content-type": "image/jpeg" } });
		};
		const { response, finalUrl } = await safeFetch("https://images.example/a.jpg", {}, transport);
		expect(response.status).toBe(200);
		expect(finalUrl).toBe("https://images.example/cdn/b.jpg");
		expect(requested).toEqual(["https://images.example/a.jpg", "https://images.example/cdn/b.jpg"]);
	});
});

describe("publicOnlyLookup", () => {
	it("refuses hostnames that resolve to loopback", async () => {
		const err = await new Promise<Error | null>((resolve) =>
			publicOnlyLookup("localhost", { all: true }, (error) => resolve(error)),
		);
		expect(err).toBeInstanceOf(UnsafeUrlError);
	});
});

describe("default image probes", () => {
	it("cannot reach a live loopback server by IP or by hostname", async () => {
		let hits = 0;
		const server = createServer((_req, res) => {
			hits++;
			res.writeHead(200, { "content-type": "image/png" }).end();
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const { port } = server.address() as AddressInfo;
		try {
			// Sanity: the server is reachable without the guard.
			expect((await fetch(`http://localhost:${port}/a.png`)).status).toBe(200);
			hits = 0;
			await expect(
				defaultImageHttpProbe(`http://127.0.0.1:${port}/a.png`, { timeoutMs: 2000 }),
			).rejects.toBeInstanceOf(UnsafeUrlError);
			const viaHostname = await defaultImageHttpProbe(`http://localhost:${port}/a.png`, { timeoutMs: 2000 }).catch(
				(error: unknown) => error,
			);
			expect((viaHostname as { cause?: unknown }).cause).toBeInstanceOf(UnsafeUrlError);
			expect(await defaultImageDimensionProbe(`http://localhost:${port}/a.png`, { timeoutMs: 2000 })).toBeNull();
			expect(hits).toBe(0);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});
});
