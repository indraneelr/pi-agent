# Low-Level Design (LLD)

## Package: `ai` - LLM Abstraction Layer

```mermaid
classDiagram
    class Model {
        +string id
        +string name
        +Api api
        +Provider provider
        +string baseUrl
        +boolean reasoning
        +number contextWindow
        +number maxTokens
    }

    class StreamOptions {
        +number temperature
        +number maxTokens
        +AbortSignal signal
        +string apiKey
        +Transport transport
        +CacheRetention cacheRetention
        +string sessionId
    }

    class Context {
        +string systemPrompt
        +Message[] messages
        +Tool[] tools
    }

    class AssistantMessage {
        +string role
        +ContentBlock[] content
        +string stopReason
        +string errorMessage
        +Usage usage
        +number timestamp
    }

    class ApiProvider {
        +stream(model, context, options) AssistantMessageEventStream
        +streamSimple(model, context, options) AssistantMessageEventStream
    }

    Model --> ApiProvider : resolved via api field
    ApiProvider --> AssistantMessage : produces
    Context --> ApiProvider : input
    StreamOptions --> ApiProvider : configuration
```

## Package: `agent` - Agent Loop

```mermaid
classDiagram
    class Agent {
        -MutableAgentState _state
        -Set~Listener~ listeners
        -PendingMessageQueue steeringQueue
        -PendingMessageQueue followUpQueue
        -ActiveRun activeRun
        +prompt(message) void
        +continue() void
        +steer(message) void
        +followUp(message) void
        +abort() void
        +subscribe(listener) unsubscribe
        +waitForIdle() Promise
    }

    class AgentState {
        +string systemPrompt
        +Model model
        +ThinkingLevel thinkingLevel
        +AgentTool[] tools
        +AgentMessage[] messages
        +boolean isStreaming
        +AgentMessage streamingMessage
        +Set pendingToolCalls
    }

    class AgentTool {
        +string name
        +string label
        +string description
        +TSchema parameters
        +execute(id, params, signal, onUpdate) AgentToolResult
    }

    class AgentLoopConfig {
        +Model model
        +convertToLlm(messages) Message[]
        +transformContext(messages) AgentMessage[]
        +getSteeringMessages() AgentMessage[]
        +getFollowUpMessages() AgentMessage[]
        +beforeToolCall(context) BeforeToolCallResult
        +afterToolCall(context) AfterToolCallResult
    }

    Agent --> AgentState : owns
    Agent --> AgentLoopConfig : creates per run
    AgentState --> AgentTool : has many
```

## Package: `coding-agent` - Core Module

```mermaid
classDiagram
    class AgentSession {
        +Agent agent
        +SessionManager sessionManager
        +SettingsManager settingsManager
        -ExtensionRunner extensionRunner
        -ModelRegistry modelRegistry
        -Map toolRegistry
        -Map toolDefinitions
        +prompt(text, options) void
        +steer(text) void
        +followUp(text) void
        +abort() void
        +compact(instructions) CompactionResult
        +setModel(model) void
        +cycleModel(direction) ModelCycleResult
        +setThinkingLevel(level) void
        +switchSession(entryId) void
    }

    class SessionManager {
        -FileEntry[] fileEntries
        -string sessionFile
        -string sessionId
        +appendMessage(message) void
        +appendCompaction(summary, ...) void
        +getBranch() SessionEntry[]
        +getTree() SessionTreeNode
        +buildSessionContext() SessionContext
        +switchBranch(entryId) void
        +newSession(cwd) void
        +forkSession() string
    }

    class ExtensionRunner {
        -Extension[] extensions
        +emit(event) any
        +emitToolCall(event) any
        +emitToolResult(event) any
        +emitInput(text, images, source) InputResult
        +getCommand(name) Command
    }

    class ModelRegistry {
        -AuthStorage authStorage
        -Model[] models
        +find(provider, id) Model
        +getApiKeyAndHeaders(model) AuthResult
        +getAvailable() Model[]
        +hasConfiguredAuth(model) boolean
    }

    class SettingsManager {
        +getCompactionSettings() CompactionSettings
        +getRetrySettings() RetrySettings
        +getDefaultProvider() string
        +getDefaultModel() string
    }

    AgentSession --> SessionManager
    AgentSession --> ExtensionRunner
    AgentSession --> ModelRegistry
    AgentSession --> SettingsManager
```

## Built-in Tools

| Tool | File | Purpose |
|------|------|---------|
| `read` | `tools/read.ts` | Read files with line ranges |
| `edit` | `tools/edit.ts` | Search-and-replace edits with diff output |
| `write` | `tools/write.ts` | Create/overwrite files |
| `bash` | `tools/bash.ts` | Shell command execution with timeout |
| `grep` | `tools/grep.ts` | Ripgrep-based search |
| `find` | `tools/find.ts` | File discovery with glob patterns |
| `ls` | `tools/ls.ts` | Directory listing |

## Session Entry Types

| Entry Type | Purpose |
|------------|---------|
| `session` | File header (version, id, cwd) |
| `message` | User/assistant/toolResult messages |
| `model_change` | Model switch record |
| `thinking_level_change` | Thinking level switch |
| `compaction` | Context compaction boundary |
| `branch_summary` | Summary of abandoned branch |
| `custom` | Extension-persisted data |
| `custom_message` | Extension messages in LLM context |
| `label` | User-defined bookmarks |
| `session_info` | Display name metadata |
