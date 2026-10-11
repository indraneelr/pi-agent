/**
 * Outbound fetch for URLs that come from the model or third-party search results.
 *
 * Blocks server-side request forgery: only http(s), only public addresses, and
 * every redirect hop is re-checked. The address check runs inside the socket's
 * DNS lookup, so the IP that is checked is the IP that is connected to (no DNS
 * rebinding window). IP-literal hosts skip DNS, so they are checked up front.
 */

import { lookup as dnsLookup, type LookupAddress, type LookupAllOptions, type LookupOneOptions } from "node:dns";
import { BlockList, isIP } from "node:net";
import { Agent, type RequestInit, type Response, fetch as undiciFetch } from "undici";

export const SAFE_FETCH_MAX_REDIRECTS = 3;

export class UnsafeUrlError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UnsafeUrlError";
	}
}

const blocked = new BlockList();
for (const [network, prefix] of [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 4],
	["240.0.0.0", 4],
] as const) {
	blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
	["::", 128],
	["::1", 128],
	["64:ff9b::", 96],
	["100::", 64],
	["2001:db8::", 32],
	["fc00::", 7],
	["fe80::", 10],
	["ff00::", 8],
] as const) {
	blocked.addSubnet(network, prefix, "ipv6");
}

/** Embedded IPv4 of an IPv4-mapped (::ffff:a.b.c.d / ::ffff:xxxx:xxxx) IPv6 address. */
function mappedIpv4(address: string): string | undefined {
	const lower = address.toLowerCase();
	const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
	if (dotted) return dotted[1];
	const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
	if (!hex) return undefined;
	const high = Number.parseInt(hex[1], 16);
	const low = Number.parseInt(hex[2], 16);
	return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

/** True when an IP address is loopback, private, link-local, CGNAT, reserved or otherwise non-public. */
export function isNonPublicAddress(address: string): boolean {
	const family = isIP(address);
	if (family === 4) return blocked.check(address, "ipv4");
	if (family !== 6) return true;
	const v4 = mappedIpv4(address);
	if (v4) return blocked.check(v4, "ipv4");
	return blocked.check(address, "ipv6");
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** DNS lookup for sockets that refuses to resolve to a non-public address. */
export function publicOnlyLookup(
	hostname: string,
	options: LookupOneOptions | LookupAllOptions,
	callback: LookupCallback,
): void {
	dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
		if (err) return callback(err, []);
		const bad = addresses.find((entry) => isNonPublicAddress(entry.address));
		if (bad || addresses.length === 0) {
			return callback(new UnsafeUrlError(`Refusing non-public address for ${hostname}`), []);
		}
		if (options.all) return callback(null, addresses);
		callback(null, addresses[0].address, addresses[0].family);
	});
}

const publicOnlyAgent = new Agent({ connect: { lookup: publicOnlyLookup } });

/** Throw unless the URL is http(s) and, when its host is an IP literal, that IP is public. */
export function assertSafeUrl(url: string): URL {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new UnsafeUrlError("Invalid URL");
	}
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		throw new UnsafeUrlError(`Unsupported URL scheme: ${parsed.protocol}`);
	}
	if (parsed.username || parsed.password) throw new UnsafeUrlError("URLs with credentials are not allowed");
	const host = parsed.hostname.replace(/^\[|\]$/g, "");
	if (isIP(host) && isNonPublicAddress(host)) throw new UnsafeUrlError(`Refusing non-public address ${host}`);
	return parsed;
}

export interface SafeFetchResult {
	response: Response;
	/** URL of the last hop after following redirects. */
	finalUrl: string;
}

export type SafeFetchTransport = (url: string, init: RequestInit) => Promise<Response>;

const defaultTransport: SafeFetchTransport = (url, init) => undiciFetch(url, { ...init, dispatcher: publicOnlyAgent });

/**
 * Fetch a model/search-supplied URL. Redirects are followed manually (at most
 * SAFE_FETCH_MAX_REDIRECTS hops) and every hop is re-validated.
 */
export async function safeFetch(
	url: string,
	init: Omit<RequestInit, "redirect" | "dispatcher"> = {},
	transport: SafeFetchTransport = defaultTransport,
): Promise<SafeFetchResult> {
	let current = assertSafeUrl(url);
	for (let hop = 0; ; hop++) {
		const response = await transport(current.href, { ...init, redirect: "manual" });
		const location = response.headers.get("location");
		if (response.status < 300 || response.status >= 400 || !location) {
			return { response, finalUrl: current.href };
		}
		await response.body?.cancel();
		if (hop >= SAFE_FETCH_MAX_REDIRECTS) throw new UnsafeUrlError("Too many redirects");
		current = assertSafeUrl(new URL(location, current).href);
	}
}
