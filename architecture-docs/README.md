# Pi Mono Architecture Documentation

Architecture diagrams and documentation for the pi-mono codebase.

## Documents

| Document | Description |
|----------|-------------|
| [01 - High-Level Design](./01-high-level-design.md) | Package architecture, design principles, data flow overview |
| [02 - Low-Level Design](./02-low-level-design.md) | Class diagrams for `ai`, `agent`, `coding-agent`; built-in tools; session entry types |
| [03 - Orchestration Flow](./03-orchestration-flow.md) | Agent loop with tool calls, message event lifecycle, tool execution modes, message queue system |
| [04 - Session Management](./04-session-management.md) | Session file structure, lifecycle, branching, context building, compaction, storage layout |
| [05 - Coding Agent Example](./05-coding-agent-example.md) | End-to-end trace of "Fix the typo in README.md" through all layers, edit tool detail, extension hooks |

## Rendering

These documents use Mermaid syntax for diagrams. They render natively on GitHub and in VS Code with the Mermaid extension.
