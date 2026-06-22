# Travel Agent Production Release Plan

Status: pending user approval  
Scope: planning only; do not implement until approved

## Goal

Deploy the travel agent to a production environment where real users can sign in, provide their own LLM keys, create isolated trip sessions, explore places/activities with real validated images/resources, and complete the core planning flow:

1. requirements gathering
2. initial place shortlist
3. selected-place exploration with images
4. activity research
5. itinerary generation

Flights and hotel booking are optional after the initial release. If exposed at all, their links must meet the same validation standard as every other resource link. Otherwise they stay hidden or disabled.

## Non-negotiable release gates

Production release is blocked until every required gate below passes in staging.

### 1. Real working links and images

Design rule: the model must not be trusted to invent renderable URLs. The UI may render only typed `ResourceEvidence` records created by provider/search tools and accepted by deterministic validators.

Required gates:

- No visible image/place/activity/hotel/flight URL may be rendered unless it has valid `ResourceEvidence`.
- Every rendered resource must include `url`, `finalUrl`, `provider`, `source`, `retrievedAt`, `validatedAt`, `expiresAt`, `httpStatus`, `contentType`, `validationLevel`, and rejection reason when invalid.
- Validation levels:
  - `reachable`: HTTP(S), redirect-followed, success status.
  - `usable`: content type/category matches the rendered purpose.
  - `fresh`: validation age is within configured TTL.
  - `bookable_or_searchable`: only for hotel/flight links where a provider/search page semantics are verified.
- Initial TTL target: 24 hours for images/place/activity links; shorter if provider terms require it. Final TTL must be confirmed before implementation.
- Initial image requirements: at least 3 validated images for each shortlist place and selected activity where provider coverage exists; if fewer are available, UI must show an explicit verified-empty/fallback state, not fake images.
- Allowed image content types: `image/jpeg`, `image/png`, `image/webp`, optionally `image/avif` if browser support is accepted.
- Minimum usable image dimensions: 400x250 for card/gallery display unless explicitly marked thumbnail.
- Live staging eval pass rate: 100% of rendered URLs in the release scenario matrix must be validated and non-broken. Any visible broken/unvalidated URL blocks release.
- Regression eval: if an LLM response contains a plausible but unvalidated URL, the renderer must reject it.

### 2. Image exploration

Users must be able to explore a place or activity through image galleries.

Required gates:

- Destination shortlist cards expose validated image galleries.
- Selected-place and activity views expose validated image galleries with attribution/source.
- Loading, error, no-results, and stale-resource states are explicit.
- Component and E2E tests verify gallery rendering, attribution, fallback behavior, and no raw URL rendering.

### 3. User LLM API keys

Users must be able to add their own Gemini, OpenAI, OpenRouter, and Llama/Ollama Cloud keys. Keys must be stored securely.

Required gates:

- Keys are encrypted at rest using managed KMS/envelope encryption or an explicitly approved production secret-management equivalent.
- Plaintext keys are never returned to the browser, stored in logs, stored in analytics, or included in errors.
- Key metadata can be listed; full key material cannot.
- Users can validate, rotate, and delete keys.
- Provider/model routing is scoped to the authenticated user/session.
- User A cannot read, test, route through, or delete user B's credentials.
- Server fallback keys are disabled by default for production unless explicitly approved.
- Master-key rotation/backups/restore behavior must be tested before launch.

### 4. Google sign-in and session isolation

Required gates:

- Google OIDC sign-in works in production over HTTPS.
- Server sessions use secure HTTP-only cookies.
- SameSite, CSRF, CORS, OAuth state, OAuth nonce, and session-fixation protections are tested.
- Every session/action/resource/credential/stream endpoint scopes by authenticated `userId`.
- AG-UI/CopilotKit transport IDs are never authorization authority; they map server-side to `(userId, sessionId, runId)`.
- Cross-user tests prove user A cannot read, mutate, stream, resume, or cancel user B's sessions/runs/resources/credentials.
- Production may launch with a beta allowlist if desired.

### 5. Standard-step UI with AG-UI and CopilotKit

Design rule: workflow state is server-owned and typed. AG-UI is the transport/event layer. CopilotKit is the assistant/action layer. LLM messages are not canonical state.

Required gates:

- Define shared contracts before implementation: `WorkflowStep`, `WorkflowEvent`, `ResourceEvidence`, `TravelUiBlock`, and typed Copilot actions.
- Pin AG-UI and CopilotKit versions before implementation.
- Add contract tests against installed package APIs.
- Backend emits normalized domain events first; AG-UI conversion is an adapter.
- CopilotKit can invoke only typed, authorized, server-validated actions.
- Finalizing/destructive actions require user confirmation unless a step explicitly supports auto-submit.
- Standard UI components cover all step statuses and safe fallback for unknown step types.

### 6. Background progress indicators

Required gates:

- Every long-running research/generation run emits progress events.
- Progress phases include at minimum: reading preferences, searching sources, validating links, validating images, scoring options, writing summary/itinerary, saving state.
- UI shows progress within an agreed threshold after run start; initial target: 2 seconds.
- Heartbeat/stale threshold and reconnect/resume behavior must be defined before implementation.
- UI exits loading/progress state on success, error, timeout, cancellation, retry, and stream disconnect.

### 7. Core travel workflow quality

Required gates:

- Existing Stage 2/3/4 quality evals remain green.
- Add final-plan eval before release-ready claim.
- Add full web/API E2E: requirements -> shortlist -> place selection -> activity exploration -> itinerary.
- Scenario matrix must include at least Greece, Japan, and Portugal plus varied preferences.
- Evals must define quantitative scoring thresholds before implementation: preference fit, activity fit, itinerary realism, resource coverage, and final-plan quality.
- CI uses deterministic mocked providers; staging release uses live-gated evals with clear retry budget and failure reporting.

### 8. Production deployment readiness

Required gates:

- Deployment target, DB, Redis/queue, KMS/secret manager, image/search providers, and LLM provider policy are selected before implementation of dependent tasks.
- Staging deployment is reproducible from CI/docs.
- Health/readiness endpoints check DB, storage, encryption config, provider config, and queue availability.
- Observability includes redacted structured logs, request IDs, user/session/run IDs, metrics, traces, and alert thresholds.
- Backup/restore and rollback rehearsal pass in staging.
- Data deletion for trips, sessions, and keys is tested.
- Abuse/cost controls exist: per-user rate limits, one active run policy, concurrency limits, provider failure isolation, and provider quota/budget safeguards.

## Architecture

### Canonical data model

Production state should follow this ownership model:

```text
User
  -> TravelSession
    -> WorkflowRun
      -> TravelState
        -> WorkflowStep
        -> WorkflowEvent
        -> ResourceEvidence
```

Every user-owned table/record must include or derive `userId`. Client-provided IDs are treated as opaque selectors only after authorization.

### Workflow step model

Required statuses:

- `pending`
- `active`
- `waiting_for_user`
- `running`
- `blocked`
- `completed`
- `failed`
- `skipped`

Required v1 step types:

- `requirements`
- `destination_shortlist`
- `place_exploration`
- `activities`
- `itinerary`
- `final_plan`

Optional post-v1/hidden-until-valid step types:

- `accommodation`
- `flights`

### Event model

Backend emits normalized events such as:

- `run_started`
- `step_started`
- `progress`
- `tool_started`
- `resource_candidate_found`
- `resource_validated`
- `state_snapshot`
- `ui_block`
- `step_completed`
- `run_error`
- `run_finished`

Reducers derive current state from events where practical. AG-UI maps these events to transport payloads but does not own state.

### Resource truthfulness model

LLM output may reference resource IDs only. It may not create renderable URLs. Provider-backed discovery and validation services create `ResourceEvidence`; UI renders only valid evidence.

### Auth and credential model

- Google OIDC creates authenticated users.
- HTTP-only server sessions protect web access.
- User LLM credentials are encrypted server-side.
- Provider routing happens on the server.
- Browser never receives provider/search/user LLM secrets.

## Milestones

### Milestone 0: Decisions and scope freeze

Decisions required before implementation:

- Deployment target: Vercel/Render/Fly/Railway/AWS/GCP/other.
- Managed Postgres provider.
- Redis/queue provider or alternative async-run lock system.
- KMS/secret manager/envelope-encryption approach.
- Google OAuth launch policy: public, beta allowlist, or domain allowlist.
- Image/search providers, attribution requirements, cache policy, quotas, and costs.
- Whether production allows server-funded fallback LLM keys.
- Data retention/deletion policy.
- Whether existing demo/file data is discarded or migrated. Preferred default: production starts empty unless user asks for migration.

Deliverables:

- Approved release scope.
- Approved provider/deployment/security choices.
- Updated ADR.
- This plan converted into implementation issues/tasks.

### Milestone 1: Shared contracts and production persistence foundation

Build first:

- Shared contracts package for workflow, events, resources, UI blocks, actions, auth-safe API responses.
- Workflow reducer and state-machine tests.
- Storage interfaces.
- Postgres schema/migrations.
- File-store adapter retained for local/dev.
- Production config validation.

Acceptance:

- Contracts are imported by server and web.
- Schema-from-scratch migration test passes.
- Ownership paths include `userId`.
- Reducer tests cover legal/illegal step transitions.

### Milestone 2: Google auth, isolated sessions, and secure credentials

Build:

- Google OIDC/session auth.
- Protected APIs.
- Cross-user authorization checks.
- Encrypted credential store.
- Provider metadata and validation/test-call APIs.
- Provider/model router.

Acceptance:

- Login/logout/current-user E2E passes.
- Cross-user endpoint tests pass for sessions, streams, resources, actions, and credentials.
- Credential encryption/redaction/deletion/rotation tests pass.
- No accidental fallback to another user's key or server key.

### Milestone 3: Resource validation and image exploration

Build:

- General resource validator.
- Image provider interface and validated image search.
- Place/activity resource discovery tools.
- Resource evidence persistence/cache.
- Prompt/tool changes banning model-invented renderable URLs.
- Renderer changes so raw URL fields are not directly displayed.

Acceptance:

- Broken, stale, wrong-type, redirected, timeout, unsupported-scheme, and fake/model-invented URLs are rejected in tests.
- Destination/activity image galleries render validated resources with attribution.
- Resource truthfulness eval passes in staging with 100% valid rendered URLs.

### Milestone 4: AG-UI/CopilotKit workflow UI

Build:

- Version-pinned AG-UI/CopilotKit integration.
- AG-UI gateway from normalized backend events.
- CopilotKit action contracts and authorized handlers.
- Standard-step UI components.
- Progress UI and run state handling.
- Cancellation/retry/one-active-run controls.

Acceptance:

- Contract tests pass against installed AG-UI/CopilotKit APIs.
- Stream tests prove progress, finalization, error, cancel, retry, and reconnect behavior.
- Component tests cover all statuses and core step types.
- Copilot actions mutate state only through typed authorized endpoints.

### Milestone 5: Core workflow hardening and evals

Build:

- Full web/API E2E for requirements -> shortlist -> image exploration -> activities -> itinerary.
- Final-plan quality eval.
- Resource truthfulness eval integrated into release gate.
- Scenario matrix for Greece/Japan/Portugal and varied preferences.
- Optional hotels/flights hidden unless their full link validation evals pass.

Acceptance:

- Stage 2 shortlist eval green.
- Activity research eval green.
- Itinerary eval green.
- Final-plan eval green.
- Web/API E2E green.
- No visible unvalidated links/images.

### Milestone 6: Production deployment, ops, and launch

Build:

- Deployment manifests/config.
- CI deploy workflow for staging/production.
- Health/readiness endpoints.
- Observability/redaction.
- Rate limits/concurrency/cost controls.
- Backup/restore, rollback, and data deletion flows.
- Ops runbook and user-facing docs.

Acceptance:

- Staging deploy from CI succeeds.
- Health/readiness pass.
- Staging smoke/E2E/eval matrix passes.
- Backup/restore and rollback rehearsal pass.
- User deletion and key deletion tests pass.
- User approves production launch.

## Initial file/work areas

Likely new files/packages:

- `packages/travel-agent-contracts/`
- `packages/travel-agent-contracts/src/workflow.ts`
- `packages/travel-agent-contracts/src/resources.ts`
- `packages/travel-agent-contracts/src/ui-blocks.ts`
- `packages/travel-agent-contracts/src/actions.ts`
- `packages/travel-agent/src/core/resource-validation.ts`
- `packages/travel-agent/src/core/resource-search/*`
- `packages/travel-agent/src/core/tools/find-resources.ts`
- `packages/travel-agent/scripts/resource-link-eval.ts`
- `packages/travel-agent/scripts/final-plan-eval.ts`
- `packages/travel-agent-server/src/auth/google.ts`
- `packages/travel-agent-server/src/auth/session.ts`
- `packages/travel-agent-server/src/storage/*`
- `packages/travel-agent-server/src/credentials/*`
- `packages/travel-agent-server/src/providers/model-router.ts`
- `packages/travel-agent-server/src/events/*`
- `packages/travel-agent-server/src/ag-ui/gateway.ts`
- `packages/travel-agent-server/src/actions.ts`
- `packages/travel-agent-server/migrations/*.sql`
- `packages/travel-agent-web/src/components/*`
- `packages/travel-agent-web/src/ProviderKeysPage.tsx`
- `deploy/*`
- `.github/workflows/travel-agent-deploy.yml`

Likely modified files:

- `docs/adr-web-app-architecture.md`
- `packages/travel-agent/src/core/types.ts`
- `packages/travel-agent/src/core/image-validation.ts`
- `packages/travel-agent/src/core/tools/get-images.ts`
- `packages/travel-agent/src/core/system-prompt.ts`
- `packages/travel-agent/src/index.ts`
- `packages/travel-agent/scripts/fresh-live-eval.ts`
- `packages/travel-agent/scripts/activity-research-eval.ts`
- `packages/travel-agent/scripts/itinerary-planning-eval.ts`
- `packages/travel-agent/scripts/accommodation-flight-eval.ts`
- `packages/travel-agent-server/src/config.ts`
- `packages/travel-agent-server/src/server.ts`
- `packages/travel-agent-server/src/session-manager.ts`
- `packages/travel-agent-server/src/ui-blocks.ts`
- `packages/travel-agent-web/src/api.ts`
- `packages/travel-agent-web/src/App.tsx`
- `packages/travel-agent-web/src/TravelCopilotChat.tsx`
- `package.json`

## Tests and eval matrix

Required automated categories:

- Workflow reducer/state-machine unit tests.
- Resource validation unit tests.
- Resource rendering regression tests.
- Image gallery component tests.
- Auth/session integration tests.
- Cross-user isolation tests for all endpoints.
- Credential encryption/redaction/rotation/deletion tests.
- AG-UI event/stream contract tests.
- CopilotKit action contract tests.
- Progress/reconnect/cancel/retry stream tests.
- Core flow web/API E2E.
- Stage 2/3/4/final-plan quality evals.
- Live-gated staging resource truthfulness eval.
- Deployment smoke tests.
- Backup/restore and rollback rehearsal.

Release commands will be finalized after package scripts are added. Existing quality checks to preserve:

- `npm test` in `packages/travel-agent`
- `npm run build` in `packages/travel-agent`
- `npx tsx scripts/debug-ollama-eval.ts`
- `npx tsx scripts/fresh-live-eval.ts`

## Risks and mitigations

- Fake/broken links recur if URLs remain prompt-driven. Mitigation: model can reference resource IDs only; renderer rejects unvalidated URLs.
- Provider/image legality or cost blocks launch. Mitigation: provider choices are Milestone 0 blockers.
- User key handling leaks secrets. Mitigation: encrypted-at-rest, redaction, no-browser exposure, security tests, no server fallback without approval.
- Auth added too late causes rework. Mitigation: auth/session isolation is Milestone 2 before UI expansion.
- AG-UI/CopilotKit API drift. Mitigation: version pinning and contract tests before gateway work.
- Live eval flakiness. Mitigation: deterministic mocked CI tests plus live staging gates with retry budget and clear failure reports.
- Flights/hotels over-scope v1. Mitigation: hide until provider-backed validation passes.
- Production data migration uncertainty. Mitigation: default to empty production start unless migration is explicitly approved and tested.

## Explicit non-goals for initial release

- No direct booking or payment flow.
- No guaranteed live hotel/flight availability unless a provider integration is implemented and validated.
- No anonymous production sessions.
- No browser-side provider/search/user LLM secrets.
- No rendering of unvalidated URLs.
- No arbitrary model-generated HTML/React/JS.
- No multi-user collaborative trip editing.
- No general availability launch until staging gates pass and the user approves.

## Open decisions for approval

1. Which deployment target should we use?
2. Which managed Postgres/Redis/KMS or secret-management stack should we use?
3. Which image/search providers are approved for production, attribution, cache policy, and cost?
4. Should production allow server-funded fallback LLM keys, or must every user bring a key?
5. Should launch be private alpha, public beta, or general availability?
6. Should production start empty, or do we need migration/backfill from existing file/demo sessions?
7. Should hotels/flights be completely hidden in v1 unless validation is complete?
