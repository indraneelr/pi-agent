import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ServerConfig } from "./config.js";

export interface AuthUser {
	id: string;
	email: string;
	name?: string;
	picture?: string;
}

interface GoogleTokenResponse {
	id_token?: string;
	error?: string;
	error_description?: string;
}

interface GoogleTokenInfo {
	sub?: string;
	email?: string;
	email_verified?: string | boolean;
	name?: string;
	picture?: string;
	aud?: string;
	error?: string;
}

const SESSION_COOKIE = "travel_auth";
const OAUTH_STATE_COOKIE = "travel_oauth_state";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
const OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10;

export function getRequestUser(request: FastifyRequest, config: ServerConfig): AuthUser | null {
	if (!config.authRequired) return { id: "dev-user", email: "dev@local", name: "Dev User" };
	const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
	if (!token) return null;
	return verifySessionToken(token, config.authSessionSecret);
}

export function buildGoogleLoginRedirect(config: ServerConfig): { url: string; state: string } {
	assertGoogleConfig(config);
	const state = randomBytes(24).toString("base64url");
	const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	url.searchParams.set("client_id", config.googleClientId!);
	url.searchParams.set("redirect_uri", config.googleRedirectUri!);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("scope", "openid email profile");
	url.searchParams.set("state", state);
	url.searchParams.set("prompt", "select_account");
	return { url: url.toString(), state };
}

export async function exchangeGoogleCodeForUser(code: string, config: ServerConfig): Promise<AuthUser> {
	assertGoogleConfig(config);
	const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: config.googleClientId!,
			client_secret: config.googleClientSecret!,
			redirect_uri: config.googleRedirectUri!,
			grant_type: "authorization_code",
			code,
		}),
	});
	const tokenJson = (await tokenRes.json()) as GoogleTokenResponse;
	if (!tokenRes.ok || !tokenJson.id_token) {
		throw new Error(tokenJson.error_description ?? tokenJson.error ?? "Google token exchange failed");
	}

	const infoRes = await fetch(
		`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenJson.id_token)}`,
	);
	const info = (await infoRes.json()) as GoogleTokenInfo;
	if (!infoRes.ok || info.error) throw new Error(info.error ?? "Google token verification failed");
	if (info.aud !== config.googleClientId) throw new Error("Google token audience mismatch");
	if (!info.sub || !info.email) throw new Error("Google token missing required identity claims");
	if (info.email_verified === false || info.email_verified === "false")
		throw new Error("Google email is not verified");
	return { id: info.sub, email: info.email, name: info.name, picture: info.picture };
}

export function setSessionCookie(reply: FastifyReply, user: AuthUser, config: ServerConfig): void {
	reply.header(
		"set-cookie",
		serializeCookie(SESSION_COOKIE, signSessionToken(user, config.authSessionSecret), {
			httpOnly: true,
			secure: config.cookieSecure,
			sameSite: "Lax",
			path: "/",
			maxAge: SESSION_MAX_AGE_SECONDS,
		}),
	);
}

export function clearSessionCookie(reply: FastifyReply, config: ServerConfig): void {
	reply.header(
		"set-cookie",
		serializeCookie(SESSION_COOKIE, "", {
			httpOnly: true,
			secure: config.cookieSecure,
			sameSite: "Lax",
			path: "/",
			maxAge: 0,
		}),
	);
}

export function setOAuthStateCookie(reply: FastifyReply, state: string, config: ServerConfig): void {
	reply.header(
		"set-cookie",
		serializeCookie(OAUTH_STATE_COOKIE, state, {
			httpOnly: true,
			secure: config.cookieSecure,
			sameSite: "Lax",
			path: "/api/auth/callback",
			maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
		}),
	);
}

export function verifyOAuthState(request: FastifyRequest, state: string | undefined): boolean {
	if (!state) return false;
	return parseCookies(request.headers.cookie)[OAUTH_STATE_COOKIE] === state;
}

export function clearOAuthStateCookie(reply: FastifyReply, config: ServerConfig): void {
	reply.header(
		"set-cookie",
		serializeCookie(OAUTH_STATE_COOKIE, "", {
			httpOnly: true,
			secure: config.cookieSecure,
			sameSite: "Lax",
			path: "/api/auth/callback",
			maxAge: 0,
		}),
	);
}

function signSessionToken(user: AuthUser, secret: string): string {
	const payload = Buffer.from(JSON.stringify(user), "utf-8").toString("base64url");
	return `${payload}.${signature(payload, secret)}`;
}

function verifySessionToken(token: string, secret: string): AuthUser | null {
	const [payload, sig] = token.split(".");
	if (!payload || !sig) return null;
	const expected = signature(payload, secret);
	const a = Buffer.from(sig);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
	try {
		const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as AuthUser;
		return parsed.id && parsed.email ? parsed : null;
	} catch {
		return null;
	}
}

function signature(payload: string, secret: string): string {
	return createHmac("sha256", secret).update(payload).digest("base64url");
}

function parseCookies(header: string | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	for (const part of header?.split(";") ?? []) {
		const [rawName, ...rawValue] = part.trim().split("=");
		if (!rawName || rawValue.length === 0) continue;
		out[rawName] = decodeURIComponent(rawValue.join("="));
	}
	return out;
}

function serializeCookie(
	name: string,
	value: string,
	options: { httpOnly: boolean; secure: boolean; sameSite: "Lax" | "Strict"; path: string; maxAge: number },
): string {
	const parts = [
		`${name}=${encodeURIComponent(value)}`,
		`Path=${options.path}`,
		`Max-Age=${options.maxAge}`,
		`SameSite=${options.sameSite}`,
	];
	if (options.httpOnly) parts.push("HttpOnly");
	if (options.secure) parts.push("Secure");
	return parts.join("; ");
}

function assertGoogleConfig(config: ServerConfig): void {
	if (!config.googleClientId || !config.googleClientSecret || !config.googleRedirectUri) {
		throw new Error("Google OAuth is not configured");
	}
}
