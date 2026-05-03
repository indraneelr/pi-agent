import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PythonRuntime } from "../src/core/python-runtime.js";

// Python startup with pandas import takes ~5s on cold start
const TEST_TIMEOUT = 15_000;

const TEST_DIR = join(tmpdir(), `analytics-agent-test-${Date.now()}`);
const RUNTIME_SCRIPT = join(import.meta.dirname, "..", "src", "python", "runtime.py");
const VENV_PYTHON = join(import.meta.dirname, "..", ".venv", "bin", "python3");

describe("PythonRuntime", () => {
	let runtime: PythonRuntime;

	beforeAll(() => {
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterEach(async () => {
		if (runtime?.isRunning) {
			await runtime.shutdown();
		}
	});

	afterAll(() => {
		try {
			rmSync(TEST_DIR, { recursive: true, force: true });
		} catch {}
	});

	it("should start and respond to ping", { timeout: TEST_TIMEOUT }, async () => {
		runtime = new PythonRuntime({ runtimeScript: RUNTIME_SCRIPT, timeout: 10_000, pythonPath: VENV_PYTHON });
		await runtime.start();
		expect(runtime.isRunning).toBe(true);

		const ok = await runtime.ping();
		expect(ok).toBe(true);
	});

	it("should load a CSV file and return schema", { timeout: TEST_TIMEOUT }, async () => {
		// Create a test CSV
		const csvPath = join(TEST_DIR, "test.csv");
		writeFileSync(csvPath, "name,age,salary\nAlice,30,70000\nBob,25,55000\nCharlie,35,90000\n");

		runtime = new PythonRuntime({ runtimeScript: RUNTIME_SCRIPT, timeout: 10_000, pythonPath: VENV_PYTHON });
		await runtime.start();

		const result = await runtime.send({
			type: "load",
			path: csvPath,
			name: "employees",
		});

		expect(result.ok).toBe(true);
		expect(result.name).toBe("employees");
		expect(result.shape).toEqual([3, 3]);
		expect(result.schema).toBeInstanceOf(Array);
		expect((result.schema as Array<{ name: string }>).map((s) => s.name)).toEqual(["name", "age", "salary"]);
		expect(result.sample).toBeDefined();
		expect(result.memory).toBeDefined();
	});

	it("should execute pandas code on loaded data", { timeout: TEST_TIMEOUT }, async () => {
		const csvPath = join(TEST_DIR, "exec_test.csv");
		writeFileSync(
			csvPath,
			"product,revenue,quantity\nWidget,1000,10\nGadget,2000,5\nWidget,1500,15\nGadget,3000,8\n",
		);

		runtime = new PythonRuntime({ runtimeScript: RUNTIME_SCRIPT, timeout: 10_000, pythonPath: VENV_PYTHON });
		await runtime.start();

		// Load data
		await runtime.send({ type: "load", path: csvPath, name: "sales" });

		// Execute a query
		const result = await runtime.send({
			type: "exec",
			code: "sales.groupby('product')['revenue'].sum()",
		});

		expect(result.ok).toBe(true);
		expect(result.result_type).toBe("series");
		expect(result.result).toContain("Gadget");
		expect(result.result).toContain("Widget");
	});

	it("should describe a loaded dataset", { timeout: TEST_TIMEOUT }, async () => {
		const csvPath = join(TEST_DIR, "describe_test.csv");
		writeFileSync(csvPath, "x,y,label\n1,10,A\n2,20,B\n3,,A\n4,40,B\n5,50,A\n");

		runtime = new PythonRuntime({ runtimeScript: RUNTIME_SCRIPT, timeout: 10_000, pythonPath: VENV_PYTHON });
		await runtime.start();

		await runtime.send({ type: "load", path: csvPath, name: "data" });

		const result = await runtime.send({ type: "describe", name: "data" });

		expect(result.ok).toBe(true);
		expect(result.summary).toContain("Shape");
		expect(result.summary).toContain("5 rows");
		expect(result.summary).toContain("Statistical Summary");
		// y has one null
		expect((result.nulls as Record<string, number>).y).toBe(1);
	});

	it("should list loaded datasets", { timeout: TEST_TIMEOUT }, async () => {
		const csvPath = join(TEST_DIR, "list_test.csv");
		writeFileSync(csvPath, "a,b\n1,2\n3,4\n");

		runtime = new PythonRuntime({ runtimeScript: RUNTIME_SCRIPT, timeout: 10_000, pythonPath: VENV_PYTHON });
		await runtime.start();

		await runtime.send({ type: "load", path: csvPath, name: "ds1" });
		await runtime.send({ type: "load", path: csvPath, name: "ds2" });

		const result = await runtime.listDatasets();

		expect(result.ok).toBe(true);
		const datasets = result.datasets as Array<{ name: string }>;
		expect(datasets.map((d) => d.name).sort()).toEqual(["ds1", "ds2"]);
	});

	it("should register new DataFrames created in exec", { timeout: TEST_TIMEOUT }, async () => {
		const csvPath = join(TEST_DIR, "register_test.csv");
		writeFileSync(csvPath, "a,b\n1,2\n3,4\n5,6\n");

		runtime = new PythonRuntime({ runtimeScript: RUNTIME_SCRIPT, timeout: 10_000, pythonPath: VENV_PYTHON });
		await runtime.start();

		await runtime.send({ type: "load", path: csvPath, name: "raw" });

		// Create a new DataFrame in exec
		await runtime.send({
			type: "exec",
			code: "filtered = raw[raw['a'] > 2]",
		});

		// Check it's registered
		const list = await runtime.listDatasets();
		const names = (list.datasets as Array<{ name: string }>).map((d) => d.name);
		expect(names).toContain("filtered");
	});

	it("should return error for unknown dataset in describe", { timeout: TEST_TIMEOUT }, async () => {
		runtime = new PythonRuntime({ runtimeScript: RUNTIME_SCRIPT, timeout: 10_000, pythonPath: VENV_PYTHON });
		await runtime.start();

		const result = await runtime.send({ type: "describe", name: "nonexistent" });

		expect(result.ok).toBe(false);
		expect(result.error).toContain("not found");
	});

	it("should handle exec errors gracefully", { timeout: TEST_TIMEOUT }, async () => {
		runtime = new PythonRuntime({ runtimeScript: RUNTIME_SCRIPT, timeout: 10_000, pythonPath: VENV_PYTHON });
		await runtime.start();

		const result = await runtime.send({
			type: "exec",
			code: "1/0",
		});

		expect(result.ok).toBe(false);
		expect(result.error).toContain("ZeroDivisionError");
	});

	it("should shut down gracefully", { timeout: TEST_TIMEOUT }, async () => {
		runtime = new PythonRuntime({ runtimeScript: RUNTIME_SCRIPT, timeout: 10_000, pythonPath: VENV_PYTHON });
		await runtime.start();
		expect(runtime.isRunning).toBe(true);

		await runtime.shutdown();
		expect(runtime.isRunning).toBe(false);
	});
});
