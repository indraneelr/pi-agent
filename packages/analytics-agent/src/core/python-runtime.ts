/**
 * Python Runtime Manager
 *
 * Manages a persistent Python subprocess that holds DataFrames in memory.
 * Communicates via JSON-over-stdin/stdout protocol.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { createInterface, type Interface } from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNTIME_SCRIPT = join(__dirname, "..", "python", "runtime.py");

export interface PythonRuntimeOptions {
	/** Path to Python executable. Default: "python3" */
	pythonPath?: string;
	/** Timeout for commands in milliseconds. Default: 120_000 (2 min) */
	timeout?: number;
	/** Path to the runtime.py script. Default: bundled runtime.py */
	runtimeScript?: string;
}

export interface RuntimeResponse {
	id?: string;
	ok: boolean;
	error?: string;
	[key: string]: unknown;
}

type PendingRequest = {
	resolve: (value: RuntimeResponse) => void;
	reject: (reason: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};

export class PythonRuntime {
	private process: ChildProcess | null = null;
	private readline: Interface | null = null;
	private pending = new Map<string, PendingRequest>();
	private ready = false;
	private readyPromise: Promise<void> | null = null;
	private pythonPath: string;
	private timeout: number;
	private runtimeScript: string;
	private disposed = false;

	constructor(options: PythonRuntimeOptions = {}) {
		this.pythonPath = options.pythonPath ?? "python3";
		this.timeout = options.timeout ?? 120_000;
		this.runtimeScript = options.runtimeScript ?? RUNTIME_SCRIPT;
	}

	/**
	 * Start the Python runtime subprocess.
	 * Resolves when the runtime signals readiness.
	 */
	async start(): Promise<void> {
		if (this.process) {
			return;
		}

		this.readyPromise = new Promise<void>((resolve, reject) => {
			const proc = spawn(this.pythonPath, ["-u", this.runtimeScript], {
				stdio: ["pipe", "pipe", "pipe"],
				env: {
					...process.env,
					PYTHONUNBUFFERED: "1",
				},
			});

			this.process = proc;

			// Collect stderr for error reporting
			let stderrBuffer = "";
			proc.stderr?.on("data", (data: Buffer) => {
				stderrBuffer += data.toString();
				// Keep last 4KB of stderr
				if (stderrBuffer.length > 4096) {
					stderrBuffer = stderrBuffer.slice(-4096);
				}
			});

			proc.on("error", (err) => {
				this.cleanup();
				reject(new Error(`Failed to start Python runtime: ${err.message}`));
			});

			proc.on("exit", (code) => {
				const wasReady = this.ready;
				this.cleanup();
				if (!wasReady) {
					const detail = stderrBuffer.trim();
					reject(new Error(`Python runtime exited with code ${code} before ready.${detail ? `\n${detail}` : ""}`));
				}
				// Reject all pending requests
				for (const [id, req] of this.pending) {
					clearTimeout(req.timer);
					req.reject(new Error(`Python runtime exited with code ${code}`));
					this.pending.delete(id);
				}
			});

			this.readline = createInterface({ input: proc.stdout! });

			this.readline.on("line", (line: string) => {
				let msg: RuntimeResponse;
				try {
					msg = JSON.parse(line);
				} catch {
					return;
				}

				// Handle the initial ready signal
				if ((msg as { type?: string }).type === "ready" && !this.ready) {
					this.ready = true;
					resolve();
					return;
				}

				// Match response to pending request
				const id = msg.id;
				if (id && this.pending.has(id)) {
					const req = this.pending.get(id)!;
					this.pending.delete(id);
					clearTimeout(req.timer);
					req.resolve(msg);
				}
			});
		});

		return this.readyPromise;
	}

	/**
	 * Send a command to the Python runtime and wait for a response.
	 */
	async send(command: Record<string, unknown>): Promise<RuntimeResponse> {
		if (this.disposed) {
			throw new Error("Python runtime has been disposed");
		}

		if (!this.process || !this.ready) {
			await this.start();
		}

		const id = randomUUID();
		const msg = { ...command, id };

		return new Promise<RuntimeResponse>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Python runtime command timed out after ${this.timeout}ms`));
			}, this.timeout);

			this.pending.set(id, { resolve, reject, timer });

			try {
				this.process!.stdin!.write(`${JSON.stringify(msg)}\n`);
			} catch (err) {
				this.pending.delete(id);
				clearTimeout(timer);
				reject(new Error(`Failed to send command to Python runtime: ${err}`));
			}
		});
	}

	/**
	 * Check if the runtime is running and responsive.
	 */
	async ping(): Promise<boolean> {
		try {
			const result = await this.send({ type: "ping" });
			return result.ok === true;
		} catch {
			return false;
		}
	}

	/**
	 * List all loaded datasets.
	 */
	async listDatasets(): Promise<RuntimeResponse> {
		return this.send({ type: "list" });
	}

	/**
	 * Gracefully shut down the Python runtime.
	 */
	async shutdown(): Promise<void> {
		if (!this.process || this.disposed) {
			return;
		}

		try {
			await this.send({ type: "shutdown" });
		} catch {
			// Process may already be gone
		}

		this.cleanup();
	}

	/**
	 * Dispose the runtime (non-graceful if needed).
	 */
	dispose(): void {
		this.disposed = true;
		if (this.process) {
			this.process.kill("SIGTERM");
			this.cleanup();
		}
	}

	get isRunning(): boolean {
		return this.process !== null && this.ready;
	}

	private cleanup(): void {
		this.ready = false;
		if (this.readline) {
			this.readline.close();
			this.readline = null;
		}
		if (this.process) {
			this.process.stdin?.end();
			this.process = null;
		}
	}
}
