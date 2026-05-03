# Main Orchestration Flow

## 1. Agent Loop with Tool Calls

The core orchestration loop processes user prompts, streams LLM responses, executes tool calls, and loops until the model stops requesting tools.

```mermaid
flowchart TD
    A[User sends prompt] --> B[AgentSession.prompt]
    B --> C{Extension command?}
    C -->|Yes| D[Execute extension command]
    C -->|No| E[Extension input hook]
    E --> F[Expand skills + templates]
    F --> G{Currently streaming?}
    G -->|Yes| H{streamingBehavior?}
    H -->|steer| I[Queue as steering msg]
    H -->|followUp| J[Queue as follow-up msg]
    G -->|No| K[Validate model + API key]
    K --> L[Check pre-prompt compaction]
    L --> M[Build user message + images]
    M --> N[Extension before_agent_start hook]
    N --> O[Agent.prompt - enters AgentLoop]

    O --> P[agent_start event]
    P --> Q[turn_start event]
    Q --> R{Pending steering msgs?}
    R -->|Yes| S[Inject steering messages]
    R -->|No| T[Stream assistant response]
    S --> T

    T --> U[transformContext hook]
    U --> V[convertToLlm - AgentMsg to LLM Msg]
    V --> W[streamSimple - call LLM provider]
    W --> X[Stream response tokens]
    X --> Y{stopReason?}

    Y -->|error/aborted| Z[turn_end + agent_end]
    Y -->|end_turn| AA{Has tool calls?}

    AA -->|No| AB[turn_end]
    AB --> AC{More steering msgs?}
    AC -->|Yes| Q
    AC -->|No| AD{Follow-up msgs?}
    AD -->|Yes| Q
    AD -->|No| AE[agent_end]

    AA -->|Yes| AF[Execute tool calls]
    AF --> AG[beforeToolCall hook]
    AG --> AH{Blocked?}
    AH -->|Yes| AI[Return error result]
    AH -->|No| AJ[Validate args + execute tool]
    AJ --> AK[afterToolCall hook]
    AK --> AL[Emit tool_execution_end]
    AI --> AL
    AL --> AM[turn_end]
    AM --> AC

    AE --> AN[Check auto-retry for errors]
    AN --> AO[Check auto-compaction]
    AO --> AP[Session persistence]
```

## 2. Message Event Lifecycle

Every message passes through a consistent event lifecycle:

```mermaid
sequenceDiagram
    participant User
    participant Session as AgentSession
    participant Agent
    participant AgentLoop
    participant LLM as LLM Provider
    participant Tool
    participant SM as SessionManager
    participant Ext as ExtensionRunner

    User->>Session: prompt(text)
    Session->>Session: Expand skills/templates
    Session->>Ext: input hook
    Session->>Agent: prompt(userMessage)
    Agent->>AgentLoop: runAgentLoop(messages, context, config)

    AgentLoop->>AgentLoop: emit agent_start
    AgentLoop->>AgentLoop: emit turn_start

    Note over AgentLoop: User message events
    AgentLoop->>Agent: message_start(userMsg)
    AgentLoop->>Agent: message_end(userMsg)
    Agent->>SM: appendMessage(userMsg)

    Note over AgentLoop: Stream LLM response
    AgentLoop->>LLM: streamSimple(model, context)
    LLM-->>AgentLoop: text chunks (streamed)
    AgentLoop->>Agent: message_update(partial)
    LLM-->>AgentLoop: tool_call blocks
    LLM-->>AgentLoop: end_turn

    AgentLoop->>Agent: message_end(assistantMsg)
    Agent->>SM: appendMessage(assistantMsg)

    Note over AgentLoop: Execute tool calls
    AgentLoop->>Agent: tool_execution_start
    AgentLoop->>Ext: tool_call hook (beforeToolCall)
    AgentLoop->>Tool: execute(args)
    Tool-->>AgentLoop: result
    AgentLoop->>Ext: tool_result hook (afterToolCall)
    AgentLoop->>Agent: tool_execution_end

    Note over AgentLoop: Tool result message
    AgentLoop->>Agent: message_start(toolResult)
    AgentLoop->>Agent: message_end(toolResult)
    Agent->>SM: appendMessage(toolResult)

    AgentLoop->>AgentLoop: emit turn_end
    AgentLoop->>AgentLoop: Check steering queue
    AgentLoop->>AgentLoop: Check follow-up queue

    alt No more messages
        AgentLoop->>Agent: agent_end
        Agent->>Session: Check auto-compaction
        Agent->>Session: Check auto-retry
    end
```

## 3. Tool Execution Modes

```mermaid
flowchart LR
    subgraph Sequential
        S1[Tool A: prepare] --> S2[Tool A: execute]
        S2 --> S3[Tool A: finalize]
        S3 --> S4[Tool B: prepare]
        S4 --> S5[Tool B: execute]
        S5 --> S6[Tool B: finalize]
    end

    subgraph Parallel
        P1[Tool A: prepare] --> P2[Tool B: prepare]
        P2 --> P3[Tool A: execute]
        P2 --> P4[Tool B: execute]
        P3 --> P5[Tool A: finalize]
        P4 --> P6[Tool B: finalize]
    end
```

## 4. Message Queue System

```mermaid
stateDiagram-v2
    [*] --> Idle

    Idle --> Processing: prompt()
    Processing --> Processing: Tool calls loop

    Processing --> CheckSteering: Turn ends
    CheckSteering --> Processing: Has steering msgs
    CheckSteering --> CheckFollowUp: No steering

    CheckFollowUp --> Processing: Has follow-up msgs
    CheckFollowUp --> Idle: No follow-ups

    state "User can queue" as Queueing {
        [*] --> SteerQueue: Enter (steer msg)
        [*] --> FollowUpQueue: Alt+Enter (follow-up)
    }

    Processing --> Queueing: User types while processing
```
