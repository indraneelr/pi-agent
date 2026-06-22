/** Validate image candidates and ensure dimensions are known. */

import { type ValidateImageUrlsOptions, validateImageUrls } from "../image-validation.js";
import type { ImageCandidate, ValidImageResult } from "./types.js";

export interface ValidateImageCandidatesOptions {
	minHeight: number;
	maxHeight: number | null;
	limit: number;
	validate?: ValidateImageUrlsOptions;
	dimensionProbe?: ImageDimensionProbe;
	signal?: AbortSignal;
}

export interface ImageDimensions {
	width: number;
	height: number;
}

export type ImageDimensionProbe = (
	url: string,
	opts: { timeoutMs: number; signal?: AbortSignal },
) => Promise<ImageDimensions | null>;

export interface ValidateImageCandidatesResult {
	images: ValidImageResult[];
	rejectedCount: number;
}

export async function validateImageCandidates(
	candidates: ImageCandidate[],
	options: ValidateImageCandidatesOptions,
): Promise<ValidateImageCandidatesResult> {
	const deduped = dedupeCandidates(candidates);
	const urls = deduped.map((c) => c.url);
	const validation = await validateImageUrls(urls, { ...(options.validate ?? {}), signal: options.signal });
	const byUrl = new Map(validation.map((r) => [r.url, r]));
	const probe = options.dimensionProbe ?? defaultImageDimensionProbe;
	const timeoutMs = options.validate?.timeoutMs ?? 12_000;

	const images: ValidImageResult[] = [];
	let rejectedCount = 0;
	const retrievedAt = new Date().toISOString();

	for (const candidate of deduped) {
		if (images.length >= options.limit) break;
		const result = byUrl.get(candidate.url);
		if (!result?.ok) {
			rejectedCount++;
			continue;
		}

		let width = finitePositive(candidate.width) ? Math.round(candidate.width!) : undefined;
		let height = finitePositive(candidate.height) ? Math.round(candidate.height!) : undefined;
		if (!width || !height) {
			const probed = await probe(candidate.url, { timeoutMs, signal: options.signal });
			width = probed?.width;
			height = probed?.height;
		}

		if (!width || !height) {
			rejectedCount++;
			continue;
		}
		if (height < options.minHeight) {
			rejectedCount++;
			continue;
		}
		if (options.maxHeight !== null && height > options.maxHeight) {
			rejectedCount++;
			continue;
		}

		const validatedAt = new Date().toISOString();
		images.push({
			url: candidate.url,
			width,
			height,
			title: candidate.title,
			source: candidate.source,
			evidence: {
				kind: "image",
				url: candidate.url,
				finalUrl: candidate.url,
				provider: "validator",
				source: candidate.source,
				title: candidate.title,
				retrievedAt,
				validatedAt,
				httpStatus: result.status,
				contentType: result.contentType,
				width,
				height,
				validationStatus: "valid",
			},
		});
	}

	// Count valid-but-over-limit as rejected because they were not returned.
	rejectedCount += Math.max(0, deduped.length - validation.length);
	return { images, rejectedCount };
}

function dedupeCandidates(candidates: ImageCandidate[]): ImageCandidate[] {
	const seen = new Set<string>();
	const out: ImageCandidate[] = [];
	for (const candidate of candidates) {
		const url = normalizeUrl(candidate.url);
		if (!url || seen.has(url)) continue;
		seen.add(url);
		out.push({ ...candidate, url });
	}
	return out;
}

function normalizeUrl(url: string | undefined): string | null {
	const trimmed = url?.trim();
	if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;
	return trimmed;
}

function finitePositive(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export const defaultImageDimensionProbe: ImageDimensionProbe = async (url, { timeoutMs, signal }) => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const onAbort = () => controller.abort();
	signal?.addEventListener("abort", onAbort, { once: true });
	try {
		const res = await fetch(url, {
			headers: {
				"user-agent": "PiTravelAgent/1.0 (image-dimension-probe)",
				accept: "image/*",
				range: "bytes=0-262143",
			},
			redirect: "follow",
			signal: controller.signal,
		});
		if (!res.ok && res.status !== 206) return null;
		const reader = res.body?.getReader();
		if (!reader) return null;
		const chunks: Uint8Array[] = [];
		let total = 0;
		while (total < 262_144) {
			const { done, value } = await reader.read();
			if (done || !value) break;
			chunks.push(value);
			total += value.byteLength;
			const parsed = parseImageDimensions(Buffer.concat(chunks, total));
			if (parsed) {
				await reader.cancel().catch(() => undefined);
				return parsed;
			}
		}
		return parseImageDimensions(Buffer.concat(chunks, total));
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", onAbort);
	}
};

export function parseImageDimensions(buffer: Uint8Array): ImageDimensions | null {
	if (buffer.length < 10) return null;
	// PNG: signature + IHDR width/height.
	if (buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
		return { width: readU32(buffer, 16), height: readU32(buffer, 20) };
	}
	// GIF: logical screen width/height.
	if (buffer.length >= 10 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
		return { width: readU16LE(buffer, 6), height: readU16LE(buffer, 8) };
	}
	// JPEG: scan SOF markers.
	if (buffer[0] === 0xff && buffer[1] === 0xd8) {
		let offset = 2;
		while (offset + 9 < buffer.length) {
			if (buffer[offset] !== 0xff) {
				offset++;
				continue;
			}
			const marker = buffer[offset + 1];
			const length = readU16(buffer, offset + 2);
			if (length < 2) return null;
			if (isJpegSof(marker) && offset + 8 < buffer.length) {
				return { height: readU16(buffer, offset + 5), width: readU16(buffer, offset + 7) };
			}
			offset += 2 + length;
		}
	}
	// WebP RIFF container.
	if (buffer.length >= 30 && ascii(buffer, 0, 4) === "RIFF" && ascii(buffer, 8, 4) === "WEBP") {
		const chunk = ascii(buffer, 12, 4);
		if (chunk === "VP8X" && buffer.length >= 30) {
			return { width: readUInt24LE(buffer, 24) + 1, height: readUInt24LE(buffer, 27) + 1 };
		}
		if (chunk === "VP8 " && buffer.length >= 30) {
			return { width: readU16LE(buffer, 26) & 0x3fff, height: readU16LE(buffer, 28) & 0x3fff };
		}
		if (chunk === "VP8L" && buffer.length >= 25) {
			const b0 = buffer[21],
				b1 = buffer[22],
				b2 = buffer[23],
				b3 = buffer[24];
			return {
				width: 1 + (((b1 & 0x3f) << 8) | b0),
				height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
			};
		}
	}
	return null;
}

function isJpegSof(marker: number): boolean {
	return marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
}
function readU16(buffer: Uint8Array, offset: number): number {
	return (buffer[offset] << 8) | buffer[offset + 1];
}
function readU16LE(buffer: Uint8Array, offset: number): number {
	return buffer[offset] | (buffer[offset + 1] << 8);
}
function readU32(buffer: Uint8Array, offset: number): number {
	return ((buffer[offset] << 24) | (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3]) >>> 0;
}
function readUInt24LE(buffer: Uint8Array, offset: number): number {
	return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}
function ascii(buffer: Uint8Array, offset: number, length: number): string {
	return Buffer.from(buffer.subarray(offset, offset + length)).toString("ascii");
}
