import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Compile the checked-in model catalog; packaging must not depend on live model discovery.
for (const name of ["tui", "ai", "agent", "travel-agent", "travel-agent-server"]) {
	const framework = ["tui", "ai", "agent"].includes(name);
	const config = framework ? "tsconfig.build.json" : "tsconfig.json";
	const compiler = framework ? "@typescript/native-preview/bin/tsgo.js" : "typescript/bin/tsc";
	execFileSync(process.execPath, [join(root, "node_modules", compiler), "-p", join(root, "packages", name, config)], { cwd: root, stdio: "inherit" });
}
const webRoot = join(root, "packages/travel-agent-web");
const webRequire = createRequire(join(webRoot, "package.json"));
const vite = join(dirname(webRequire.resolve("vite/package.json")), "bin/vite.js");
execFileSync(process.execPath, [vite, "build"], { cwd: webRoot, stdio: "inherit" });
