# DeepSeek Translation AI Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a shadcn-based, Streamdown-rendered, project-scoped DeepSeek AI Agent with persistent conversations, resumable batch audits, staged corrections, and confirmed transactional application.

**Architecture:** Electron main owns secrets, AI calls, Agent tools, workflows, and SQLite writes. React renders typed IPC state through shadcn/ui and AI Elements. Interactive conversations use `ToolLoopAgent`; deterministic audits use a persistent local queue.

**Tech Stack:** Electron 43, Next.js 15 static export, React 19, TypeScript, Tailwind CSS 3, shadcn/ui, AI Elements, Streamdown, Vercel AI SDK 7, `@ai-sdk/deepseek`, Zod, better-sqlite3, Vitest.

---

### Task 1: Establish The shadcn UI Foundation

**Files:**
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Create: `src/components/ui/*.tsx`
- Modify: `src/app/globals.css`
- Modify: `tailwind.config.ts`
- Modify: `package.json`
- Modify: existing files under `src/components`
- Test: existing component tests and focused UI primitive tests

**Steps:**
1. Add a failing smoke test that renders the first migrated business component through shadcn primitives.
2. Initialize shadcn with the Radix base, existing `@/*` alias, CSS variables, and the current Tailwind 3 setup.
3. Add only the primitives used by the existing app: button, input, textarea, label, select, checkbox, badge, tooltip, progress, separator, scroll-area, alert-dialog, dialog, sheet, dropdown-menu, popover, command, table, pagination, skeleton, and sonner.
4. Migrate confirmation, pagination, project library, workspace filters, translation table controls, and editor controls without changing domain state or handlers.
5. Run component tests, lint, Next build, and Electron TypeScript build.

### Task 2: Add The Streamdown Rendering Adapter

**Files:**
- Create: `src/components/ai/markdown-response.tsx`
- Create: `src/components/ai/markdown-response.test.tsx`
- Modify: `tailwind.config.ts`
- Modify: `src/app/globals.css`
- Modify: `package.json`

**Steps:**
1. Write failing tests for incomplete streaming Markdown, CJK emphasis, raw HTML rejection, and safe links.
2. Install Streamdown plus the CJK and code plugins.
3. Build one shared adapter with streaming/static modes, restricted protocols, no remote images, and Electron external-link handling.
4. Verify tests and the static desktop build.

### Task 3: Add AI Database Migrations And Repositories

**Files:**
- Modify: `desktop/database/schema.ts`
- Create: `desktop/database/ai-settings-repository.ts`
- Create: `desktop/database/ai-agent-repository.ts`
- Create: `desktop/database/ai-audit-repository.ts`
- Create: repository tests beside each repository

**Steps:**
1. Write migration tests for sessions, messages, runs, tool calls, checkpoints, audit jobs, items, findings, and apply sets.
2. Add the next idempotent database migration and indexes.
3. Implement repositories with typed row mapping and transaction boundaries.
4. Add tests for session history, branches, interrupted runs, queue resume, staging, hash expiry, and atomic apply rollback.
5. Run all database tests.

### Task 4: Add Encrypted DeepSeek Settings

**Files:**
- Create: `desktop/ai/secret-store.ts`
- Create: `desktop/ai/deepseek-client.ts`
- Create: corresponding tests
- Modify: `src/lib/desktop-types.ts`
- Modify: `desktop/ipc/channels.ts`
- Modify: `desktop/ipc/register-handlers.ts`
- Modify: `desktop/preload-bridge.ts`
- Modify: `desktop/preload.ts`

**Steps:**
1. Write failing tests for save, masked status, delete, unavailable encryption, and connection errors.
2. Encrypt the API key with `safeStorage` into an application data file; never return plaintext over IPC.
3. Add DeepSeek provider creation and a minimal connection check.
4. Add validated, trusted-sender-only IPC contracts.
5. Run secret, IPC, and preload contract tests.

### Task 5: Implement Agent Sessions And Tools

**Files:**
- Create: `desktop/ai/translation-agent.ts`
- Create: `desktop/ai/agent-tools.ts`
- Create: `desktop/ai/agent-runner.ts`
- Create: corresponding tests
- Modify: repositories and typed IPC contracts

**Steps:**
1. Write fake-model tests for conversation persistence, tool allowlisting, checkpoints, interruption, retry, and branch creation.
2. Define Zod-validated read, staging, and confirmation-gated tools.
3. Configure `ToolLoopAgent` with DeepSeek thinking mode, bounded steps, token budgets, and project instructions.
4. Persist structured message parts and every completed tool result while streaming typed events to the renderer.
5. Summarize long sessions and retrieve translation context on demand.
6. Run Agent and IPC tests without live network calls.

### Task 6: Implement The Deterministic Audit Workflow

**Files:**
- Create: `desktop/ai/audit-workflow.ts`
- Create: `desktop/ai/audit-rules.ts`
- Create: `desktop/ai/audit-schemas.ts`
- Create: corresponding tests
- Modify: repositories and typed IPC contracts

**Steps:**
1. Write failing tests for immutable filter snapshots, local rules, sequential progression, pause, resume, stop, retry, and stale suggestions.
2. Implement deterministic placeholder, tag, number, empty translation, and duplicate consistency checks.
3. Add DeepSeek structured audit output with Zod validation and bounded retry for empty or invalid JSON.
4. Persist each queue transition and finding before claiming the next item.
5. Implement final apply-set preparation and one-transaction application through the existing complete history mechanism.
6. Run audit and repository tests.

### Task 7: Build The AI Mode Interface

**Files:**
- Create: `src/components/ai/ai-mode-panel.tsx`
- Create: `src/components/ai/agent-conversation.tsx`
- Create: `src/components/ai/conversation-history.tsx`
- Create: `src/components/ai/audit-setup.tsx`
- Create: `src/components/ai/audit-progress.tsx`
- Create: `src/components/ai/audit-review.tsx`
- Create: focused component tests
- Modify: `src/components/project-workspace.tsx`

**Steps:**
1. Write component tests for key gating, session restore, send/stop/retry, audit setup, pause/resume, review selection, and final confirmation.
2. Add Edit/AI mode switching and Conversation/Audit Jobs/Review tabs.
3. Install only the required AI Elements source components and adapt them to existing compact workspace tokens.
4. Render message bodies through the shared Streamdown adapter.
5. Connect typed IPC events with cleanup, stable state transitions, and accessible keyboard/focus behavior.
6. Run focused and full component tests.

### Task 8: Verify And Package

**Files:**
- Modify: `package.json` version
- Modify: packaging documentation if needed

**Steps:**
1. Run `pnpm test` and fix failures.
2. Run `pnpm lint` and fix actionable errors.
3. Run `pnpm build` and `pnpm desktop:build`.
4. Verify API keys and reasoning text are absent from logs, SQLite exports, Excel exports, and renderer payloads.
5. Build the Windows x64 distributable and record the exact output artifact.
6. Review the branch diff for unrelated changes before reporting completion.
