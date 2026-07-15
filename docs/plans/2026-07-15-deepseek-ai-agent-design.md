# DeepSeek Translation AI Agent Design

## Goal

Add a project-scoped DeepSeek AI Agent to the Electron TMX workbench. The Agent supports persistent conversations, resumable audit jobs, tool calls, staged correction proposals, and explicit confirmation before any accepted translation is written to the main translation tables.

## Product Flow

1. The user opens the right-side AI mode.
2. The app verifies that a locally encrypted DeepSeek API key exists and can connect.
3. The user either starts or resumes a project conversation, or configures a batch audit.
4. Before an audit starts, the user confirms the immutable query snapshot and correction boundaries.
5. Local checks and DeepSeek thinking-mode checks run through a persistent queue.
6. Findings and proposed translations are saved to staging tables while the formal translation remains unchanged.
7. After the full audit, the user accepts, rejects, edits, or deselects proposals.
8. A final confirmation applies the selected proposals in one SQLite transaction and records complete translation history.

## UI Foundation

Before Agent features are added, initialize shadcn/ui with Radix primitives and migrate all reusable controls to `src/components/ui`. Existing domain behavior and TanStack virtual scrolling remain intact. Business components compose shadcn primitives instead of reimplementing buttons, inputs, dialogs, sheets, menus, progress bars, pagination, tooltips, and toast feedback.

AI Elements supplies the Agent-specific source components. Streamdown renders assistant Markdown in both streaming and static history modes. The first version enables the CJK and code plugins, disables raw HTML and remote images, and permits only `http`, `https`, and `mailto` links.

## Agent Architecture

Interactive project conversations use AI SDK 7 `ToolLoopAgent` with the DeepSeek provider. Deterministic batch audits use an explicit local workflow and queue instead of allowing the model to choose the next row. All model calls run in the Electron main process; the renderer receives typed IPC events and never receives the plaintext key.

The initial tool allowlist is:

- Read project summary.
- Search and read translation units.
- Run deterministic local checks.
- Prepare an audit scope draft.
- Inspect audit jobs and findings.
- Draft or revise staged translation proposals.
- Prepare an apply set for explicit confirmation.

Read tools may run automatically. Staging tools are reversible and auditable. Formal translation writes require a user confirmation and an application-owned transaction. The Agent cannot execute SQL, arbitrary files, arbitrary network calls, or system commands.

## Persistence And Recovery

SQLite stores sessions, structured UI messages, Agent runs, tool calls, checkpoints, audit jobs, queue items, findings, and apply sets. Each complete message and tool result creates a checkpoint. Long conversations use recent messages plus a persisted summary and on-demand project retrieval.

If the renderer closes while Electron remains active, the main process continues consuming and persisting the stream. If the process exits or the network stream breaks, the app marks the run interrupted and starts a new continuation from the last complete checkpoint. Batch audits resume exactly from the next unfinished immutable queue item.

## Data Safety

The DeepSeek key is encrypted with Electron `safeStorage` and is never stored in SQLite, logs, exports, or renderer state. Every staged finding records a translation content hash. Changed source or target content expires older suggestions. Final application rechecks hashes and commits all selected changes atomically; any failure rolls the entire apply transaction back while preserving staged results.

## UI Structure

The workspace keeps the current translation table and right-side panel. The right-side panel switches between Edit and AI modes. AI mode contains Conversation, Audit Jobs, and Review tabs, with a collapsible project conversation history drawer.

AI Elements maps as follows:

- Conversation, Message, PromptInput, Reasoning, Tool, and Checkpoint for persistent Agent sessions.
- Queue, Task, and Context for audit execution.
- Confirmation for audit start, stop, and final database application.
- Streamdown inside Message for Markdown rendering.

## Testing

- Component tests cover migrated shadcn controls without changing current editor behavior.
- Repository and migration tests cover all new SQLite entities and atomic application.
- IPC contract tests cover validation, trusted senders, event cleanup, and key secrecy.
- Agent tests use a fake model and fake tools; no test calls the live DeepSeek API.
- Queue tests cover pause, resume, retry, interruption, content hash expiry, and idempotency.
- Final verification runs unit tests, lint, Next static build, Electron TypeScript build, and desktop packaging checks.
