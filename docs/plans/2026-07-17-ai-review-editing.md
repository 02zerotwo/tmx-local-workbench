# AI Review Editing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow persisted editing of pending AI Agent suggested translations and make applied audit jobs immutable.

**Architecture:** Add a typed desktop API that updates only the staged Agent revision text after service-level status validation. Add audit workflow guards for applied jobs and mirror both rules in React so invalid actions are unavailable before they reach IPC.

**Tech Stack:** TypeScript, React 19, Electron IPC, SQLite/better-sqlite3, Vitest, Testing Library

---

### Task 1: Persist edited Agent suggestions

**Files:**
- Modify: `desktop/ai/agent-revision-service.test.ts`
- Modify: `desktop/database/ai-agent-revision-repository.ts`
- Modify: `desktop/ai/agent-revision-service.ts`

1. Add failing service tests proving a pending suggestion can be updated and blank or non-pending suggestions are rejected.
2. Run `pnpm test desktop/ai/agent-revision-service.test.ts` and confirm the missing update method fails.
3. Add a repository method that updates `suggested_target_text` and `updated_at`.
4. Add service validation for trimmed non-empty text and `pending` status.
5. Re-run the focused test and confirm it passes.

### Task 2: Expose the Agent revision update through IPC

**Files:**
- Modify: `src/lib/desktop-types.ts`
- Modify: `desktop/ipc/channels.ts`
- Modify: `desktop/preload-bridge.ts`
- Modify: `desktop/ipc/ipc-contract.test.ts`
- Modify: `desktop/ipc/register-handlers.ts`
- Modify: `desktop/ipc/register-handlers.test.ts`

1. Add failing contract and handler tests for `updateAiAgentRevision(revisionId, suggestedTargetText)`.
2. Run the focused IPC tests and confirm the new method/channel is missing.
3. Add the typed API, request channel, preload forwarding and trusted handler.
4. Validate both identifiers and allow the service to provide domain validation for the edited text.
5. Re-run the focused IPC tests and confirm they pass.

### Task 3: Add Agent review editing UI

**Files:**
- Modify: `src/components/ai/agent-conversation.test.tsx`
- Modify: `src/components/ai/revision-review-list.tsx`
- Modify: `src/components/ai/agent-conversation.tsx`
- Modify: `src/components/ai/ai-mode-panel.tsx`
- Modify: `src/components/ai/ai-mode-panel.test.tsx`

1. Add a failing component test that expands a pending suggestion, edits its suggested translation, saves it, and verifies the desktop API call.
2. Run the focused component test and confirm the edit control is missing.
3. Add per-row draft/editing state, textarea, save/cancel controls and non-empty validation to `RevisionReviewList`.
4. Pass the update callback through `AgentConversation`, refresh revisions after save, and extend the relevant API picks.
5. Re-run the focused component tests and confirm they pass.

### Task 4: Lock applied audit jobs in the workflow

**Files:**
- Modify: `desktop/ai/audit-workflow.test.ts`
- Modify: `desktop/database/ai-audit-repository.ts`
- Modify: `desktop/ai/audit-workflow.ts`

1. Add failing tests proving an applied job rejects both a single finding decision and bulk acceptance.
2. Run `pnpm test desktop/ai/audit-workflow.test.ts` and confirm the guards are absent.
3. Add repository lookup for a finding and workflow helpers that require an editable job.
4. Guard `setFindingDecision` and `acceptAllPendingFindings`.
5. Re-run the focused workflow test and confirm it passes.

### Task 5: Make applied audit details read-only

**Files:**
- Modify: `src/components/ai/audit-panel.test.tsx`
- Modify: `src/components/ai/audit-review-detail.tsx`

1. Add failing tests for an initially applied job and for immediate locking after apply succeeds.
2. Run the focused component test and confirm edit actions remain enabled.
3. Derive a local read-only state from the job and successful apply action.
4. Disable all decision-changing controls, close edit fields on apply, and show a short read-only status.
5. Re-run the focused component test and confirm it passes.

### Task 6: Full verification

**Files:**
- No source changes expected.

1. Run `pnpm test`.
2. Run `pnpm lint`.
3. Run `pnpm build`.
4. Run `pnpm desktop:build`.
5. Run `git diff --check` and inspect the final diff for unrelated changes.

