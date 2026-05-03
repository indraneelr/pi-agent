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
export function createAnalyticsTools(runtime: PythonRuntime, cwd?: string): AgentTool<any>[] {
	const workDir = cwd ?? process.cwd();
	return [
		// Analytics-specific tools
		createLoadDataTool(runtime),
		createDescribeDataTool(runtime),
		createQueryDataTool(runtime),
		createReadDocumentTool(runtime),
		// Coding-agent tools
		createBashTool(workDir),
		createReadTool(workDir),
		createWriteTool(workDir),
		createEditTool(workDir),
		createGrepTool(workDir),
		createFindTool(workDir),
		createLsTool(workDir),
	];
}
