/**
 * Analytics agent tools.
 *
 * Combines analytics-specific tools (load_data, describe_data, query_data, read_document)
 * with coding-agent tools (bash, read, write, grep, find, ls, edit).
 */

export { createDescribeDataTool, type DescribeDataDetails, type DescribeDataInput } from "./describe-data.js";
export { createLoadDataTool, type LoadDataDetails, type LoadDataInput } from "./load-data.js";
export { createQueryDataTool, type QueryDataDetails, type QueryDataInput } from "./query-data.js";
export { createReadDocumentTool, type ReadDocumentDetails, type ReadDocumentInput } from "./read-document.js";

import type { AgentTool } from "@mariozechner/pi-agent-core";
import {
	createBashTool,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
} from "@mariozechner/pi-coding-agent";
import type { PythonRuntime } from "../python-runtime.js";
import { createDescribeDataTool } from "./describe-data.js";
import { createLoadDataTool } from "./load-data.js";
import { createQueryDataTool } from "./query-data.js";
import { createReadDocumentTool } from "./read-document.js";

/** Create all analytics tools: analytics-specific + coding-agent tools. */
export function createAnalyticsTools(runtime: PythonRuntime, cwd?: string): AgentTool[] {
	const workDir = cwd ?? process.cwd();
	// Each createXTool returns a tool typed against its concrete TypeBox
	// schema, e.g. `AgentTool<typeof bashSchema>`. Collecting heterogeneous
	// tools into `AgentTool[]` (whose execute(params) is contravariant)
	// requires a widening cast — without it tsgo rejects the assignment as
	// the function-parameter type narrows to `unknown` at the array element
	// type.
	const tools: AgentTool[] = [
		createLoadDataTool(runtime) as AgentTool,
		createDescribeDataTool(runtime) as AgentTool,
		createQueryDataTool(runtime) as AgentTool,
		createReadDocumentTool(runtime) as AgentTool,
		createBashTool(workDir) as AgentTool,
		createReadTool(workDir) as AgentTool,
		createWriteTool(workDir) as AgentTool,
		createEditTool(workDir) as AgentTool,
		createGrepTool(workDir) as AgentTool,
		createFindTool(workDir) as AgentTool,
		createLsTool(workDir) as AgentTool,
	];
	return tools;
}
