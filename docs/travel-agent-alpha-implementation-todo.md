# Travel Agent Alpha Implementation Todo

Last updated: 2026-06-22

## Operating rules

- Commit after every logical step.
- Update this file after every logical step so work can resume after long breaks.
- Keep scope to minimal production alpha unless explicitly re-approved.
- Primary deployment target: Railway.
- Alpha image provider: SearXNG.
- Auth must be feature-toggled for dev/debug, enabled by default in staging/production.
- Server-funded fallback LLM keys are only for an explicit allowlist.
- No alpha backup/restore rehearsal; document alpha data reset policy.

## Phase 0 — Commit current planning state

Status: completed

- [x] Update production release plan with user feedback.
- [x] Commit current repo state before implementation (`f0a1f7c0`).

## Phase 1 — Validated image/resource rendering

Status: completed

Goal: no fake or unvalidated visible image/resource URLs in alpha UI.

Tasks:

- [x] Add minimal `ValidatedResource` / `ValidatedImage` contract consistent with current code patterns.
- [x] Extend `get_images` so validation evidence is preserved, not discarded into raw strings only.
- [x] Persist validated image evidence for destination cards first.
- [x] Update server UI blocks/API types to expose validated evidence.
- [x] Update web destination-card renderer to render evidence-backed images only.
- [x] Guard assistant Markdown image rendering so arbitrary model URLs do not render unless allowed by server-approved evidence.
- [x] Add fallback/verified-empty UI state.
- [x] Add regression tests:
  - [x] fake/model-invented Markdown image URL is not rendered
  - [x] raw `imageLinks` without evidence does not render
  - [x] validated evidence renders
- [x] Run relevant tests/checks:
  - `packages/travel-agent`: build + focused get-images/image-validation/tools tests passed (40 tests)
  - `packages/travel-agent-server`: `npm run check` passed
  - `packages/travel-agent-web`: `npm run check && npm test` passed (8 tests)
  - root `npm run check` passed
- [x] Commit Phase 1 evidence/rendering slice (`e8b04506`).
- [x] Commit Phase 1 render-guard regression tests (`3c6c73b9`).

## Phase 2 — Auth feature toggle and Google session isolation

Status: completed

Tasks:

- [x] Add `AUTH_REQUIRED`-style config with safe staging/production default.
- [x] Add dev/debug auth-disabled mode with clear warnings.
- [x] Add Google OIDC login/logout/current-user.
- [x] Add secure HTTP-only session cookies when auth is enabled.
- [x] Scope travel sessions by `userId` when auth is enabled.
- [x] Add cross-user session isolation tests.
- [x] Commit Phase 2 auth-toggle slice (`af76b14e`).
- [x] Commit Phase 2 Google OIDC slice (`eb843faf`).
- [x] Commit Phase 2 user-owned session isolation slice (`c055e7ec`).

## Phase 3 — Encrypted user LLM credentials + fallback allowlist

Status: completed

Tasks:

- [x] Add Railway-env-backed app secret for encryption.
- [x] Add application-level envelope encryption for user LLM keys.
- [x] Add credential CRUD/metadata APIs without plaintext responses.
- [x] Add validation/test-call API.
- [x] Add provider/model router scoped to authenticated user/session.
- [x] Add server-key fallback allowlist by user ID/email.
- [x] Add tests for redaction, isolation, rotation/deletion, fallback allowlist.
- [x] Commit Phase 3 credential-store slice (`852aa8c1`).
- [x] Commit Phase 3 credential router slice (`2ad5fdf9`).

## Phase 4 — Core alpha workflow hardening

Status: completed

Tasks:

- [x] Harden preferences → shortlist → selection → activities → itinerary flow with alpha smoke gates.
- [x] Add final-plan smoke/eval.
- [x] Hide/disable hotels and flights unless validation is complete.
- [x] Add clear error/retry states.
- [x] Add Greece/Japan/Portugal staging scenario coverage.
- [x] Commit Phase 4 hide-unvalidated-booking slice (`3ff96be5`).
- [x] Commit Phase 4 retry-state slice (`f84087d1`).
- [x] Commit Phase 4 alpha smoke/eval slice (`40d64cce`).

## Phase 5 — Railway staging gates

Status: completed

Tasks:

- [x] Add Railway staging deployment instructions/workflow.
- [x] Add health/readiness checks for server, DB/storage, encryption config, SearXNG config.
- [x] Add redacted logs/request IDs/user/session/run IDs.
- [x] Add rate limits and one-active-run/concurrency controls.
- [x] Add staging smoke script for auth, credentials, workflow, resource truthfulness.
- [x] Document rollback, data deletion, and alpha no-backup/data-reset policy.
- [x] Add alpha trip/session deletion endpoint and owner-isolation tests.
- [x] Commit Phase 5 readiness slice (`57121249`).
- [x] Commit Phase 5 Railway runbook/rate-limit slice (`56de0aea`).
- [x] Commit Phase 5 session deletion slice (`ae98ec1d`).

## Post-plan production polish

Status: in progress

- [x] Add feature toggle for strict validated-image-only rendering:
  - frontend `VITE_REQUIRE_VALIDATED_IMAGES=true`
  - agent/server `TRAVEL_AGENT_REQUIRE_VALIDATED_IMAGES=true`
  - default is false so raw `imageLinks` can render for debugging while validated image flow is investigated
- [x] Remove user-visible blocked-image warning from assistant Markdown rendering.
- [x] Update final-plan prompt to forbid Markdown image syntax and point users to validated UI galleries.
- [x] Remove broader prompt causes that told the agent to include direct image URLs/Markdown image syntax in user-facing prose.
- [x] Add system-prompt regression tests proving image URLs are structured state only and Markdown images are forbidden.
- [x] Use reviewer to inspect why images were still not visible.
- [x] Fix root cause: shortlist cards now require/preserve `validatedImages` from `get_images`; raw `imageLinks` alone are rejected because the UI cannot render them safely.
- [x] Add server UI-block regression test proving validated destination images are forwarded to the web UI.
- [x] Validate and commit blocked-image UX fix.
- [x] Commit markdown-image root-cause fix (`fa4df030`).
- [x] Commit validatedImages visibility fix (`e84ae6a6`).

## Resume notes

Phases 1–5 are complete for the minimal alpha implementation plan. Blocked-image UX polish is complete. Remaining work before real launch is environment setup on Railway, real Google OAuth credentials, SearXNG endpoint, and live staging smoke validation.
