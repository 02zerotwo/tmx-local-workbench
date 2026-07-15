# Source Editing And History Drawer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add complete source/target version saves, reliable desktop clipboard actions, source editing, a history drawer, working target find/replace, and aligned bottom toolbars.

**Architecture:** Upgrade SQLite to v3 and make source plus target the atomic translation-unit update boundary. Expose the update and clipboard operations through typed Electron IPC, then keep renderer drafts in one editor save queue and render history as an overlay drawer.

**Tech Stack:** Electron, Next.js, React, TypeScript, better-sqlite3, Vitest, Testing Library, Tailwind CSS, Lucide React.

---

### Task 1: Complete Version Persistence

**Files:**
- Modify: `desktop/database/schema.ts`
- Modify: `desktop/database/unit-repository.ts`
- Modify: `src/lib/desktop-types.ts`
- Test: `desktop/database/unit-repository.test.ts`

**Steps:**
1. Add failing migration tests for `original_source_text` and source history snapshots.
2. Run the focused repository tests and verify the new assertions fail.
3. Add migration v3 with safe backfills for existing projects and history.
4. Add failing tests for atomic source/target updates, unchanged updates, changed counters, source search, and complete restore snapshots.
5. Change the repository update transaction to accept `{ sourceText, targetText }` and store complete before/after snapshots.
6. Run focused repository tests until green.

### Task 2: Typed IPC And System Clipboard

**Files:**
- Modify: `desktop/ipc/channels.ts`
- Modify: `desktop/ipc/register-handlers.ts`
- Modify: `desktop/preload-bridge.ts`
- Modify: `src/lib/desktop-types.ts`
- Test: `desktop/ipc/ipc-contract.test.ts`
- Test: `desktop/ipc/register-handlers.test.ts`

**Steps:**
1. Add failing tests for the complete update payload and `copyText` request.
2. Run IPC tests and verify missing handlers/contracts fail.
3. Add a validated clipboard handler backed by an injected Electron clipboard writer.
4. Update the preload bridge and renderer API types.
5. Run IPC tests until green.

### Task 3: Workspace Save And Restore Integration

**Files:**
- Modify: `src/components/project-workspace.tsx`
- Test: `src/components/project-workspace.test.tsx`

**Steps:**
1. Add failing tests asserting source and target are sent together for autosave and restore.
2. Verify the tests fail against the target-only API.
3. Update save, optimistic row replacement, history refresh, and restore flows.
4. Run workspace tests until green.

### Task 4: Editor Interaction And History Drawer

**Files:**
- Modify: `src/components/translation-editor.tsx`
- Test: `src/components/translation-editor.test.tsx`

**Steps:**
1. Add failing tests for editable source text and atomic save payloads.
2. Add failing tests for source/target clipboard actions and success/error feedback.
3. Add failing tests that open and close the top history drawer and restore a complete snapshot.
4. Add focused regression tests for Unicode find navigation, current replacement, all replacement, and textarea focus selection.
5. Implement separate source and target drafts with one queued save operation.
6. Implement top copy controls through desktop IPC and remove the old bottom copy action.
7. Refactor find/replace selection state and implement the overlay history drawer.
8. Run editor tests until green.

### Task 5: Footer Alignment And Regression Verification

**Files:**
- Modify: `src/components/pagination.tsx`
- Modify: `src/components/translation-editor.tsx`
- Test: `src/components/translation-editor.test.tsx`
- Test: `src/components/project-workspace.test.tsx`

**Steps:**
1. Add assertions for equal fixed footer heights and shortcut tooltip content.
2. Set both footer containers to `h-14` and add upward custom tooltips.
3. Run component tests, then the full test suite.
4. Run lint, TypeScript checking, Next.js production build, Electron build, and Electron packaging.
5. Report the package path, size, and checksum.
