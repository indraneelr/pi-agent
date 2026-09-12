import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { type Account, type Credential, deleteCredential, getAccount, listCredentials, logout, saveCredential, validateCredential } from "./api.js";

export function AccountGate({ children }: { children: ReactNode }) {
	const [account, setAccount] = useState<Account | null>(null);
	const [credentials, setCredentials] = useState<Credential[]>([]);
	const [settings, setSettings] = useState(false);
	const [key, setKey] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function refresh() {
		try {
			const next = await getAccount();
			setAccount(next);
			if (next.authenticated) setCredentials((await listCredentials()).credentials);
		} catch (e) { setError(e instanceof Error ? e.message : "Could not connect. Try again."); }
	}
	useEffect(() => { void refresh(); }, []);

	async function save(event: FormEvent) {
		event.preventDefault();
		if (!account || busy) return;
		setBusy(true);
		setError(null);
		try {
			const saved = await saveCredential(account.provider, key.trim());
			setKey("");
			await validateCredential(saved.credential.id);
			setSettings(false);
		} catch (e) { setError(e instanceof Error ? e.message : "Could not validate key"); }
		finally { await refresh(); setBusy(false); }
	}

	if (!account) return <div className="setup-page"><h1>Wander</h1><p role="status">{error ?? "Connecting to your planner…"}</p>{error ? <button type="button" onClick={() => void refresh()}>Try again</button> : null}</div>;
	if (!account.authenticated) return <div className="setup-page"><p className="eyebrow">Wander · Private alpha</p><h1>Your next trip starts here.</h1><p>Discover places, choose experiences, and build a day-by-day itinerary you can take with you.</p><a className="primary-link" href="/api/auth/login">Continue with Google</a><p>Your trips and API key stay private to your account.</p></div>;

	return <div className="application-frame">
		<header className="account-bar"><strong>Wander</strong><span>{account.authRequired ? account.user?.email : "Local preview"}</span><button type="button" onClick={() => setSettings(!settings)}>API key &amp; account</button>{account.authRequired ? <button type="button" onClick={() => { void logout().then(() => { window.location.href = "/"; }).catch(() => setError("Could not sign out. Try again.")); }}>Sign out</button> : null}</header>
		{settings || !account.providerConfigured ? <section className="setup-page">
			<h1>Connect your {account.provider === "google" ? "Gemini" : account.provider} key</h1>
			<p>Your key powers the planner. It is encrypted on the server and never saved in browser storage.</p>
			{account.provider === "google" ? <ol><li><a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Open Google AI Studio</a> and create an API key.</li><li>Paste it below. We’ll make a small test request to check model access.</li></ol> : <p>Paste a key with access to {account.modelId}. We’ll make a small test request.</p>}
			<form onSubmit={save} className="key-form"><label htmlFor="provider-key">API key</label><input id="provider-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your key" disabled={busy} required /><button type="submit" disabled={busy || !key.trim()}>{busy ? "Checking key…" : "Save and check key"}</button></form>
			<p>Provider requests may use your quota or incur charges. Free-tier providers may use submitted data to improve their services.</p>
			{error ? <p role="alert" className="error-banner">{error}</p> : null}
			{credentials.map((credential) => <div className="credential-row" key={credential.id}><span>{credential.label} · {credential.status}</span><button type="button" disabled={busy} onClick={async () => { setBusy(true); setError(null); try { await deleteCredential(credential.id); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Could not delete key"); } finally { setBusy(false); } }}>Delete key</button></div>)}
			{account.providerConfigured ? <button type="button" onClick={() => setSettings(false)}>Back to my trip</button> : null}
		</section> : children}
	</div>;
}
