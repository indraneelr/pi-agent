import { readFile, realpath } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import type { FastifyInstance } from "fastify";

/** Serve the built SPA from the API origin so auth cookies work without a proxy. */
export function registerWeb(app: FastifyInstance, directory: string): void {
	const root = resolve(directory);
	const types: Record<string, string> = {
		".js": "text/javascript",
		".css": "text/css",
		".svg": "image/svg+xml",
		".png": "image/png",
		".jpg": "image/jpeg",
		".webp": "image/webp",
		".woff2": "font/woff2",
	};
	app.get("/", async (_request, reply) => {
		return reply
			.header("cache-control", "no-store")
			.type("text/html")
			.send(await readFile(join(root, "index.html")));
	});
	app.get("/assets/*", async (request, reply) => {
		try {
			const assetsRoot = await realpath(join(root, "assets"));
			const path = await realpath(resolve(assetsRoot, (request.params as { "*": string })["*"]));
			if (!path.startsWith(`${assetsRoot}${sep}`) || !types[extname(path)]) return reply.status(404).send();
			return reply
				.header("cache-control", "public, max-age=31536000, immutable")
				.type(types[extname(path)])
				.send(await readFile(path));
		} catch {
			return reply.status(404).send();
		}
	});
}
