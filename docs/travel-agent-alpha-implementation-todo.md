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

Status: in progress

Goal: no fake or unvalidated visible image/resource URLs in alpha UI.

Tasks:

- [x] Add minimal `ValidatedResource` / `ValidatedImage` contract consistent with current code patterns.
- [x] Extend `get_images` so validation evidence is preserved, not discarded into raw strings only.
- [x] Persist validated image evidence for destination cards first.
- [x] Update server UI blocks/API types to expose validated evidence.
- [x] Update web destination-card renderer to render evidence-backed images only.
- [x] Guard assistant Markdown image rendering so arbitrary model URLs do not render unless allowed by server-approved evidence.
- [x] Add fallback/verified-empty UI state.
- [ ] Add regression tests:
  - [ ] fake/model-invented Markdown image URL is not rendered
  - [ ] raw `imageLinks` without evidence does not render
  - [ ] validated evidence renders
- [x] Run relevant tests/checks:
  - `packages/travel-agent`: build + focused get-images/image-validation/tools tests passed (40 tests)
  - `packages/travel-agent-server`: `npm run check` passed
  - `packages/travel-agent-web`: `npm run check && npm test` passed (4 tests)
- [x] Commit Phase 1 evidence/rendering slice (`e8b04506`).

## Phase 2 — Auth feature toggle and Google session isolation

Status: pending

Tasks:

- [ ] Add `AUTH_REQUIRED`-style config with safe staging/production default.
- [ ] Add dev/debug auth-disabled mode with clear warnings.
- [ ] Add Google OIDC login/logout/current-user.
- [ ] Add secure HTTP-only session cookies when auth is enabled.
- [ ] Scope sessions/resources/runs/credentials by `userId` when auth is enabled.
- [ ] Add cross-user isolation tests.
- [ ] Commit Phase 2.

## Phase 3 — Encrypted user LLM credentials + fallback allowlist

Status: pending

Tasks:

- [ ] Add Railway-env-backed app secret for encryption.
- [ ] Add application-level envelope encryption for user LLM keys.
- [ ] Add credential CRUD/metadata APIs without plaintext responses.
- [ ] Add validation/test-call API.
- [ ] Add provider/model router scoped to authenticated user/session.
- [ ] Add server-key fallback allowlist by user ID/email.
- [ ] Add tests for redaction, isolation, rotation/deletion, fallback allowlist.
- [ ] Commit Phase 3.

## Phase 4 — Core alpha workflow hardening

Status: pending

Tasks:

- [ ] Harden preferences → shortlist → selection → activities → itinerary flow.
- [ ] Add final-plan smoke/eval.
- [ ] Hide/disable hotels and flights unless validation is complete.
- [ ] Add clear error/retry states.
- [ ] Add Greece/Japan/Portugal staging scenario coverage.
- [ ] Commit Phase 4.

## Phase 5 — Railway staging gates

Status: pending

Tasks:

- [ ] Add Railway staging deployment instructions/workflow.
- [ ] Add health/readiness checks for server, DB/storage, encryption config, SearXNG config.
- [ ] Add redacted logs/request IDs/user/session/run IDs.
- [ ] Add rate limits and one-active-run/concurrency controls.
- [ ] Add staging smoke script for auth, credentials, workflow, resource truthfulness.
- [ ] Document rollback, data deletion, and alpha no-backup/data-reset policy.
- [ ] Commit Phase 5.

## Resume notes

Start with Phase 1. The existing `get_images` tests pass, but UI still renders raw URL strings. The first implementation target is to preserve validated evidence and require that evidence at render time.
