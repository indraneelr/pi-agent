# ADR: Travel Agent Web/App Architecture

Status: Accepted
Date: 2026-06-14

## Context

The travel agent currently runs as a TUI/CLI (`packages/travel-agent`). We need
to expose it as a web/app interface. This ADR locks the core architecture
decisions so that P0–P4 implementation work can proceed without ambiguity.

## Decision

### 1. CopilotKit is the frontend conversation shell

The web UI will use [CopilotKit](https://www.copilotkit.ai/) as the conversation
shell provider. CopilotKit manages the chat surface, message rendering, and the
frontend runtime lifecycle. It talks to the backend via the AG-UI protocol.

### 2. AG-UI is the primary streaming/runtime protocol

[AG-UI](https://docs.ag-ui.co/) is the wire protocol for streaming events
between backend and frontend. The backend emits normalized events (text deltas,
tool start/end, state snapshots, UI blocks, run lifecycle) that are mapped to
AG-UI events on the wire.

Non-streaming REST endpoints exist for P0 baseline and testing, but AG-UI
streaming is the primary production transport.

### 3. Typed GenUI blocks are the v1 UI model

All structured UI (destination cards, checklists, itinerary timelines, etc.) is
represented as typed, validated blocks defined by a discriminated union schema.
A deterministic block composer on the server converts canonical travel state
into these blocks. The frontend renders each block kind with an approved
component.

### 4. Arbitrary model-generated HTML/JS/React is explicitly rejected for v1

The LLM never produces UI code directly. It operates exclusively through tools
that mutate canonical travel state. The server derives UI blocks from that
state. This guarantees:

- No XSS surface from model output.
- Deterministic, testable UI.
- No coupling between prompt engineering and rendering.

### 5. Package layout

| Package | Role |
|---|---|
| `packages/travel-agent` | Domain core, agent loop, tools, state, persistence. No web/server code. |
| `packages/travel-agent-server` | Backend server. Wraps the SDK via `TravelSessionManager`, exposes REST + AG-UI endpoints, owns session lifecycle. |
| `packages/travel-agent-web` | React/Vite web UI. Consumes REST (P0) and AG-UI streaming (P1+). |

### 6. ID ownership and mapping

| ID | Owner | Lifetime |
|---|---|---|
| `sessionId` | Server (`crypto.randomUUID()`) | Permanent per travel session. Used in persistence filenames and REST URLs. |
| CopilotKit `threadId` / `runId` | Transport layer (CopilotKit/AG-UI) | Ephemeral per conversation thread/run. |
| AG-UI transport IDs | Transport layer | Opaque to the domain. |

The server maintains a mapping between transport IDs (`threadId`, `runId`) and
the canonical app `sessionId`. Transport IDs are never persisted as the primary
key. When a CopilotKit/AG-UI request arrives, the server resolves the
`threadId` to the app `sessionId` (or creates a new session on first message)
before interacting with `TravelSessionManager`.

### 7. Server-side execution

The travel agent always runs server-side. Provider API keys and search provider
keys never reach the browser. The web client only sees the REST/AG-UI surface
and the derived state/blocks.

## Consequences

- The frontend is a thin rendering layer; all agent intelligence is server-side.
- Adding a new UI surface (mobile) reuses the same backend API and block schema.
- Block schema changes require coordinated server+client updates.
- The non-streaming REST API is a P0 convenience; AG-UI is the long-term path.
