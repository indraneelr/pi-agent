import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PythonRuntime } from "../src/core/python-runtime.js";
import { createReadDocumentTool } from "../src/core/tools/read-document.js";

const TEST_DIR = join(tmpdir(), `analytics-readdoc-test-${Date.now()}`);
const RUNTIME_SCRIPT = join(import.meta.dirname, "..", "src", "python", "runtime.py");
const VENV_PYTHON = join(import.meta.dirname, "..", ".venv", "bin", "python3");
const TEST_TIMEOUT = 15_000;

describe("read_document tool", () => {
	let runtime: PythonRuntime;

	beforeAll(async () => {
		mkdirSync(TEST_DIR, { recursive: true });
		runtime = new PythonRuntime({ runtimeScript: RUNTIME_SCRIPT, timeout: 10_000, pythonPath: VENV_PYTHON });
		await runtime.start();
	}, TEST_TIMEOUT);

	afterAll(async () => {
		await runtime.shutdown();
		try {
			rmSync(TEST_DIR, { recursive: true, force: true });
		} catch {}
	});

	it("should read a plain text file", { timeout: TEST_TIMEOUT }, async () => {
		const txtPath = join(TEST_DIR, "report.txt");
		writeFileSync(txtPath, "Quarterly Report\n\nRevenue increased by 15% in Q3.\nNew markets opened in Asia.");

		const tool = createReadDocumentTool(runtime);
		const result = await tool.execute("test-1", { path: txtPath });

		expect(result.details.format).toBe("txt");
		expect(result.details.wordCount).toBeGreaterThan(5);
		expect((result.content[0] as any).text).toContain("Quarterly Report");
		expect((result.content[0] as any).text).toContain("Revenue increased");
	});

	it("should read a markdown file", { timeout: TEST_TIMEOUT }, async () => {
		const mdPath = join(TEST_DIR, "notes.md");
		writeFileSync(mdPath, "# Analysis Notes\n\n- Revenue is trending up\n- Customer churn decreased");

		const tool = createReadDocumentTool(runtime);
		const result = await tool.execute("test-2", { path: mdPath });

		expect(result.details.format).toBe("md");
		expect((result.content[0] as any).text).toContain("Analysis Notes");
	});

	it("should throw on unsupported format", { timeout: TEST_TIMEOUT }, async () => {
		const binPath = join(TEST_DIR, "data.xyz");
		writeFileSync(binPath, "binary data");

		const tool = createReadDocumentTool(runtime);
		await expect(tool.execute("test-3", { path: binPath })).rejects.toThrow("Unsupported");
	});

	it("should throw on nonexistent file", { timeout: TEST_TIMEOUT }, async () => {
		const tool = createReadDocumentTool(runtime);
		await expect(tool.execute("test-4", { path: join(TEST_DIR, "ghost.pdf") })).rejects.toThrow();
	});
});
