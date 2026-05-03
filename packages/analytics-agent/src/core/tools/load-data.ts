/**
 * load_data tool — Load structured data files into the Python runtime.
 *
 * Supports CSV, TSV, XLS, XLSX, JSON, Parquet.
 * Returns schema, shape, sample rows, and memory usage.
 * Stores the DataFrame in the Python runtime registry under `name`.
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { PythonRuntime } from "../python-runtime.js";

const loadDataSchema = Type.Object({
	path: Type.String({ description: "Path to the data file (CSV, TSV, XLS, XLSX, JSON, Parquet)" }),
	name: Type.Optional(Type.String({ description: "Name for the dataset (defaults to filename without extension)" })),
	sheet: Type.Optional(Type.String({ description: "Sheet name for Excel files (default: first sheet)" })),
	encoding: Type.Optional(Type.String({ description: "File encoding (default: utf-8)" })),
});

export type LoadDataInput = Static<typeof loadDataSchema>;

export interface LoadDataDetails {
	name: string;
	shape: [number, number];
	memory: string;
}

export function createLoadDataTool(runtime: PythonRuntime): AgentTool<typeof loadDataSchema, LoadDataDetails> {
	return {
		name: "load_data",
		label: "Load Data",
		description:
			"Load a data file (CSV, TSV, XLS, XLSX, JSON, Parquet) into a named DataFrame for analysis. " +
			"Returns the schema (column names, types, null counts), shape, sample rows, and memory usage. " +
			"The dataset is available by name in subsequent query_data and describe_data calls.",
		parameters: loadDataSchema,
		async execute(
			_toolCallId: string,
			params: LoadDataInput,
			_signal?: AbortSignal,
		): Promise<AgentToolResult<LoadDataDetails>> {
			const result = await runtime.send({
				type: "load",
				path: params.path,
				name: params.name,
				sheet: params.sheet,
				encoding: params.encoding,
			});

			if (!result.ok) {
				throw new Error(result.error ?? "Failed to load data");
			}

			const schema = result.schema as Array<{ name: string; dtype: string; nulls: number; unique: number }>;
			const shape = result.shape as [number, number];
			const sample = result.sample as string;
			const memory = result.memory as string;
			const name = result.name as string;

			// Format schema as a readable table
			const schemaLines = schema.map(
				(col) => `  ${col.name}: ${col.dtype} (${col.nulls} nulls, ${col.unique} unique)`,
			);

			const text = [
				`Loaded "${name}" — ${shape[0]} rows × ${shape[1]} columns (${memory})`,
				"",
				"Schema:",
				...schemaLines,
				"",
				"Sample (first 5 rows):",
				sample,
			].join("\n");

			return {
				content: [{ type: "text", text }],
				details: { name, shape, memory },
			};
		},
	};
}
