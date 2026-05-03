import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PythonRuntime } from "../src/core/python-runtime.js";
import { createDescribeDataTool } from "../src/core/tools/describe-data.js";
import { createLoadDataTool } from "../src/core/tools/load-data.js";
import { createQueryDataTool } from "../src/core/tools/query-data.js";

const TEST_DIR = join(tmpdir(), `analytics-tools-test-${Date.now()}`);
const RUNTIME_SCRIPT = join(import.meta.dirname, "..", "src", "python", "runtime.py");
const VENV_PYTHON = join(import.meta.dirname, "..", ".venv", "bin", "python3");
const TEST_TIMEOUT = 15_000;

describe("Analytics Tools", () => {
	let runtime: PythonRuntime;

	beforeAll(async () => {
		mkdirSync(TEST_DIR, { recursive: true });
		runtime = new PythonRuntime({ runtimeScript: RUNTIME_SCRIPT, timeout: 10_000, pythonPath: VENV_PYTHON });
		await runtime.start();

		// Create test CSV
		writeFileSync(
			join(TEST_DIR, "sales.csv"),
			[
				"date,product,region,revenue,quantity",
				"2024-01-15,Widget,North,1200,10",
				"2024-01-20,Gadget,South,800,5",
				"2024-02-10,Widget,North,1500,12",
				"2024-02-15,Gadget,South,900,6",
				"2024-03-01,Widget,East,2000,20",
				"2024-03-10,Gadget,North,1100,8",
				"2024-03-15,Widget,South,,15",
			].join("\n"),
		);
	}, TEST_TIMEOUT);

	afterAll(async () => {
		await runtime.shutdown();
		try {
			rmSync(TEST_DIR, { recursive: true, force: true });
		} catch {}
	});

	describe("load_data", () => {
		it("should load CSV and return schema + sample", { timeout: TEST_TIMEOUT }, async () => {
			const tool = createLoadDataTool(runtime);
			const result = await tool.execute("test-1", { path: join(TEST_DIR, "sales.csv") });

			expect(result.details.name).toBe("sales");
			expect(result.details.shape[0]).toBe(7);
			expect(result.details.shape[1]).toBe(5);

			const text = result.content[0];
			expect(text.type).toBe("text");
			expect((text as any).text).toContain("7 rows × 5 columns");
			expect((text as any).text).toContain("Schema:");
			expect((text as any).text).toContain("revenue");
			expect((text as any).text).toContain("Sample");
		});

		it("should use custom name", { timeout: TEST_TIMEOUT }, async () => {
			const tool = createLoadDataTool(runtime);
			const result = await tool.execute("test-2", {
				path: join(TEST_DIR, "sales.csv"),
				name: "my_sales",
			});

			expect(result.details.name).toBe("my_sales");
		});

		it("should throw on nonexistent file", { timeout: TEST_TIMEOUT }, async () => {
			const tool = createLoadDataTool(runtime);
			await expect(tool.execute("test-3", { path: join(TEST_DIR, "nonexistent.csv") })).rejects.toThrow();
		});
	});

	describe("describe_data", () => {
		it("should return statistical summary", { timeout: TEST_TIMEOUT }, async () => {
			const tool = createDescribeDataTool(runtime);
			const result = await tool.execute("test-4", { name: "sales" });

			const text = (result.content[0] as any).text;
			expect(text).toContain("7 rows");
			expect(text).toContain("Statistical Summary");
			expect(text).toContain("Data Types");
			// revenue has 1 null (last row)
			expect(result.details.nulls.revenue).toBe(1);
			// revenue and quantity are numeric, should have correlations
			expect(result.details.hasCorrelations).toBe(true);
		});

		it("should describe specific columns", { timeout: TEST_TIMEOUT }, async () => {
			const tool = createDescribeDataTool(runtime);
			const result = await tool.execute("test-5", {
				name: "sales",
				columns: ["revenue", "quantity"],
			});

			const text = (result.content[0] as any).text;
			expect(text).toContain("2 columns");
			expect(text).not.toContain("product");
		});

		it("should throw for unknown dataset", { timeout: TEST_TIMEOUT }, async () => {
			const tool = createDescribeDataTool(runtime);
			await expect(tool.execute("test-6", { name: "unknown" })).rejects.toThrow("not found");
		});
	});

	describe("query_data", () => {
		it("should execute pandas expression and return result", { timeout: TEST_TIMEOUT }, async () => {
			const tool = createQueryDataTool(runtime);
			const result = await tool.execute("test-7", {
				code: "sales.groupby('product')['revenue'].sum()",
			});

			const text = (result.content[0] as any).text;
			expect(text).toContain("Gadget");
			expect(text).toContain("Widget");
			expect(result.details.resultType).toBe("series");
		});

		it("should execute statements with print", { timeout: TEST_TIMEOUT }, async () => {
			const tool = createQueryDataTool(runtime);
			const result = await tool.execute("test-8", {
				code: 'print(f"Total rows: {len(sales)}")',
			});

			expect((result.content[0] as any).text).toContain("Total rows: 7");
			expect(result.details.hasStdout).toBe(true);
		});

		it("should register new DataFrames", { timeout: TEST_TIMEOUT }, async () => {
			const tool = createQueryDataTool(runtime);

			// Create a filtered DataFrame
			await tool.execute("test-9", {
				code: "north_sales = sales[sales['region'] == 'North']",
			});

			// Query the new DataFrame
			const result = await tool.execute("test-10", {
				code: "len(north_sales)",
			});

			expect((result.content[0] as any).text).toContain("3");
		});

		it("should handle errors gracefully", { timeout: TEST_TIMEOUT }, async () => {
			const tool = createQueryDataTool(runtime);
			await expect(tool.execute("test-11", { code: "nonexistent_df.head()" })).rejects.toThrow();
		});

		it("should return scalar values", { timeout: TEST_TIMEOUT }, async () => {
			const tool = createQueryDataTool(runtime);
			const result = await tool.execute("test-12", {
				code: "sales['revenue'].mean()",
			});

			const text = (result.content[0] as any).text;
			// Mean of 1200, 800, 1500, 900, 2000, 1100, NaN = 7500/6 = 1250
			expect(text).toContain("1250");
		});
	});
});
