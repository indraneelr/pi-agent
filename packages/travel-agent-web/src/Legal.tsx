/**
 * Legal surface (ADR 0005).
 *
 * Product-level protection that model prompt-behavior cannot provide:
 * - a one-time AI/ToS consent gate,
 * - an always-visible footer disclaimer,
 * - a high-risk caveat for visa/health/safety/emergency/price facts,
 * - a Terms & Privacy modal whose privacy section is hand-written on the two
 *   product specifics (third-party data flows incl. free-tier-may-train, and
 *   children's-data minimization).
 */

import type { ReactNode } from "react";
import { useState } from "react";

const CONSENT_KEY = "pi-travel-agent:legal-consent:v1";

/** Persistent, low-noise reminder shown on every screen. */
export function FooterDisclaimer({ onOpenLegal }: { onOpenLegal: () => void }) {
	return (
		<footer className="legal-footer">
			<span>AI can make mistakes — verify important details.</span>
			<button type="button" className="legal-link" onClick={onOpenLegal}>
				Terms &amp; Privacy
			</button>
		</footer>
	);
}

/**
 * Inline "AI estimate" marker for the high-risk categories only — visa, health,
 * safety, emergency info, and any price. Scoped to avoid disclaimer fatigue.
 */
export function HighRiskCaveat() {
	return (
		<p className="high-risk-caveat" role="note">
			⚠️ Visa, health, safety, emergency, and price details are AI estimates — confirm with official sources before you
			rely on them.
		</p>
	);
}

/** One-time consent gate. Returns children only after the user accepts. */
export function ConsentGate({ children, onOpenLegal }: { children: ReactNode; onOpenLegal: () => void }) {
	const [accepted, setAccepted] = useState(() => {
		try {
			return window.localStorage.getItem(CONSENT_KEY) === "true";
		} catch {
			return false;
		}
	});
	if (accepted) return <>{children}</>;
	return (
		<div className="consent-backdrop" role="dialog" aria-modal="true" aria-label="Before you start">
			<div className="consent-card">
				<h2>Before you start</h2>
				<p>
					This is an AI travel planner. Plans, prices, visa rules, and safety info are AI-generated estimates that can be
					wrong or out of date. It is not professional travel, legal, or medical advice — verify anything you'll act on.
				</p>
				<p>
					Your trip details are sent to your configured AI and search providers. See{" "}
					<button type="button" className="legal-link" onClick={onOpenLegal}>
						Terms &amp; Privacy
					</button>{" "}
					for how your data is handled.
				</p>
				<button
					type="button"
					className="consent-accept"
					onClick={() => {
						try {
							window.localStorage.setItem(CONSENT_KEY, "true");
						} catch {
							// Accept for this session even if storage is unavailable.
						}
						setAccepted(true);
					}}
				>
					I understand — continue
				</button>
			</div>
		</div>
	);
}

/** Terms & Privacy modal. Templated, with the two product-specific privacy points. */
export function LegalModal({ onClose }: { onClose: () => void }) {
	return (
		<div className="legal-modal-backdrop" role="dialog" aria-modal="true" aria-label="Terms and Privacy">
			<div className="legal-modal">
				<button type="button" className="legal-modal-close" onClick={onClose}>
					Close
				</button>
				<h2>Terms &amp; Privacy (Alpha)</h2>

				<h3>Using this service</h3>
				<p>
					Wander is an AI travel planner provided as an early alpha. Output is AI-generated and may be inaccurate,
					incomplete, or outdated. It is not professional travel, legal, financial, or medical advice. You are
					responsible for verifying visas, health requirements, safety advisories, prices, and availability with
					official sources before booking or travelling. The service is provided “as is”, without warranties, and we are
					not liable for decisions made based on its output. Alpha data may be reset at any time — don't rely on it as
					permanent storage.
				</p>

				<h3>What we collect</h3>
				<ul>
					<li>Your identity from Google sign-in (name, email) when authentication is enabled.</li>
					<li>Your LLM API key, encrypted at rest — never shown back to you and deletable at any time.</li>
					<li>Your trip session data (preferences, selections, itineraries).</li>
					<li>Redacted operational logs.</li>
				</ul>

				<h3>Where your data goes</h3>
				<p>
					To plan your trip, your inputs — including travel dates, budget, and group composition (such as children's
					rough ages) — are sent to third parties: your configured <strong>LLM provider</strong> (e.g. Google Gemini),
					<strong> web/image search providers</strong>, and <strong>Wikimedia</strong> for imagery. These are governed by
					those providers' own terms. In particular, <strong>free-tier provider keys may use your inputs to improve their
					products</strong> — if privacy matters to you, use a paid key or a provider whose terms exclude training.
				</p>

				<h3>Children's data</h3>
				<p>
					When your group includes children we collect only the minimum needed to plan (e.g. rough ages) — never names or
					dates of birth. Please don't enter more personal detail about minors than the plan requires.
				</p>

				<h3>Images</h3>
				<p>
					Images may be shown from third-party sources and are displayed with attribution where available. We link to
					sources rather than storing images. If you are a rights-holder and want an image removed, contact us and we
					will take it down promptly.
				</p>

				<h3>Your controls</h3>
				<p>You can delete your LLM keys and your trip sessions at any time. A full lawyer-reviewed policy will be published before public launch.</p>
			</div>
		</div>
	);
}
