import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { completeSimple } from "@earendil-works/pi-ai";
import type { ServerConfig } from "./config.js";
import { resolveTravelModel } from "./model.js";

export interface CredentialMetadata {
	id: string;
	provider: string;
	label: string;
	createdAt: string;
	updatedAt: string;
	lastValidatedAt?: string;
	status: "untested" | "valid" | "invalid";
}

interface StoredCredential extends CredentialMetadata {
	encryptedApiKey: string;
}

interface CredentialFile {
	credentials: StoredCredential[];
}

export interface CredentialInput {
	provider: string;
	label?: string;
	apiKey: string;
}

export class CredentialNotFoundError extends Error {
	constructor(public readonly credentialId: string) {
		super(`Credential not found: ${credentialId}`);
		this.name = "CredentialNotFoundError";
	}
}

export class CredentialStore {
	constructor(private readonly config: ServerConfig) {}

	list(userId: string): CredentialMetadata[] {
		return this.readFile(userId).credentials.map(toMetadata);
	}

	create(userId: string, input: CredentialInput): CredentialMetadata {
		const provider = input.provider.trim().toLowerCase();
		const apiKey = input.apiKey.trim();
		if (!provider) throw new Error("Provider is required");
		if (!apiKey) throw new Error("API key is required");
		const now = new Date().toISOString();
		const file = this.readFile(userId);
		const credential: StoredCredential = {
			id: randomUUID(),
			provider,
			label: input.label?.trim() || provider,
			createdAt: now,
			updatedAt: now,
			status: "untested",
			encryptedApiKey: encrypt(apiKey, this.config.credentialEncryptionSecret),
		};
		file.credentials = file.credentials.filter((item) => item.provider !== provider);
		file.credentials.push(credential);
		this.writeFile(userId, file);
		return toMetadata(credential);
	}

	async validate(userId: string, credentialId: string): Promise<CredentialMetadata> {
		const file = this.readFile(userId);
		const credential = file.credentials.find((item) => item.id === credentialId);
		if (!credential) throw new CredentialNotFoundError(credentialId);
		const plaintext = decrypt(credential.encryptedApiKey, this.config.credentialEncryptionSecret);
		const now = new Date().toISOString();
		if (credential.provider !== this.config.provider)
			throw new Error(`This planner uses ${this.config.provider}. Add a key for that provider.`);
		const model = resolveTravelModel(credential.provider, this.config.modelId);
		let valid = false;
		try {
			const result = await completeSimple(
				model,
				{ messages: [{ role: "user", content: "Reply OK", timestamp: Date.now() }] },
				{ apiKey: plaintext, maxTokens: 8, signal: AbortSignal.timeout(20_000) },
			);
			valid = result.stopReason !== "error" && result.stopReason !== "aborted";
		} catch {
			/* Provider errors can contain credentials; return only a safe message. */
		}
		// Read again after the network call so deletion/rotation cannot be undone.
		const current = this.readFile(userId);
		const saved = current.credentials.find((item) => item.id === credentialId);
		if (!saved) throw new CredentialNotFoundError(credentialId);
		credential.status = valid ? "valid" : "invalid";
		credential.lastValidatedAt = now;
		credential.updatedAt = now;
		Object.assign(saved, credential);
		this.writeFile(userId, current);
		if (!valid)
			throw new Error(
				"The provider could not complete a test request. Check the key, model access and quota, then retry.",
			);
		return toMetadata(credential);
	}

	delete(userId: string, credentialId: string): void {
		const file = this.readFile(userId);
		const next = file.credentials.filter((item) => item.id !== credentialId);
		if (next.length === file.credentials.length) throw new CredentialNotFoundError(credentialId);
		this.writeFile(userId, { credentials: next });
	}

	getApiKeyForProvider(userId: string, provider: string): string | undefined {
		const normalized = provider.trim().toLowerCase();
		const credential = this.readFile(userId).credentials.find(
			(item) => item.provider === normalized && item.status !== "invalid",
		);
		return credential ? decrypt(credential.encryptedApiKey, this.config.credentialEncryptionSecret) : undefined;
	}

	isServerKeyFallbackAllowed(userId: string, email?: string): boolean {
		return (
			this.config.serverKeyFallbackAllowlist.includes(userId) ||
			(!!email && this.config.serverKeyFallbackAllowlist.includes(email))
		);
	}

	private readFile(userId: string): CredentialFile {
		const filePath = this.filePath(userId);
		if (!existsSync(filePath)) return { credentials: [] };
		try {
			const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as CredentialFile;
			return { credentials: Array.isArray(parsed.credentials) ? parsed.credentials : [] };
		} catch {
			return { credentials: [] };
		}
	}

	private writeFile(userId: string, file: CredentialFile): void {
		const dir = join(this.config.dataDir, "credentials");
		mkdirSync(dir, { recursive: true });
		writeFileSync(this.filePath(userId), `${JSON.stringify(file, null, 2)}\n`, "utf-8");
	}

	private filePath(userId: string): string {
		return join(this.config.dataDir, "credentials", `${safeUserId(userId)}.json`);
	}
}

function toMetadata(credential: StoredCredential): CredentialMetadata {
	return {
		id: credential.id,
		provider: credential.provider,
		label: credential.label,
		createdAt: credential.createdAt,
		updatedAt: credential.updatedAt,
		lastValidatedAt: credential.lastValidatedAt,
		status: credential.status,
	};
}

function encrypt(plaintext: string, secret: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

function decrypt(payload: string, secret: string): string {
	const [ivRaw, tagRaw, encryptedRaw] = payload.split(".");
	if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("Invalid encrypted credential payload");
	const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), Buffer.from(ivRaw, "base64url"));
	decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
	return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf-8");
}

function keyFromSecret(secret: string): Buffer {
	return createHash("sha256").update(secret).digest();
}

function safeUserId(userId: string): string {
	return createHash("sha256").update(userId).digest("hex");
}
