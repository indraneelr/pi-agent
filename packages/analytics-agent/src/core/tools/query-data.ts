/**
 * query_data tool — Execute pandas/Python code on loaded DataFrames.
 *
 * All loaded datasets are available as variables by name.
 * pandas is available as `pd`, numpy as `np`.
 * New DataFrames assigned to variables are automatically registered.
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { PythonRuntime } from "../python-runtime.js";

const queryDataSchema = Type.Object({
	code: Type.String({
		description:
			"Python/pandas code to execute. All loaded datasets are available as variables. " +
			"Use pandas as `pd` and numpy as `np`. " +
			"Expressions return their value; statements execute and capture stdout. " +
			"New DataFrames assigned to variables are automatically registered for later use.",
	}),
});

export type QueryDataInput = Static<typeof queryDataSchema>;

export interface QueryDataDetails {
	resultType: string | null;
	hasStdout: boolean;
}

export function createQueryDataTool(runtime: PythonRuntime): AgentTool<typeof queryDataSchema, QueryDataDetails> {
	return {
		name: "query_data",
		label: "Query Data",
		description:
			"Execute Python/pandas code on loaded datasets. " +
			"All loaded datasets are available as variables (e.g., if you loaded 'sales', use `sales` directly). " +
			"pandas is `pd`, numpy is `np`. " +
			"Use for filtering, grouping, joining, pivoting, computing statistics, and transformations. " +
			"Expressions return their result; use print() for intermediate output. " +
			"New DataFrames assigned to variables are automatically available in future calls.",
		parameters: queryDataSchema,
		async execute(
			_toolCallId: string,
			params: QueryDataInput,
			_signal?: AbortSignal,
		): Promise<AgentToolResult<QueryDataDetails>> {
			const result = await runtime.send({
				type: "exec",
				code: params.code,
			});

			if (!result.ok) {
				throw new Error(result.error ?? "Query execution failed");
			}

			const stdout = result.stdout as string;
			const resultRepr = result.result as string | null;
			const resultType = result.result_type as string | null;

			const parts: string[] = [];

			if (stdout) {
				parts.push(stdout);
			}

			if (resultRepr) {
				if (resultType === "dataframe" || resultType === "series") {
					parts.push(resultRepr);
				} else {
					parts.push(`→ ${resultRepr}`);
				}
			}

			if (parts.length === 0) {
				parts.push("(no output)");
			}

			return {
				content: [{ type: "text", text: parts.join("\n") }],
				details: { resultType, hasStdout: !!stdout },
			};
		},
	};
}
