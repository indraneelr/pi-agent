/**
 * System prompt for the analytics agent.
 */

export interface AnalyticsSystemPromptOptions {
	/** Additional guidelines to append. */
	guidelines?: string[];
	/** Text to append to the system prompt. */
	appendSystemPrompt?: string;
	/** Working directory. Default: process.cwd() */
	cwd?: string;
	/** Context files (e.g., AGENTS.md) content. */
	contextFiles?: Array<{ path: string; content: string }>;
}

export function buildAnalyticsSystemPrompt(options: AnalyticsSystemPromptOptions = {}): string {
	const cwd = (options.cwd ?? process.cwd()).replace(/\\/g, "/");
	const date = new Date().toISOString().slice(0, 10);

	const defaultGuidelines = [
		"Always load data with load_data before analyzing it",
		"Use describe_data first to understand the dataset structure, types, and quality",
		"Prefer query_data for transformations, filtering, grouping, and statistical analysis",
		"Generate visualizations to support insights (Phase 2: visualize tool)",
		"Present findings in clear, structured markdown with specific numbers",
		"When working with large datasets, check shape and sample first before heavy operations",
		"Save important results and charts with write",
		"Use grep/find/ls to explore available data files before loading",
		"Handle missing data explicitly — report null counts and decide on strategy (drop, fill, etc.)",
		"Prefer read for text files, log files, and configuration; use load_data for structured data",
	];

	const allGuidelines = [...defaultGuidelines, ...(options.guidelines ?? [])];

	let prompt = `You are an expert data analyst operating inside an analytics agent. You help users by loading data files, running analyses, generating visualizations, and producing insights.

Available tools:
- load_data: Load CSV/XLS/JSON/Parquet into a named DataFrame for analysis
- describe_data: Get statistical summary of a loaded DataFrame (shape, types, stats, nulls, correlations)
- query_data: Run Python/pandas code on loaded DataFrames (filtering, grouping, joins, statistics)
- read_document: Extract text from PDF, DOCX, and text files (with page selection for PDFs)
- read: Read text files and images
- bash: Run shell commands (install packages, download data, etc.)
- grep: Search file contents for patterns
- find: Find files by glob pattern
- ls: List directory contents
- write: Save files (reports, transformed data, markdown summaries)

Guidelines:
${allGuidelines.map((g) => `- ${g}`).join("\n")}`;

	if (options.appendSystemPrompt) {
		prompt += `\n\n${options.appendSystemPrompt}`;
	}

	if (options.contextFiles && options.contextFiles.length > 0) {
		prompt += "\n\n# Project Context\n\nProject-specific instructions and guidelines:\n\n";
		for (const { path, content } of options.contextFiles) {
			prompt += `## ${path}\n\n${content}\n\n`;
		}
	}

	prompt += `\nCurrent date: ${date}`;
	prompt += `\nCurrent working directory: ${cwd}`;

	return prompt;
}
