# Session Management

## Session File Structure

Sessions are stored as JSONL files with a tree structure. Each entry has an `id` and `parentId`, enabling in-place branching.

```mermaid
flowchart TD
    subgraph "JSONL Session File"
        H["Line 1: SessionHeader<br/>{type: session, version: 3, id, cwd}"]
        E1["Line 2: message {id: a, parentId: null, role: user}"]
        E2["Line 3: message {id: b, parentId: a, role: assistant}"]
        E3["Line 4: message {id: c, parentId: b, role: toolResult}"]
        E4["Line 5: message {id: d, parentId: c, role: assistant}"]
        E5["Line 6: model_change {id: e, parentId: d}"]
        E6["Line 7: message {id: f, parentId: e, role: user}"]
        E7["Line 8: message {id: g, parentId: f, role: assistant}"]
        E8["Line 9: message {id: h, parentId: d, ...}<br/>(BRANCH: new parentId = d)"]
    end

    H --> E1 --> E2 --> E3 --> E4 --> E5 --> E6 --> E7
    E4 --> E8

    style E8 fill:#2a4a2a,stroke:#4a8a4a,color:#fff
```

## Session Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created: SessionManager.create()
    [*] --> Opened: SessionManager.open(path)
    [*] --> Continued: SessionManager.continueRecent()
    [*] --> InMemory: SessionManager.inMemory()
    [*] --> Forked: SessionManager.forkFrom()

    Created --> Active
    Opened --> Active
    Continued --> Active
    InMemory --> Active
    Forked --> Active

    Active --> Persisting: First assistant message
    Persisting --> Active: appendMessage()

    Active --> Branching: /tree (switch to entry)
    Branching --> Active: switchBranch(entryId)

    Active --> Compacting: Context overflow or threshold
    Compacting --> Active: appendCompaction()

    Active --> NewSession: /new command
    NewSession --> Active

    Active --> ForkSession: /fork command
    ForkSession --> Active: New file created
```

## Session Branching in Detail

```mermaid
flowchart TD
    subgraph "Original Branch"
        U1["User: How do I..."] --> A1["Assistant: You can..."]
        A1 --> U2["User: Now fix the bug"]
        U2 --> A2["Assistant: Here's the fix..."]
    end

    subgraph "Branch Point (/tree selects A1)"
        A1 --> U3["User: Actually, try approach B"]
        U3 --> A3["Assistant: With approach B..."]
    end

    subgraph "Session Manager Internal"
        SM1["leafId = A2 (original)"]
        SM1 -->|"/tree selects A1"| SM2["leafId = A1"]
        SM2 -->|"New prompt"| SM3["leafId = A3 (new branch)"]
    end

    style U3 fill:#2a4a2a,stroke:#4a8a4a,color:#fff
    style A3 fill:#2a4a2a,stroke:#4a8a4a,color:#fff
    style SM2 fill:#2a3a5a,stroke:#4a6a9a,color:#fff
    style SM3 fill:#2a3a5a,stroke:#4a6a9a,color:#fff
```

## Session Context Building

`buildSessionContext()` reconstructs the LLM message array from the tree:

```mermaid
sequenceDiagram
    participant SM as SessionManager
    participant Branch as getBranch()
    participant Context as buildSessionContext()

    SM->>Branch: Walk from leafId to root
    Branch-->>SM: Ordered path of entries

    SM->>Context: For each entry in path
    Note over Context: Skip entries before compaction boundary

    alt type == "compaction"
        Context->>Context: Add compaction summary as user message
    end

    alt type == "branch_summary"
        Context->>Context: Add branch summary as user message
    end

    alt type == "message"
        Context->>Context: Add message (user/assistant/toolResult)
    end

    alt type == "custom_message"
        Context->>Context: Add as user message (if display)
    end

    alt type == "model_change"
        Context->>Context: Record current model
    end

    alt type == "thinking_level_change"
        Context->>Context: Record current thinking level
    end

    Context-->>SM: SessionContext {messages, thinkingLevel, model}
```

## Compaction Flow

When context exceeds the threshold or overflows:

```mermaid
flowchart TD
    A[Agent turn ends] --> B{Compaction enabled?}
    B -->|No| Z[Done]
    B -->|Yes| C{Context overflow error?}

    C -->|Yes| D{Already attempted recovery?}
    D -->|Yes| E[Emit error: recovery failed]
    D -->|No| F[Remove error message from state]
    F --> G[Run compaction with overflow reason]
    G --> H[Auto-retry the failed prompt]

    C -->|No| I[Calculate context tokens]
    I --> J{Over threshold?}
    J -->|No| Z
    J -->|Yes| K[Run compaction with threshold reason]

    subgraph "Compaction Process"
        G --> L[prepareCompaction: find split point]
        K --> L
        L --> M{Extension handler?}
        M -->|Yes| N[Extension generates summary]
        M -->|No| O[LLM generates summary of old messages]
        N --> P[appendCompaction to session]
        O --> P
        P --> Q[Rebuild messages from session context]
        Q --> R[Emit compaction_end event]
    end
```

## Session Storage Layout

```
~/.pi/agent/
  sessions/
    <encoded-cwd-1>/
      2025-01-15T10-30-00-000Z_<uuid>.jsonl
      2025-01-16T14-20-00-000Z_<uuid>.jsonl
    <encoded-cwd-2>/
      ...
  auth.json
  models.json
  settings.json
  keybindings.json
```
