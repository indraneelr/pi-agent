# Wander Travel Agent — v1 MVP Implementation Spec

**Status:** approved for implementation
**Audience:** a coding agent (and human reviewers) implementing, verifying, and readying v1 for production.
**Source of truth:** the domain language in [`/CONTEXT.md`](../CONTEXT.md) and the decisions in [`docs/adr/0001`–`0005`](./adr/). This spec operationalizes them; if this spec and an ADR ever disagree, the ADR wins — flag the conflict, don't silently pick.

---

## 0. How to use this spec

- Work milestone by milestone (M1 → M7). Each milestone has **Goal → Current state → Build → Files → Done-when (acceptance)**.
- **Commit after every logical step.** Keep changes reviewable.
- Do **not** expand scope beyond §1. Deferred work is listed in §9; do not build it.
- Every milestone must leave the repo green: `npm run check` at root, and package `test` scripts pass.
- Prefer extending existing seams over rewrites. The provider interfaces and session facade already support everything here.

---

## 1. Scope

**In (v1):** requirements gathering → destination/place shortlist → activities → final itinerary + budget. Choice-first, controls-first, **mobile-first**. BYOK (Gemini standard).

**Out (deferred — see §9):** flights, hotels, booking/payments, AG-UI/CopilotKit, incremental card-fill, browse-during-run, full E01–E15 eval harness, public/GA launch.

**Ubiquitous language:** use the exact terms in `/CONTEXT.md` — *destination, place, option, selection, slot, itinerary, canonical trip state, instant action, generate action*. Name code symbols to match.

---

## 2. Architecture decisions (summary — full text in `docs/adr/`)

| ADR | Decision |
|---|---|
| 0001 | **Instant actions bypass the agent.** select/deselect/remove/slot/download = deterministic state mutations, no LLM. Agent only for generate actions. |
| 0002 | **Per-capability provider failover.** model / web-search / image each an ordered `[primary, fallback]` with a **configurable per-call timeout** and **auto-failover on timeout-or-error**, piecewise. |
| 0003 | **Perceived responsiveness over speed.** Plain **SSE** (no CopilotKit). Ship **step-narration + streaming text**. No placeholders. **Prefetched** wait-filler, never live-fetched. |
| 0004 | **Lean launch gate + hybrid agent testing.** deterministic + integration (injected fakes) + golden-path smoke + manual dogfood. Scripted-fake → record/replay with hash-stamped fixtures. |
| 0005 | **Staged legal posture.** Images: SearXNG hotlink+attribution for alpha → Wikimedia-primary before public. Disclaimers: ToS + footer + inline on high-risk. Privacy: templated + two hand-written specifics. |

---

## 3. Current state (verified in code — build on these, don't recreate)

- `packages/travel-agent` — agent core, staged system prompt, tools (`web-search`, `get-images`, `save-destination-shortlist`, `advance-checklist`, `update-state`, `verify-data`, …), image validation incl. a **Wikimedia** path, and search providers: `stagehand` (default), `brave`, `linkup`, `google-gemini` (grounding), `obscura`; image provider `searxng` (+ stagehand image fallback).
  - `createTravelSession(options)` (`core/sdk.ts`) already accepts `model: Model<any>`, `searchProvider: SearchProvider`, `sessionId`, `dataDir`. Facade exposes `prompt()`, `subscribe(event)`, `abort()`, `waitForIdle()` — **the event stream for SSE already exists here.**
  - `detectSearchProvider()` (`core/search/index.ts`) currently defaults to **Stagehand**, fallback order Brave→Linkup→Gemini→Obscura. Env-ordered only; **no timeout-failover, no per-capability config.**
- `packages/travel-agent-server` (Fastify) — `auth.ts` (Google OIDC + toggle), `credentials.ts` (encrypted BYOK keys), `session-manager.ts` (in-memory cache + one-active-run lock + file persistence), `ui-blocks.ts` (deterministic block composer), `config.ts`, `server.ts`. Health/ready, rate limits, redacted logging, per-user isolation exist (alpha plan Phases 1–5).
- `packages/travel-agent-web` (React/Vite) — `App.tsx`, `TravelCopilotChat.tsx`, `api.ts`, `render-safety.ts`. **Non-streaming REST only. Only destination cards. No SSE, no instant-action UI, no ItineraryView.**
- Image evidence records `source` + `provider` but **not `license`/`author`/`attribution`.**
- Tests: `e2e-session.test.ts`, deterministic eval search stub, `promptfooconfig.stage1.yaml`, live-eval scripts, `alpha-release-smoke.ts`.

**Net:** backend platform (auth/creds/persistence/rate-limits) is largely built; the **product loop (failover, streaming, instant actions, UI kit, legal surface, test harness) is the work.**

---

## 4. M1 — Provider config + timeout-failover + Gemini-grounding web search

**Goal:** every capability (model, web-search, image) is a configurable ordered provider list with a per-call timeout and automatic failover; web search defaults to Gemini grounding on the user's key (retiring slow Stagehand as the default). Ref: ADR 0002, 0005.

**Build:**
- Introduce a `CapabilityProvider<T>` wrapper: `{ primary, fallbacks[], timeoutMs, name }` with a `run()` that races the primary against `timeoutMs`; on timeout **or** error, fall to the next provider; surface which provider served the result (for logging + attribution).
- Apply it to all three capabilities **independently** (piecewise): model, web-search, image-search. Timeouts come from config/env (`*_TIMEOUT_MS`), with sane defaults (e.g. search 10s, model 25s — tune later).
- **Web search:** default primary = `google-gemini` grounding using the **user's session Gemini key** (routed via the existing per-`(userId,sessionId)` credential router); fallback = `stagehand` (free, slow). Non-Gemini BYOK keys get the fallback path (documented degradation).
- **Image:** primary = `searxng` (hotlink-only), fallback = stagehand image; keep the Wikimedia path reachable (M5/pre-public flips primary — do not do that here).
- **Model:** primary = user's Gemini (fast model for simple turns, stronger for complex — expose the tiering as config); fallback = kimi via Ollama Cloud.
- Emit a structured log line on every failover: `{capability, from, to, reason: 'timeout'|'error', ms}`.

**Files:** `core/search/index.ts` (+ new capability wrapper module), server `config.ts`, credential router, `core/sdk.ts` wiring.

**Done-when:**
- Config selects primary+fallback+timeout per capability from env; documented in the Railway runbook.
- Integration test (M6 harness): inject a slow fake search provider exceeding `timeoutMs` → failover fires, fallback result returned, failover log emitted. Same for error and for model + image capabilities.
- Web search demonstrably uses Gemini grounding under a Gemini session key (assert via injected fake / recorded fixture), Stagehand only on fallback.
- `npm run check` + tests green.

---

## 5. M2 — SSE event layer + responsiveness (narration + streaming text + prefetch filler)

**Goal:** the browser sees live progress during generate actions. Ref: ADR 0003.

**Build:**
- **Server:** add a normalized event envelope and an **SSE endpoint** (e.g. `GET/POST /api/travel/sessions/:id/stream`). Subscribe to the session facade's `subscribe(event)` and map to SSE events: `tool_start`, `tool_end`, `text_delta`, `state_snapshot`, `run_error`, `run_finished`. No AG-UI, no CopilotKit.
- **Step narration:** a deterministic `tool → human copy` map ("Searching {place} beaches…", "Fetching photos…", "Checking {month} weather…"). Include safe, non-secret args. Emitted on `tool_start`/`tool_end`.
- **Streaming text:** stream the assistant's final compose via `text_delta`.
- **Prefetch filler:** when a destination is locked during requirements, fire background calls to warm a per-destination generic-content cache (keyed by destination). During later waits, serve from cache; on miss/timeout fall back to **static curated content** or already-fetched session content. **No live fetch during a wait.** `surprise me` (no destination yet) → static generic content on the first shortlist wait.
- **Web client:** SSE client in `api.ts`; render a **narration list** (step-based progress, **not** a stopwatch) and **streaming assistant text**. No skeleton/placeholder cards.

**Files:** server `server.ts` (+ new `stream.ts`/event-mapper), `session-manager.ts`, web `api.ts`, `TravelCopilotChat.tsx` (+ a narration component), new prefetch/cache module.

**Done-when:**
- Curl the SSE endpoint for a real generate → ordered `tool_start`/`tool_end`/`text_delta`/`state_snapshot`/`run_finished`; stream never hangs (always terminates with `run_finished` or `run_error`).
- Integration test asserts event ordering and that a fault-injected tool error yields `run_error` + `run_finished` (no hang).
- Browser: narration lines appear during the tool middle; assistant text streams; on a warmed destination, filler content shows during a wait; on `surprise me`, static content shows.
- Mobile viewport verified.

---

## 6. M3 — Instant-action endpoints + canonical state + optimistic client

**Goal:** select/deselect/remove/slot/download mutate canonical trip state deterministically, no LLM, instant. Ref: ADR 0001.

**Build:**
- **Server:** `POST /api/travel/sessions/:id/actions` accepting typed instant actions: `select_place`, `deselect_place`, `remove_place`, `select_activity`, `deselect_activity`, `remove_activity`, `slot_item` (item → day), `unslot_item`. Each validates against current canonical state and mutates it deterministically — **no agent run.** Enforce the existing one-active-run lock: instant actions are allowed during a generate but write through a **last-writer-safe merge** (an in-flight generate's end-of-run `state_snapshot` must not clobber a user selection — reconcile selections/slots by id).
- `download` is **client-side** (render canonical state → printable/exportable artifact); no endpoint needed beyond fetching state.
- **Generate-action buttons** ("more places", "more images", "reviews", "start over") = POST to the existing **message** endpoint with a **templated prompt**; they are generate actions, they stream via M2.
- **Web client:** optimistic state update on tap; revert on validation failure; reconcile on next `state_snapshot`.

**Files:** server `server.ts` (+ `actions.ts`), state module in `core/`, `session-manager.ts` (merge logic), web `api.ts`, `App.tsx`/card components.

**Done-when:**
- Each instant action mutates state and returns the new snapshot **without** invoking the model (assert: zero model calls via injected fake model call-counter).
- Concurrency test: instant `select_place` during an in-flight generate is **not** clobbered by the generate's end-of-run snapshot.
- Optimistic UI updates immediately; a rejected action reverts.
- `download` produces a plan artifact from state alone.

---

## 7. M4 — UI kit (mobile-first)

**Goal:** the controls-first component set. Ref: Q2 decision, `/CONTEXT.md`.

**Build:**
- **`OptionCard`** — one component for a **place and an activity** (title, validated image + credit line, why-it-fits, tradeoff). Buttons: **Select/Deselect** (instant), **More images**, **Reviews**, **More like this** (generate, templated message). Mobile tap targets.
- **`ItineraryView`** — day-by-day (morning/afternoon/evening), each slotted item with **move-to-Day-N** (instant), **download**, **calculate budget** (generate).
- **Generate-buttons** cluster ("more places", "start over with new prefs").
- Extend `ui-blocks.ts` composer to emit these from canonical state; unknown block kinds render a safe fallback.
- Layout: app-shaped, controls-first, chat as one panel (not chat-centric). Responsive/mobile verified.

**Files:** web `App.tsx`, new `OptionCard.tsx` / `ItineraryView.tsx`, server `ui-blocks.ts`.

**Done-when:**
- Place and activity both render via `OptionCard` from real state.
- Select/slot/move/download work as instant actions; generate-buttons stream.
- Every rendered image shows an attribution/credit line (see M5).
- Mobile layout verified in a real browser at a phone viewport.

---

## 8. M5 — Onboarding + legal surface

**Goal:** frictionless BYOK onboarding + the ADR 0005 legal surface. Ref: ADR 0005.

**Build:**
- **Guided key onboarding:** a 2-minute flow — "get a free Gemini key from Google AI Studio → paste it" with steps/screenshots; validates the key via the existing test-call endpoint; warns that free-tier keys may be used for training.
- **Images/legal:** add `license` / `author` / `attribution` fields to the image evidence record; render a **credit line** under every image; **hotlink-only** (never store) for SearXNG; add a **takedown/contact** path. (Wikimedia-primary flip is a **pre-public gate**, not built here — see §9/ADR 0005.)
- **Disclaimers:** ToS/disclaimer acceptance at signup; a persistent low-noise footer caveat; **inline "AI estimate — confirm with official sources"** markers scoped **only** to visa, health, safety/advisories, emergency info, and any monetary figure.
- **Privacy policy:** templated, hand-written on (a) third-party data flows (LLM provider incl. free-tier-may-train, search providers, Wikimedia) and (b) children's-data minimization (rough ages only).

**Files:** web onboarding + legal pages/components, server credential validation, image evidence types (`core/image-search/types.ts`), renderers, `ui-blocks.ts`.

**Done-when:**
- New user can onboard a free Gemini key end-to-end and reach a first plan.
- No image renders without an attribution/credit line; SearXNG images are hotlinked, never stored; takedown contact reachable.
- Inline caveats appear on the five high-risk categories and nowhere else; ToS gate + footer present.
- Privacy policy names the third-party flows and states children's-data minimization.

---

## 9. M6 — Test harness + launch gate (build alongside M1–M5)

**Goal:** the lean gate is enforceable and fast. Ref: ADR 0004.

**Build:**
- **Scripted fake model** implementing `Model<any>`: programmable to emit exact tool-call sequences + text, with **fault-injection** (delay/error/empty). Same fault-injection for fake search/image providers.
- **Integration tests** injecting fake model/search/image into `createTravelSession` + the server; everything else real in-process. Cover: instant actions (zero model calls), SSE event ordering + no-hang, failover on timeout/error (M1), concurrency merge (M3), UI-block composition, per-user isolation.
- **Deterministic-shell unit tests** for state mutations, validation, event mapping, action validators.
- **Golden-path smoke** (extend `alpha-release-smoke.ts` / `fresh-live-eval`): one happy path completes requirements→shortlist→activities→itinerary without catastrophic regression.
- **Record/replay**: fixtures stamped with `model` + **hash(system prompt + tool defs)** + `recordedAt`; replay runs **offline per-commit**; replay **auto-fails "fixture stale — re-record"** on hash/model mismatch. `test:record` (hits real model) is **on-demand + a nightly/daily job** that also runs the golden-path live eval.
- **Manual dogfood checklist** (committed doc): the Greece/Japan/Portugal matrix through the browser, mobile included.

**Done-when:**
- `npm test` per package is offline, deterministic, and fast (no real keys, no network).
- A prompt/tool edit turns the relevant replay fixture red with a re-record message.
- Nightly job re-records + runs the golden-path eval and reports drift.
- Dogfood checklist exists and has been run once.

---

## 10. M7 — Production readiness + deploy (Railway)

**Goal:** close the deferred NFRs to an alpha-appropriate bar and deploy. Ref: existing Railway runbook + §11.

**Build:**
- **Observability (must):** request/run IDs threaded through logs and SSE; **error alerting** (e.g. Railway log drain → Sentry). Redaction already exists — verify no secrets/keys/PII leak.
- **Capacity:** set a target (≈20 concurrent alpha users); **verify file-backed sessions rehydrate on restart** (the `session-manager` rehydrate path — currently unchecked — must work) and are per-user isolated after restart.
- **Performance:** no hard SLO for alpha; assert that if a turn would exceed the failover timeout, failover fires (covered by M1 tests). Confirm perceived-responsiveness (M2) is present on the slow path.
- **Security:** run a `/security-review` pass over auth/creds/isolation/CORS/CSRF/cookie flags; fix any findings before launch.
- **Deploy:** Railway staging over HTTPS; `/health` + `/ready` green; run the alpha smoke flow; verify Google sign-in + credential listing with a test user; document rollback + alpha data-reset policy (already in runbook).

**Done-when (launch gate — all required):**
- M1–M6 acceptance all green.
- `/ready` returns 200; health/readiness cover storage, encryption config, provider config.
- Deterministic + integration tests green; golden-path smoke green; dogfood matrix run.
- Cross-user isolation tests pass (sessions, messages, actions, streams, credentials).
- No visible unvalidated/unattributed images; ToS + disclaimers + privacy present.
- Error alerting live; session rehydrate verified.
- Security-review findings resolved.
- Product owner approves alpha launch to the allowlist.

---

## 11. Deferred to beta/public (DO NOT build in v1)

- Flights, hotels, booking, payments.
- AG-UI event gateway + CopilotKit typed-action suite.
- Incremental per-card fill; browse/act-during-run beyond the safe merge in M3.
- Full E01–E15 LLM-judge eval harness with weighted scoring.
- **Pre-public hard gates (do before opening beyond the allowlist):** flip images to **Wikimedia-primary** (ADR 0005); **lawyer review** of ToS/privacy/licensing; managed KMS if required; formal accessibility pass; backup/restore rehearsal.
- Anonymous sessions; multi-user collaborative editing; browser-side secrets.

---

## 12. Definition of done (whole spec)

The v1 MVP is production-ready for the **private allowlist alpha** when the §10 launch gate passes in Railway staging and the product owner approves. Everything in §11 remains explicitly out until separately approved.
