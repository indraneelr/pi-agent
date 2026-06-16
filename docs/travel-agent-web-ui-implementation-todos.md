# Travel Agent Web/App UI Implementation Todo List — Priority Ordered

Goal: expose the travel agent as a production-oriented web/app interface using CopilotKit + AG-UI, with typed GenUI blocks rendered by approved frontend components.

Principles:
- Run the travel agent server-side. Do not expose provider/search keys to the browser.
- Use CopilotKit for the conversation shell.
- Use AG-UI for streaming runtime events between frontend and backend.
- Use typed, validated GenUI blocks. Do not allow arbitrary model-generated HTML/JS/React.
- Keep one canonical server-owned travel state per session.
- Make the UX choice-first: cards, buttons, and actions, not only free-text chat.
- Prioritize core end-to-end functionality before cleanup/hardening. Defer package cleanup, deeper validations, and production polish until the browser flow works.

## P0 — Critical path to first usable web demo

These are the highest-priority tasks. Do these first. The goal is one working browser flow: create session → send message → agent responds → state appears in UI.

### 1. Lock the architecture decision

- [x] Write a short architecture decision record.
  - [x] CopilotKit is the frontend conversation shell.
  - [x] AG-UI is the primary streaming/runtime protocol.
  - [x] Typed GenUI blocks are the v1 UI model.
  - [x] Arbitrary model-generated HTML/JS/React is explicitly rejected for v1.
- [x] Define the package layout.
  - [x] `packages/travel-agent` remains the domain/agent core.
  - [x] `packages/travel-agent-server` wraps the agent and exposes APIs.
  - [x] `packages/travel-agent-web` contains the web UI.
- [ ] Define ID ownership.
  - [x] Server generates app `sessionId` / `conversationId`.
  - [x] CopilotKit/AG-UI `threadId` and `runId` are treated as opaque transport IDs.
  - [ ] Add a server-side mapping between transport IDs and app session IDs.

### 2. Create the backend server package

- [x] Create `packages/travel-agent-server`.
  - [x] Add TypeScript config.
  - [x] Add package scripts: `dev`, `build`, `check`, `test`.
  - [x] Choose Fastify or Express; prefer Fastify.
- [x] Add server configuration.
  - [x] Port/env config.
  - [x] Provider/model config.
  - [x] Search provider config.
  - [x] Data directory config.
  - [x] CORS config for local web dev.
- [ ] Implement `GET /health`.
  - [ ] Return server version/environment/readiness.
  - [x] Verify with curl.

### 3. Wrap the existing travel-agent SDK server-side

- [x] Implement `TravelSessionManager`.
  - [x] Create sessions.
  - [x] Cache active sessions in memory.
  - [ ] Rehydrate sessions from persisted state.
  - [x] Enforce one active run per session.
- [ ] Wrap `createTravelSession(...)`.
  - [x] Pass model/provider/search/dataDir safely from server config.
  - [ ] Subscribe to agent/session events.
  - [ ] Map internal events to normalized backend events.
- [ ] Add MVP file-backed persistence.
  - [x] Store canonical travel state as JSON.
  - [ ] Persist after state-changing events.
  - [ ] Keep the adapter interface ready for DB later.

### 4. Implement the minimal REST session API

- [x] Implement `POST /api/travel/sessions`.
  - [x] Create server-owned `sessionId`.
  - [x] Initialize empty travel state.
  - [x] Return session metadata and state snapshot.
- [x] Implement `GET /api/travel/sessions/:sessionId`.
  - [x] Return session metadata.
  - [x] Return canonical travel state.
  - [x] Return current phase/checklist.
- [x] Implement `POST /api/travel/sessions/:sessionId/messages`.
  - [x] Accept user text.
  - [x] Run the agent once.
  - [x] Return final assistant message and state snapshot.
  - [x] Reject if another run is already active.
- [ ] Add validation.
  - [ ] Validate session IDs.
  - [x] Validate message body.
  - [ ] Validate max input length.

### 5. Verify the backend without any web UI

- [ ] Build the server package.
- [x] Start the server locally.
- [x] Verify `GET /health` with curl.
- [x] Verify `POST /api/travel/sessions` with curl.
- [x] Verify `GET /api/travel/sessions/:sessionId` with curl.
- [ ] Verify `POST /api/travel/sessions/:sessionId/messages` with one real travel prompt.
- [x] Confirm persisted state is written to disk.
- [ ] Confirm duplicate concurrent sends are rejected cleanly.

### 6. Create the web app package

- [x] Create `packages/travel-agent-web`.
  - [x] React + Vite.
  - [x] TypeScript strict mode.
  - [ ] Tailwind or existing design system.
  - [x] Scripts: `dev`, `build`, `check`, `test`.
- [x] Build the base app shell.
  - [x] Header.
  - [x] Main chat column.
  - [x] Right sidebar.
  - [x] Responsive mobile layout.
  - [x] Loading/error states.
- [x] Implement API client.
  - [x] Create session.
  - [x] Get session state.
  - [x] Send message.
  - [x] Surface server errors clearly.

### 7. Build the first non-streaming browser flow

- [x] Implement session lifecycle.
  - [x] Create new session.
  - [x] Resume session from URL/local storage.
  - [x] Reset session.
  - [x] Show session/run status.
- [x] Build `TravelChat` MVP.
  - [x] Message list.
  - [x] Message composer.
  - [x] Send message to non-streaming REST endpoint.
  - [x] Render assistant response.
- [x] Build `TravelSidebar` MVP.
  - [x] Checklist progress.
  - [x] Current phase.
  - [x] Preferences summary.
  - [x] Selected destinations.
- [x] Verify in browser.
  - [x] App renders actual UI inside `#root`.
  - [x] Create session from browser.
  - [x] Send one real trip prompt.
  - [x] Assistant response appears.
  - [x] Sidebar updates from returned state snapshot.

## P1 — Make it feel like an agent product

These tasks make the web app useful and interactive, but they should come after the non-streaming end-to-end path works.

### 8. Add typed GenUI block schema

- [ ] Create shared UI schema module/package.
  - [ ] Use Zod or TypeScript discriminated unions.
  - [ ] Share types between server and web.
- [x] Define base UI block envelope.
  - [x] `id`
  - [x] `kind`
  - [x] `version`
  - [x] `title`
  - [x] `data`
  - [x] `actions`
  - [x] `sourceStatePath`
- [ ] Define v1 block types.
  - [ ] `checklist_progress`
  - [ ] `trip_preferences_summary`
  - [ ] `destination_cards`
  - [ ] `selected_destinations`
  - [ ] `activity_cards`
  - [ ] `itinerary_timeline`
  - [ ] `accommodation_area_cards`
  - [ ] `flight_option_cards`
  - [ ] `budget_summary`
  - [ ] `final_plan`
  - [ ] `evidence_links`
- [ ] Add validation.
  - [ ] Server validates blocks before sending.
  - [ ] Frontend validates blocks before rendering.
  - [ ] Unknown block kinds render a safe fallback.
- [x] Add deterministic block composer.
  - [x] Convert canonical travel state into UI blocks.
  - [x] Do not rely on the model to invent component types.

### 9. Render the first structured UI blocks

- [x] Build `DestinationCards`.
  - [x] Destination name/summary.
  - [x] Why it fits.
  - [x] Trade-offs.
  - [x] Seasonality if available.
  - [x] Select/remove action placeholders.
- [x] Build richer `TravelSidebar` blocks.
  - [x] Checklist progress.
  - [x] Trip preferences summary.
  - [x] Selected destinations.
  - [x] Budget summary.
- [x] Render UI blocks inline or beside chat.
- [ ] Verify destination cards render from real state.

### 10. Add AG-UI streaming gateway

- [ ] Add AG-UI runtime endpoint.
  - [ ] `POST /api/agi/stream` or compatible CopilotKit route.
  - [ ] Accept CopilotKit/AG-UI request shape.
  - [ ] Map transport thread/run IDs to internal session IDs.
- [ ] Define normalized backend event envelope before AG-UI conversion.
  - [ ] `text_delta`
  - [ ] `message_done`
  - [ ] `tool_start`
  - [ ] `tool_end`
  - [ ] `tool_error`
  - [ ] `state_snapshot`
  - [ ] `ui_block`
  - [ ] `run_error`
  - [ ] `run_finished`
- [ ] Map backend events to AG-UI events.
  - [ ] Stream text deltas.
  - [ ] Stream tool start/end.
  - [ ] Stream state snapshots.
  - [ ] Stream typed UI blocks.
  - [ ] Stream run errors visibly.
  - [ ] Always emit run finished/done events.
- [ ] Add direct stream debug endpoint if useful.
  - [ ] `POST /api/travel/sessions/:sessionId/messages/stream`
  - [ ] Useful for curl testing independent of CopilotKit.

### 11. Wire CopilotKit to AG-UI

- [ ] Install/wire CopilotKit in the web app.
  - [ ] Use modern provider import for self-managed AG-UI agents.
  - [ ] Configure backend AG-UI endpoint.
  - [ ] Verify app renders before adding complex UI.
- [ ] Replace or augment non-streaming chat path with AG-UI streaming.
- [ ] Show tool/run status indicators.
- [ ] Stream assistant text into chat.
- [ ] Stream state snapshots into sidebar.
- [ ] Stream UI blocks into structured renderers.
- [ ] Verify browser behavior.
  - [ ] AG-UI request leaves browser.
  - [ ] Text stream appears incrementally.
  - [ ] Cards/sidebar update during or after run.
  - [ ] Stream errors are visible, not infinite “Streaming”.

### 12. Add user actions from cards back to the agent

- [ ] Define block action schema.
  - [ ] `select_destination`
  - [ ] `remove_destination`
  - [ ] `approve_activity`
  - [ ] `reject_activity`
  - [ ] `revise_itinerary_day`
  - [ ] `choose_accommodation_area`
  - [ ] `shortlist_flight`
  - [ ] `ask_followup`
- [ ] Implement action endpoint.
  - [ ] `POST /api/travel/sessions/:sessionId/actions`
  - [ ] Validate action payloads.
  - [ ] Map actions to deterministic state update or agent message.
- [ ] Add action handlers.
  - [ ] Select destination.
  - [ ] Remove destination.
  - [ ] Approve/reject activity.
  - [ ] Revise itinerary day.
  - [ ] Choose accommodation area.
  - [ ] Shortlist flight.
  - [ ] Ask follow-up.
- [ ] Add run locking to actions.
  - [ ] No concurrent message/action runs for same session.
  - [ ] Friendly response if a run is already active.
- [ ] Verify every action results in a clear UI response.
  - [ ] Optimistic state where safe.
  - [ ] Revert on validation failure.
  - [ ] Agent continuation where needed.

## P2 — Complete the travel planning product surface

These expand from destination discovery into full itinerary/product UX.

### 13. Build remaining structured travel components

- [ ] Build `ActivityCards`.
  - [ ] Activity summary.
  - [ ] Suitable traveler type.
  - [ ] Time/budget indicators.
  - [ ] Approve/reject actions.
- [ ] Build `ItineraryTimeline`.
  - [ ] Day-by-day sections.
  - [ ] Morning/afternoon/evening blocks.
  - [ ] Travel time notes.
  - [ ] Revise day action.
- [ ] Build `AccommodationCards`.
  - [ ] Area name.
  - [ ] Pros/cons.
  - [ ] Best for.
  - [ ] Price band.
  - [ ] Select area action.
- [ ] Build `FlightCards`.
  - [ ] Route summary.
  - [ ] Time windows.
  - [ ] Layovers.
  - [ ] Price sample/source.
  - [ ] Shortlist action.
- [ ] Build `FinalPlan`.
  - [ ] Overview.
  - [ ] Itinerary.
  - [ ] Booking checklist.
  - [ ] Risks/assumptions.
  - [ ] Export/share action later.

### 14. Add full happy-path trip planning E2E

- [ ] Create session.
- [ ] Provide trip requirements.
- [ ] Generate destination shortlist.
- [ ] Select destinations via cards.
- [ ] Generate activities.
- [ ] Approve/reject activities.
- [ ] Build itinerary.
- [ ] Render accommodation and flight options if available.
- [ ] Render final plan.
- [ ] Confirm state persists and survives refresh.

### 15. Improve session persistence and state versioning

- [ ] Make canonical travel state explicit and versioned.
  - [ ] Add `stateVersion`.
  - [ ] Add migrations if schemas change.
- [ ] Persist messages and state snapshots.
  - [ ] MVP file store.
  - [ ] Production DB adapter later.
- [ ] Improve resume behavior.
  - [ ] Load previous state from persistence.
  - [ ] Preserve message history if supported by core.
  - [ ] Recover gracefully from missing/corrupt state.

## P3 — Reliability, diagnostics, and test coverage

These should start early for critical paths, but full coverage can come after the demo works.

### 16. Backend tests

- [ ] Unit tests.
  - [ ] Session manager.
  - [ ] ID mapping.
  - [ ] Event mapper.
  - [ ] UI block composer.
  - [ ] Action validators.
- [ ] Integration tests.
  - [ ] Create session.
  - [ ] Send message.
  - [ ] Stream message.
  - [ ] Persist/rehydrate session.
  - [ ] Reject concurrent runs.
- [ ] Stream tests.
  - [ ] Direct stream completes.
  - [ ] Tool events are ordered.
  - [ ] State snapshot is emitted after state changes.
  - [ ] Errors do not leave stream hanging.

### 17. Frontend tests and browser verification

- [ ] Frontend tests.
  - [ ] App renders.
  - [ ] Session creation flow.
  - [ ] Chat send flow.
  - [ ] Sidebar state render.
  - [ ] Card action dispatch.
  - [ ] Unknown block fallback.
- [ ] Browser verification checklist.
  - [ ] Open served app.
  - [ ] Confirm `#root` contains rendered UI.
  - [ ] Send real message.
  - [ ] Verify AG-UI request leaves browser.
  - [ ] Verify streamed response appears.
  - [ ] Verify cards/sidebar update from state snapshot.
  - [ ] Inspect DOM text if accessibility snapshot appears stale.

### 18. Observability and diagnostics

- [ ] Add request/run IDs across server logs and streams.
- [ ] Add structured logs.
  - [ ] Session created.
  - [ ] Message received.
  - [ ] Run started/finished.
  - [ ] Tool start/end/error.
  - [ ] State persisted.
- [ ] Add timing metrics.
  - [ ] Full run time.
  - [ ] Tool latency.
  - [ ] Search latency.
  - [ ] Streaming duration.
- [ ] Add development debug panel.
  - [ ] Current session ID.
  - [ ] Last events.
  - [ ] Last state snapshot.
  - [ ] Stream status.
- [ ] Add safe audit trace export for failed sessions.

### 19. Error handling and hardening

- [ ] Define error model.
  - [ ] User-visible recoverable errors.
  - [ ] Internal errors with request/run IDs.
  - [ ] Safe redaction for provider/search failures.
- [ ] Add browser-debug-friendly error surfacing.
  - [ ] Convert backend run errors into visible frontend failure state.
  - [ ] Include run/request IDs in debug payloads.
- [ ] Handle frontend fallback cases.
  - [ ] Unknown block kind.
  - [ ] Failed stream.
  - [ ] Lost session.
  - [ ] Run already active.
  - [ ] Provider/search unavailable.

## P4 — Production readiness

These move the system from demo/internal-beta to production-capable.

### 20. Auth, ownership, and rate limits

- [ ] Add authentication plan.
  - [ ] Anonymous local demo mode.
  - [ ] Magic link or OAuth later.
  - [ ] Per-user session ownership.
- [ ] Add rate limits.
  - [ ] Per IP/user.
  - [ ] Per session/run.
  - [ ] Tool/search throttles.
- [ ] Add secrets hygiene.
  - [ ] Server-only provider keys.
  - [ ] No keys in web bundle.
  - [ ] Redact logs.

### 21. Deployment and CI

- [ ] Add deployment config.
  - [ ] Dockerfile.
  - [ ] Environment variable docs.
  - [ ] Health/readiness checks.
- [ ] Add CI checks.
  - [ ] Typecheck.
  - [ ] Tests.
  - [ ] Build server.
  - [ ] Build web.
- [ ] Move from file persistence to production DB when ready.
  - [ ] Choose DB.
  - [ ] Add migration setup.
  - [ ] Implement DB persistence adapter.

### 22. Security and privacy review

- [ ] Security review.
  - [ ] CORS.
  - [ ] Auth/session ownership.
  - [ ] Prompt/input logging redaction.
  - [ ] Tool abuse prevention.
- [ ] Privacy/data retention policy.
  - [ ] Trip data deletion.
  - [ ] Export user session.
  - [ ] Redacted logs.

### 23. Mobile app path

- [ ] Define mobile app plan.
  - [ ] Reuse same backend API.
  - [ ] React Native/Expo shell.
  - [ ] Native card renderers.
  - [ ] Push notifications later.
- [ ] Only start mobile UI after the web API and block schema are stable.

## Recommended implementation sequence

1. `packages/travel-agent-server` with `GET /health`.
2. `POST /api/travel/sessions`.
3. `GET /api/travel/sessions/:sessionId`.
4. `POST /api/travel/sessions/:sessionId/messages` with non-streaming response.
5. Curl verification of backend end-to-end.
6. `packages/travel-agent-web` React/Vite app.
7. Non-streaming chat + sidebar browser flow.
8. Typed UI block schema and deterministic block composer.
9. Destination cards and checklist/sidebar renderers.
10. AG-UI streaming endpoint.
11. CopilotKit + AG-UI frontend integration.
12. Card actions back to backend.
13. Activity/itinerary/accommodation/flight/final-plan components.
14. E2E happy-path browser test.
15. Observability, error surfacing, and test hardening.
16. Auth/rate limits/deployment/production DB.
