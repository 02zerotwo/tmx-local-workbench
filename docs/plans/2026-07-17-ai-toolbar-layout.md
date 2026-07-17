# AI Toolbar Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Collapse the AI panel header hierarchy into one responsive toolbar with a modal API-key settings flow.

**Architecture:** A shared compact toolbar renders the controlled AI tabs and priority-based actions. AgentConversation exposes its session controls through a render prop, while AiModePanel owns the settings dialog and composes the toolbar for both conversation and audit content.

**Tech Stack:** React 19, TypeScript, Radix/shadcn UI, Tailwind CSS, CSS container queries, Vitest, Testing Library

---

### Task 1: Define the compact toolbar behavior

**Files:**
- Create: `src/components/ai/ai-compact-toolbar.tsx`
- Create: `src/components/ai/ai-compact-toolbar.test.tsx`
- Modify: `src/app/globals.css`

1. Write failing component tests for the two mode triggers, persistent new-session action, history/settings actions and more menus.
2. Run the focused test and confirm the component is missing.
3. Implement the toolbar with compact buttons, accessible labels and separate medium/narrow overflow menus.
4. Add container-query rules for full, medium and compact layouts.
5. Re-run the focused test and confirm it passes.

### Task 2: Move conversation controls into the shared toolbar

**Files:**
- Modify: `src/components/ai/agent-conversation.tsx`
- Modify: `src/components/ai/agent-conversation.test.tsx`

1. Update the component test to expect no internal second-row header and to exercise toolbar-provided history/new-session callbacks.
2. Run the focused test and confirm the old header still renders.
3. Replace the internal header with a toolbar render prop that exposes session title, history callback and create callback.
4. Keep SessionHistoryDrawer and all conversation state inside AgentConversation.
5. Re-run the focused test and confirm behavior passes.

### Task 3: Add the Key settings dialog

**Files:**
- Create: `src/components/ai/ai-key-settings-dialog.tsx`
- Create: `src/components/ai/ai-key-settings-dialog.test.tsx`
- Modify: `src/components/ai/ai-mode-panel.tsx`
- Modify: `src/components/ai/ai-mode-panel.test.tsx`

1. Write failing tests for opening settings, validating, replacing and deleting a key.
2. Run focused tests and confirm the dialog/settings button are missing.
3. Implement the settings dialog with masked status, replacement input, validation action and destructive delete action.
4. Compose AiCompactToolbar in both conversation and audit tabs and remove the old Agent/Key/Tabs headers.
5. Re-run focused tests and confirm behavior passes.

### Task 4: Full verification

**Files:**
- No source changes expected.

1. Run `pnpm test`.
2. Run `pnpm lint`.
3. Run `pnpm build`.
4. Run `pnpm desktop:build`.
5. Run `git diff --check` and inspect the final diff for unrelated changes.

