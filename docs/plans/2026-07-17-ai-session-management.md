# AI Session Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add persistent AI session rename/delete operations and lazily create new sessions using the first user message as a truncated title.

**Architecture:** Extend the existing SQLite repository and Electron IPC boundary with rename/delete methods. Keep an unsaved new conversation as `activeSessionId = null`; create it only on first send, using one shared title-normalization helper. Add row actions and confirmation dialogs to the history drawer.

**Tech Stack:** TypeScript, React 19, Electron IPC, better-sqlite3, Radix/shadcn UI, Vitest, Testing Library.

---

### Task 1: Session title helper

**Files:**
- Create: `src/lib/ai-session-title.ts`
- Create: `src/lib/ai-session-title.test.ts`

**Steps:**
1. Write failing tests for whitespace normalization, titles at 30 characters, and titles over 30 characters.
2. Run `pnpm test src/lib/ai-session-title.test.ts` and verify the missing-module failure.
3. Implement `createAiSessionTitle(content, maxLength = 30)` using Unicode code points and `…`.
4. Run the focused test and verify it passes.

### Task 2: Repository rename and delete

**Files:**
- Modify: `desktop/database/ai-agent-repository.ts`
- Modify: `desktop/database/ai-agent-repository.test.ts`

**Steps:**
1. Add failing tests that rename a trimmed title, reject an empty title, delete a session with related records, and reject a missing session.
2. Rebuild the Node native module if required, then run the focused repository test and verify the new assertions fail.
3. Implement `renameSession(sessionId, title)` and `deleteSession(sessionId)` with updated timestamps and affected-row validation.
4. Run the repository test and verify it passes.

### Task 3: Service and IPC API

**Files:**
- Modify: `src/lib/desktop-types.ts`
- Modify: `desktop/ipc/channels.ts`
- Modify: `desktop/preload-bridge.ts`
- Modify: `desktop/ai/translation-agent-service.ts`
- Modify: `desktop/ipc/register-handlers.ts`
- Modify: `desktop/ipc/ipc-contract.test.ts`
- Modify: `desktop/ipc/register-handlers.test.ts`

**Steps:**
1. Add failing IPC contract and handler tests for `renameAiSession` and `deleteAiSession`.
2. Run the two focused tests and verify the methods/channels are missing.
3. Add API types, channels, preload methods, service delegation, trusted-sender checks, input validation, and handlers.
4. Run focused IPC and service tests and verify they pass.

### Task 4: History drawer actions

**Files:**
- Create: `src/components/ai/session-history-drawer.test.tsx`
- Modify: `src/components/ai/session-history-drawer.tsx`

**Steps:**
1. Write failing UI tests for opening the per-session menu, submitting a rename, and confirming deletion.
2. Run the focused test and verify the actions are absent.
3. Add a compact more menu to each session row plus shadcn rename and delete dialogs.
4. Keep failed rename/delete dialogs open and disable actions while busy.
5. Run the focused test and verify it passes.

### Task 5: Lazy creation and state fallback

**Files:**
- Modify: `src/components/ai/agent-conversation.tsx`
- Modify: `src/components/ai/agent-conversation.test.tsx`
- Modify: `src/components/ai/ai-mode-panel.tsx`
- Modify: `src/components/ai/ai-mode-panel.test.tsx`

**Steps:**
1. Add failing tests proving new-session clicks do not persist, first send creates with the generated title, rename updates displayed state, and deleting the current session selects the newest remaining session or blank state.
2. Run focused component tests and verify failures.
3. Extend the component API picks with rename/delete and implement async handlers.
4. Change new-session behavior to clear active state without creating a record.
5. Generate the title only when first sending from blank state.
6. Pass rename/delete callbacks to the history drawer and refresh/select state after mutations.
7. Update AI panel API typing and mocks.
8. Run focused component tests and verify they pass.

### Task 6: Verification and packaging

**Files:**
- Verify all modified files.

**Steps:**
1. Run `git diff --check`.
2. Run `pnpm lint`.
3. Run `pnpm native:node && pnpm test`.
4. Run `pnpm build && pnpm desktop:build`.
5. Run `pnpm native:electron && pnpm exec electron-forge make`.
6. Verify the generated ZIP with `unzip -t`.

