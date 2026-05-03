/**
 * describe_data tool — Get a comprehensive statistical summary of a loaded dataset.
 *
 * Returns shape, dtypes, descriptive statistics, null counts, unique counts,
 * and correlations for numeric columns.
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { PythonRuntime } from "../python-runtime.js";

const describeDataSchema = Type.Object({
	name: Type.String({ description: "Name of the loaded dataset to describe" }),
	columns: Type.Optional(
		Type.Array(Type.String(), { description: "Specific columns to describe (default: all columns)" }),
	),
});

export type DescribeDataInput = Static<typeof describeDataSchema>;

export interface DescribeDataDetails {
	nulls: Record<string, number>;
	hasCorrelations: boolean;
}

export function createDescribeDataTool(
	runtime: PythonRuntime,
): AgentTool<typeof describeDataSchema, DescribeDataDetails> {
	return {
		name: "describe_data",
		label: "Describe Data",
		description:
			"Get a comprehensive statistical summary of a loaded dataset. " +
			"Returns shape, data types, descriptive statistics (mean, std, min, max, quartiles), " +
			"null counts with percentages, unique value counts, and correlations for numeric columns. " +
			"Use this as the first step after loading data to understand its structure.",
		parameters: describeDataSchema,
		async execute(
			_toolCallId: string,
			params: DescribeDataInput,
			_signal?: AbortSignal,
		): Promise<AgentToolResult<DescribeDataDetails>> {
			const result = await runtime.send({
				type: "describe",
				name: params.name,
				columns: params.columns,
			});

			if (!result.ok) {
				throw new Error(result.error ?? "Failed to describe dataset");
			}

			const summary = result.summary as string;
			const nulls = (result.nulls as Record<string, number>) ?? {};
			const correlations = result.correlations as string | null;

			const parts = [summary];
			if (correlations) {
				parts.push("=== Correlations ===");
				parts.push(correlations);
			}

			return {
				content: [{ type: "text", text: parts.join("\n") }],
				details: { nulls, hasCorrelations: !!correlations },
			};
		},
	};
}
