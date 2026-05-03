/**
 * read_document tool — Extract text from PDF, DOCX, and text files.
 *
 * Uses pdfplumber for PDFs and python-docx for Word documents.
 * Supports page-range selection for PDFs (e.g., "1-5", "3", "1,3,5").
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { PythonRuntime } from "../python-runtime.js";

const readDocumentSchema = Type.Object({
	path: Type.String({ description: "Path to the document (PDF, DOCX, TXT, MD)" }),
	pages: Type.Optional(
		Type.String({
			description: 'Page range for PDFs (e.g., "1-5", "3", "1,3,5-8"). Omit to read all pages.',
		}),
	),
});

export type ReadDocumentInput = Static<typeof readDocumentSchema>;

export interface ReadDocumentDetails {
	format: string;
	wordCount: number;
	metadata: Record<string, unknown>;
}

export function createReadDocumentTool(
	runtime: PythonRuntime,
): AgentTool<typeof readDocumentSchema, ReadDocumentDetails> {
	return {
		name: "read_document",
		label: "Read Document",
		description:
			"Extract text from documents. Supports PDF (with page selection), DOCX (Word), and plain text files. " +
			"For PDFs, you can specify page ranges like '1-5' or '2,4,6'. " +
			"Use this to read reports, papers, contracts, and other documents for analysis.",
		parameters: readDocumentSchema,
		async execute(
			_toolCallId: string,
			params: ReadDocumentInput,
			_signal?: AbortSignal,
		): Promise<AgentToolResult<ReadDocumentDetails>> {
			const result = await runtime.send({
				type: "read_document",
				path: params.path,
				pages: params.pages,
			});

			if (!result.ok) {
				throw new Error(result.error ?? "Failed to read document");
			}

			const text = result.text as string;
			const metadata = result.metadata as Record<string, unknown>;
			const format = (metadata.format as string) ?? "unknown";
			const wordCount = (metadata.word_count as number) ?? 0;

			// Build a summary header
			const headerParts = [`Document (${format}): ${wordCount} words`];
			if (metadata.total_pages) {
				headerParts.push(`${metadata.pages_read}/${metadata.total_pages} pages`);
			}
			if (metadata.paragraphs) {
				headerParts.push(`${metadata.paragraphs} paragraphs`);
			}

			const output = `${headerParts.join(" | ")}\n\n${text}`;

			return {
				content: [{ type: "text", text: output }],
				details: { format, wordCount, metadata },
			};
		},
	};
}
