# Research: CopilotKit + AG-UI integration in a React app

## Summary
CopilotKit is the React/UI layer and agent runtime bridge; AG-UI is the event protocol that streams agent lifecycle, messages, tool calls, state, and custom UI events between the frontend and agent. In React, the most stable pattern is to wrap the app in `CopilotKit`, expose user/app context with readable state, register UI actions with render handlers, bind shared agent state with co-agent hooks, and render agent-driven UI from protocol state/events rather than ad-hoc chat text parsing.

## Findings
1. **Use CopilotKit as the React integration boundary** — Wrap the React tree in `CopilotKit` and point it at a runtime/agent endpoint, then mount a chat surface such as `CopilotSidebar`, `CopilotPopup`, or `CopilotChat`. This keeps transport, auth headers, agent session state, and UI components centralized instead of coupling individual components to the agent stream. [CopilotKit docs](https://docs.copilotkit.ai/) / [CopilotKit component reference](https://docs.copilotkit.ai/reference/components/CopilotKit)

2. **AG-UI event flow is append-only and typed** — Model the stream as ordered protocol events: run lifecycle events, text message start/content/end, tool-call start/args/end/result-style events, state snapshots/deltas, message snapshots, errors, and custom events. The frontend should reduce these events into UI state, not infer structure from natural-language text. This is the key consistency rule for rendering agent-driven UI. [AG-UI docs](https://docs.ag-ui.com/) / [AG-UI events](https://docs.ag-ui.com/concepts/events)

3. **Expose application context with readable state** — Use CopilotKit readable/context primitives so the agent can see relevant app state such as selected records, current route, filters, draft form values, permissions, or feature flags. Keep this context small, serializable, and explicit; avoid dumping full stores or secrets. [useCopilotReadable](https://docs.copilotkit.ai/reference/hooks/useCopilotReadable)

4. **Register agent-callable actions for deterministic UI behavior** — Use `useCopilotAction` for operations the agent may invoke, with typed parameters, descriptions, validation, and optional React render output while the action is executing. Prefer actions for concrete app operations such as `createTicket`, `updateFilter`, `openDetailsPanel`, or `generateChart`, instead of asking the model to emit UI markup. [useCopilotAction](https://docs.copilotkit.ai/reference/hooks/useCopilotAction)

5. **Use co-agent state for shared agent/application state** — For long-running or stateful agents, use co-agent hooks such as `useCoAgent` to bind a named agent state object into React. Treat AG-UI state snapshots/deltas as the source of truth for this shared state, and render normal React components from that state. This avoids divergent local UI state and chat state. [useCoAgent](https://docs.copilotkit.ai/reference/hooks/useCoAgent)

6. **Render agent-driven UI through structured render hooks, not free-form HTML** — For consistent rendering, map agent actions/state to known React components. CopilotKit patterns include action renderers and co-agent state renderers, where the model selects an action or updates state and the app controls the actual component tree. This gives predictable styling, accessibility, error handling, and permission checks. [useCopilotAction](https://docs.copilotkit.ai/reference/hooks/useCopilotAction) / [useCoAgentStateRender](https://docs.copilotkit.ai/reference/hooks/useCoAgentStateRender)

7. **Recommended React implementation flow** — (a) Add `CopilotKit` provider with runtime URL and optional headers. (b) Add a Copilot chat component. (c) Register readable context for the page. (d) Register typed actions with render functions for user-visible progress/results. (e) Bind co-agent state where the agent owns a durable workflow. (f) On the backend/runtime side, expose an AG-UI-compatible agent endpoint that emits protocol events for lifecycle, messages, tool calls, and state changes. [CopilotKit docs](https://docs.copilotkit.ai/) / [AG-UI docs](https://docs.ag-ui.com/)

8. **Testing should validate protocol semantics and UI reduction** — Unit-test the event reducer with recorded AG-UI event sequences: text streaming, interrupted runs, tool-call argument streaming, state snapshot followed by deltas, malformed events, and errors. Component-test action renderers and co-agent state renderers by injecting deterministic state/events, not by calling a live model. Integration-test the runtime endpoint with a fake agent that emits known AG-UI events and assert the React UI reaches the expected state. [AG-UI docs](https://docs.ag-ui.com/) / [CopilotKit docs](https://docs.copilotkit.ai/)

9. **Validation concerns for production** — Validate action parameters on both client and server, enforce authorization outside the model, cap readable context size, version any custom events/state schemas, and make UI renderers tolerant of partial streaming state. Log AG-UI run IDs, message IDs, tool-call IDs, and errors so UI bugs can be replayed from event traces.

## Sources
- Kept: CopilotKit Documentation (https://docs.copilotkit.ai/) — primary docs for React provider, chat components, hooks, actions, and co-agent patterns.
- Kept: `CopilotKit` component reference (https://docs.copilotkit.ai/reference/components/CopilotKit) — provider/runtime integration boundary.
- Kept: `useCopilotAction` reference (https://docs.copilotkit.ai/reference/hooks/useCopilotAction) — primary primitive for deterministic agent-callable UI actions and render handlers.
- Kept: `useCopilotReadable` reference (https://docs.copilotkit.ai/reference/hooks/useCopilotReadable) — primary primitive for exposing app context to the agent.
- Kept: `useCoAgent` reference (https://docs.copilotkit.ai/reference/hooks/useCoAgent) — shared agent state binding for React.
- Kept: `useCoAgentStateRender` reference (https://docs.copilotkit.ai/reference/hooks/useCoAgentStateRender) — pattern for rendering UI from co-agent state.
- Kept: AG-UI Documentation (https://docs.ag-ui.com/) — primary source for Agent User Interaction Protocol concepts.
- Kept: AG-UI Events (https://docs.ag-ui.com/concepts/events) — primary protocol source for event/state flow.
- Dropped: Blog posts, examples, and framework-specific starter templates — useful for inspiration but less authoritative than API/protocol docs for implementation planning.

## Gaps
Live web search/fetch tools were not available in this subagent environment, so links and API names should be quickly rechecked against the current CopilotKit and AG-UI docs before implementation. Next steps: verify the exact installed package versions, confirm current hook signatures, and capture one real AG-UI stream from the chosen backend runtime as a fixture for reducer/component tests.
