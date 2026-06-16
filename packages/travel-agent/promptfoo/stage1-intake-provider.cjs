const { existsSync, readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

class Stage1IntakeProvider {
	constructor(options = {}) {
		this.providerId = options.id || "pi-travel-agent-stage1-intake";
		this.config = options.config || {};
	}

	id() {
		return this.providerId;
	}

	async callApi(prompt, context = {}) {
		const cwd = join(__dirname, "..");
		const env = { ...readDotEnv(join(cwd, "..", "..", ".env")), ...readDotEnv(join(cwd, ".env")), ...process.env, ...this.config.env };
		const timeoutMs = Number(this.config.timeoutMs || 120000);
		const payload = JSON.stringify({ prompt, vars: context.vars || {}, config: this.config });
		const result = spawnSync(
			process.execPath,
			["../../node_modules/tsx/dist/cli.mjs", "promptfoo/stage1-intake-runner.ts"],
			{
				cwd,
				input: payload,
				encoding: "utf8",
				env,
				timeout: timeoutMs + 30000,
				maxBuffer: 1024 * 1024 * 20,
			},
		);

		if (result.error) return { error: result.error.message };
		if (result.status !== 0) {
			return {
				error: `stage1-intake-runner exited ${result.status}: ${result.stderr || result.stdout}`,
				output: result.stdout || result.stderr,
			};
		}
		const output = result.stdout.trim();
		try {
			JSON.parse(output);
		} catch (err) {
			return { error: `stage1-intake-runner returned non-JSON output: ${err.message}`, output };
		}

		return { output };
	}
}

function readDotEnv(path) {
	if (!existsSync(path)) return {};
	const env = {};
	for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#") || !line.includes("=")) continue;
		const [key, ...rest] = line.split("=");
		let value = rest.join("=").trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		env[key.trim()] = value;
	}
	return env;
}

module.exports = Stage1IntakeProvider;
