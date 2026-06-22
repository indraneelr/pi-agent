# Travel Agent Minimal Production Alpha Release Plan

Status: updated after code/design review  
Scope: planning only; do not implement until approved

## Goal

Ship the smallest safe production alpha where invited users can sign in with Google, provide their own LLM keys, create isolated trip sessions, and complete the core travel planning flow:

1. requirements gathering
2. initial destination/place shortlist
3. selected-place exploration with validated images
4. activity research
5. itinerary generation

The alpha must not show fake or unvalidated visible URLs. Primary deployment target is Railway. SearXNG is the alpha image/search provider. Flights, hotels, booking, payments, collaborative editing, full AG-UI/event architecture, and general availability are deferred unless explicitly re-approved.

## Current-state verification

Reviewed files:

- `packages/travel-agent/src/core/tools/get-images.ts`
- `packages/travel-agent/src/core/image-search/validate.ts`
- `packages/travel-agent/src/core/image-validation.ts`
- `packages/travel-agent/src/core/system-prompt.ts`
- `packages/travel-agent/test/get-images.test.ts`
- `packages/travel-agent/test/image-validation.test.ts`
- `packages/travel-agent/test/tools.test.ts`
- `packages/travel-agent-web/src/App.tsx`
- `packages/travel-agent-web/src/TravelCopilotChat.tsx`
- `packages/travel-agent-server/src/ui-blocks.ts`

Findings:

- `get_images` is the current fake-image-URL mitigation path.
- It uses provider-backed search, validates reachability/content type/dimensions, returns only validated image results, and can update destination `imageLinks`.
- Tool-level coverage is present and passing.
- Validation run passed:
  - `packages/travel-agent`: `test/get-images.test.ts`, `test/image-validation.test.ts`, `test/tools.test.ts` → 40 tests passed.
  - `packages/travel-agent-web` → 4 tests passed.
  - `packages/travel-agent-server` → 11 tests passed.
- Gap: current state stores and renders raw URL strings (`imageLinks`) rather than typed validation evidence.
- Gap: the web UI currently renders destination card `imageLinks` directly and assistant Markdown images can render arbitrary `src` values.

Conclusion: `get_images` works for the tactical mitigation it implements, but production alpha still needs render-time evidence enforcement and regression tests before the “no fake visible URL” gate is satisfied.

## Non-negotiable alpha gates

Release is blocked until every required gate below passes in staging.

### 1. No fake or unvalidated visible URLs

Design rule: the model must not be trusted to create renderable URLs. The UI may render only server/tool-validated resource evidence.

Alpha gates:

- Destination/activity images are created only through `get_images` or another deterministic provider-backed validator.
- Raw `imageLinks: string[]`, Markdown image URLs, and model-generated visible URLs are not directly rendered in alpha UI.
- Rendered image/resource records include minimum evidence:
  - original URL
  - final URL when redirect-followed
  - provider/source
  - retrieved timestamp
  - validation timestamp
  - HTTP status
  - content type
  - dimensions for images
  - validation status/result
  - rejection reason when invalid
- UI shows explicit loading, error, stale, and verified-empty/fallback states.
- Regression tests prove model-invented/fake URLs are rejected by renderers.
- Live staging smoke/eval verifies 100% of rendered visible URLs in the release scenarios are validated and non-broken.

### 2. Google sign-in and session isolation

Alpha gates:

- Google OIDC sign-in works in staging over HTTPS when auth is enabled.
- Auth is controlled by an environment feature toggle so local/dev/debug deployments can run without login.
- Production/staging alpha defaults auth on; dev/debug can explicitly disable it.
- Server sessions use secure HTTP-only cookies when auth is enabled.
- OAuth state/nonce, SameSite, CSRF/CORS, and session fixation protections are tested.
- Every session/action/resource/credential endpoint scopes by authenticated `userId`.
- Anonymous production sessions are disabled when the production auth toggle is on.
- Cross-user tests prove user A cannot read, mutate, stream, resume, cancel, or delete user B’s sessions/resources/credentials.

### 3. User LLM API keys

Alpha gates:

- Users can add, validate, rotate, and delete their own LLM keys.
- Keys are encrypted at rest using Railway-hosted app secrets plus application-level envelope encryption, or another explicitly approved equivalent. Managed KMS can be deferred to beta/GA unless required before alpha.
- Plaintext keys are never returned to the browser, logged, included in analytics, or exposed in errors.
- Key metadata can be listed; key material cannot.
- Provider/model routing is scoped to authenticated `(userId, sessionId)`.
- Server-funded fallback keys are disabled by default, except for an explicitly configured allowlist of user IDs/emails approved for fallback access.

### 4. Core workflow quality

Alpha gates:

- Authenticated user can complete: preferences → shortlist → selected-place exploration/images → activities → itinerary.
- Workflow state survives normal refresh/reload.
- Errors are recoverable and do not expose stack traces or secrets.
- Existing Stage 2/3/4 quality evals remain green where applicable.
- Add a final-plan smoke/eval before claiming alpha-ready.
- Staging scenario matrix includes at least Greece, Japan, and Portugal.

### 5. Minimal production readiness

Alpha gates:

- Railway deployment target, Railway-compatible managed DB/storage, secret-management/encryption approach, Google OAuth policy, and SearXNG image/search policy are chosen before implementation.
- Staging deploy is reproducible from CI or documented commands.
- Health/readiness checks cover server, DB/storage, encryption config, provider config, and basic queue/lock state if used.
- Logs are structured and redact secrets.
- Basic abuse/cost controls exist: per-user rate limits, one active run per user/session, concurrency limits, and provider timeout/failure isolation.
- No backup/restore rehearsal is required for alpha. A documented “alpha data may be reset” policy is sufficient.

## Minimal implementation milestones and user stories

### Milestone 0: Alpha scope freeze and decisions

User stories:

- As an operator, I can see exactly what is required for private alpha versus deferred beta/GA work.
- As a product owner, I can approve provider/deployment/security choices before implementation starts.

Tasks:

- Use Railway as the primary deployment target.
- Use Railway Postgres for alpha unless implementation discovers a hard blocker.
- Use Railway environment variables for app secrets plus application-level envelope encryption for user LLM keys. If a managed KMS is later required, defer that to beta/GA.
- Choose Google OAuth launch policy: private alpha allowlist, domain allowlist, or public beta.
- Use SearXNG as the alpha image/search provider; define attribution, cache/TTL policy, quota, and timeout limits.
- Keep auth behind an environment feature toggle for dev/debug; enable it by default in staging/production.
- Allow server-funded fallback LLM keys only for an explicit allowlist of user IDs/emails. Default for everyone else: bring your own key.
- Production starts empty by default; no migration/backfill from demo/local sessions for alpha.
- No alpha backup/restore rehearsal; document that alpha data may be reset.

Acceptance:

- Approved alpha scope and explicit deferred list.
- ADR updated with Railway, Railway Postgres, encryption/secret handling, SearXNG, auth toggle, and fallback-key allowlist choices.

### Milestone 1: Validated image/resource rendering

User stories:

- As an alpha user, I see destination/activity images only when the server has validation evidence.
- As an alpha user, if images cannot be verified, I see a safe fallback state instead of a fake image.
- As an operator, I can audit why each rendered image was trusted or rejected.

Tasks:

- Add a minimal `ValidatedResource` / `ValidatedImage` contract consistent with current code patterns.
- Extend `get_images` validation output so evidence is not discarded after validation.
- Persist validated image evidence for destination cards and activities.
- Keep raw `imageLinks` only as legacy/non-rendering data or migrate away from it.
- Update web renderers to use evidence records only.
- Block assistant Markdown images unless backed by server-approved evidence.
- Add explicit fallback/verified-empty UI states.

Acceptance tests:

- Fake/model-invented Markdown image URL is not rendered.
- Destination card with raw `imageLinks` but no evidence does not render the image.
- Validated image evidence renders with attribution/source.
- Broken, stale, wrong-type, unsupported-scheme, timeout, and redirect cases are rejected.
- Existing `get_images` tests remain green.

### Milestone 2: Google auth and isolated sessions

User stories:

- As an alpha user, I can sign in with Google.
- As an alpha user, I can see and resume only my own trips.
- As an operator, I can prove cross-user access is blocked.

Tasks:

- Add Google OIDC login/logout/current-user endpoints.
- Add `AUTH_REQUIRED`-style feature toggle.
- In dev/debug, allow auth-disabled mode with clear warnings and no accidental production default.
- Add secure HTTP-only session cookies when auth is enabled.
- Add user-owned session storage.
- Scope all travel session/resource/run endpoints by `userId` when auth is enabled.
- Add alpha allowlist if desired.

Acceptance tests:

- Login/logout/current-user E2E passes with auth enabled.
- Dev/debug auth-disabled mode is tested separately and cannot be enabled accidentally in production without explicit config.
- Secure cookie flags are verified in staging.
- Cross-user tests pass for sessions, messages, resources, runs, streams, and cancellation.
- Anonymous production access is blocked when auth is required.

### Milestone 3: Encrypted user LLM credentials

User stories:

- As an alpha user, I can add, validate, rotate, and delete my LLM API key.
- As an alpha user, I never receive plaintext key material after saving it.
- As an operator, I can verify keys are encrypted and redacted.

Tasks:

- Add encrypted credential storage.
- Add provider metadata/list endpoint without plaintext keys.
- Add provider validation/test-call endpoint.
- Add provider/model router scoped to authenticated user/session.
- Disable server fallback keys by default in production except for an explicit fallback allowlist of user IDs/emails.

Acceptance tests:

- Encryption-at-rest test passes.
- API never returns plaintext key material.
- Logs/errors redact secrets.
- User A cannot validate, use, rotate, or delete User B’s keys.
- Non-allowlisted users cannot use server fallback keys.
- Allowlisted users can use fallback keys only when explicitly configured.
- Rotation and deletion tests pass.

### Milestone 4: Core alpha workflow hardening

User stories:

- As an alpha user, I can create a trip session and complete the core planning flow.
- As an alpha user, I can explore places and activities with validated images.
- As an alpha user, I can generate an itinerary without relying on booking/hotel/flight integrations.

Tasks:

- Harden existing preferences, shortlist, selection, activities, and itinerary endpoints/UI.
- Preserve existing checklist/state-machine conventions.
- Add final-plan smoke/eval.
- Keep hotels/flights hidden or disabled unless separately validated.
- Add clear error and retry states.

Acceptance tests:

- Full web/API E2E passes for requirements → shortlist → place selection → activity exploration → itinerary.
- Scenario matrix passes for Greece, Japan, and Portugal.
- Existing quality evals remain green.
- No visible unvalidated links/images appear in E2E output.

### Milestone 5: Staging gates and launch approval

User stories:

- As an operator, I can run one staging checklist and know if alpha launch is blocked.
- As a product owner, I can approve or reject launch based on objective gate results.

Tasks:

- Add Railway staging deployment instructions/workflow.
- Add health/readiness endpoint checks.
- Add redacted logging/request IDs/user/session/run IDs.
- Add per-user rate limits and one-active-run/concurrency controls.
- Add staging smoke script covering auth, credentials, core workflow, and resource truthfulness.
- Document rollback and data deletion process.
- Document alpha data-reset/no-backup policy.

Acceptance:

- Railway staging deploy over HTTPS succeeds.
- Health/readiness pass.
- Auth/session isolation tests pass.
- Credential tests pass.
- Resource truthfulness gate passes with 100% of rendered visible URLs validated.
- Core workflow E2E/scenario matrix passes.
- User approves alpha launch.

## Deferred until beta/GA unless explicitly re-approved

- Flights/hotels/booking/payment flows.
- Rendering booking links without full provider-backed validation.
- Full AG-UI event gateway and event-sourced architecture.
- Separate `packages/travel-agent-contracts` package if a smaller shared type module is enough for alpha.
- Full CopilotKit typed action suite beyond needed alpha actions.
- Redis/queue if a simpler one-active-run lock plus timeout is enough.
- Reconnect/resume stream guarantees beyond safe retry/failure states.
- Full backup/restore rehearsal for alpha.
- General availability launch.
- Anonymous sessions.
- Multi-user collaborative trip editing.
- Browser-side provider/search/user LLM secrets.
- Arbitrary model-generated HTML/React/JS or arbitrary model-generated renderable URLs.

## Risks and mitigations

- Fake/broken URLs recur if renderers accept raw strings. Mitigation: renderer requires validation evidence and rejects raw/model URLs.
- `get_images` validation evidence is lost when stored as `imageLinks`. Mitigation: persist evidence records and migrate renderers first.
- User key handling leaks secrets. Mitigation: encrypted-at-rest, no plaintext responses, redaction, isolation tests, fallback keys only for explicit allowlist.
- Auth added too late causes rework. Mitigation: auth/session isolation is Milestone 2 before broad UI expansion.
- SearXNG/image legality or cost blocks launch. Mitigation: SearXNG attribution/cache/timeout policy is a Milestone 0 blocker.
- Alpha over-scopes into full production platform. Mitigation: defer AG-UI/full contracts/hotels/flights/GA unless explicitly re-approved.

## Open decisions for approval

1. Is the target launch a private production alpha? Recommended: yes.
2. Railway is the primary deployment target. Confirm staging/production service layout.
3. Recommended alpha stack: Railway Postgres for DB/storage; Railway env vars for app secrets; application-level envelope encryption for user LLM keys. Managed KMS can be deferred to beta/GA unless required before alpha.
4. SearXNG is the approved alpha image/search provider. Confirm attribution, cache/TTL, quota, and timeout policy.
5. Server-funded fallback LLM keys are allowed only for an explicit allowlist of user IDs/emails; everyone else brings their own key.
6. Production starts empty: do not migrate local/demo/dev sessions into alpha unless separately requested.
7. Hotels/flights should be hidden in alpha unless full link validation is complete. Recommended: yes.
8. Alpha data-reset/no-backup policy is acceptable; no backup/restore rehearsal for alpha.
