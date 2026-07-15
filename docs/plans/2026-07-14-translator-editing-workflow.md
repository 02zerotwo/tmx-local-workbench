# Translator Editing Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add fast translation navigation and editing controls, current-row find/replace, folder-based export feedback, and complete translation version history to the Electron desktop application.

**Architecture:** SQLite migration v2 stores immutable per-row edit versions transactionally with translation updates. Typed Electron IPC exposes history reads and export-folder actions to the Next.js renderer. The workspace owns cross-page navigation and export notifications, while the editor owns draft manipulation, find/replace, save feedback, and history presentation.

**Tech Stack:** Electron, Next.js 15, React 19, TypeScript, better-sqlite3, Vitest, Testing Library, Tailwind CSS, Lucide React.

---

### Task 1: Persist complete translation versions

**Files:**
- Modify: `desktop/database/schema.ts`
- Modify: `desktop/database/unit-repository.ts`
- Modify: `src/lib/desktop-types.ts`
- Test: `desktop/database/unit-repository.test.ts`

**Steps:**
1. Write failing repository tests proving that a changed translation creates version 1 with before/after text and timestamp, a second update creates version 2, and no-op saves create no version.
2. Run `pnpm test desktop/database/unit-repository.test.ts` and verify the missing history API/schema failures.
3. Add migration v2 with `translation_unit_history`, foreign-key cascade, unique row/version constraint, and newest-first index.
4. Add `TranslationHistoryEntry`, `updatedAt`, transactional history insertion, and `getTranslationHistory(projectId, rowId)`.
5. Run the repository test and verify it passes.

### Task 2: Expose history and export-folder operations over IPC

**Files:**
- Modify: `src/lib/desktop-types.ts`
- Modify: `desktop/ipc/channels.ts`
- Modify: `desktop/preload-bridge.ts`
- Modify: `desktop/ipc/register-handlers.ts`
- Test: `desktop/ipc/ipc-contract.test.ts`
- Test: `desktop/ipc/register-handlers.test.ts`

**Steps:**
1. Write failing contract tests for `getTranslationHistory` and `openExportDirectory`.
2. Write failing handler tests for validated history lookup and opening an exported file's parent directory.
3. Add the request channels, bridge methods, validation, and handlers.
4. Run both IPC test files and verify they pass.

### Task 3: Select an export directory and generate a collision-safe filename

**Files:**
- Modify: `desktop/ipc/register-handlers.ts`
- Test: `desktop/ipc/register-handlers.test.ts`

**Steps:**
1. Write failing tests that expect an open-directory dialog, a sanitized project/date filename, and numeric suffixing when a file exists.
2. Add a small filename helper using `node:path` and `node:fs` structured APIs.
3. Replace the export save dialog with directory selection and pass the generated file path to the existing exporter.
4. Run the handler tests and verify cancellation and successful export behavior.

### Task 4: Add current-row find and replace plus editor action controls

**Files:**
- Modify: `src/components/translation-editor.tsx`
- Create: `src/components/translation-editor.test.tsx`

**Steps:**
1. Write failing component tests for copying source text, finding next/previous matches, replacing current/all matches, save feedback, and save-and-next.
2. Add the expandable literal find/replace toolbar and textarea selection management.
3. Put previous, next, copy source, save, and save-and-next on one stable action row.
4. Expose explicit save and navigation callbacks and show saved timestamps/transient success feedback.
5. Run the editor component tests and verify they pass.

### Task 5: Add cross-page navigation, shortcuts, history viewing, and export feedback

**Files:**
- Modify: `src/components/project-workspace.tsx`
- Modify: `src/components/project-workspace.test.tsx`

**Steps:**
1. Write failing workspace tests for previous/next navigation, crossing page boundaries, `Alt+ArrowUp/Down`, `Ctrl/Cmd+Enter`, history loading/restoring, and export success feedback.
2. Add pending cross-page selection state and always flush before navigation.
3. Load newest-first history when selection changes and refresh it after saves/restores.
4. Show export success with final path and an open-folder action.
5. Run workspace tests and verify they pass.

### Task 6: Full verification

**Files:**
- Verify all modified files.

**Steps:**
1. Run `pnpm test` and require zero failing tests.
2. Run `pnpm lint` and require zero lint errors.
3. Run `pnpm build` and require a successful static renderer export.
4. Run `pnpm desktop:build` and require a successful Electron TypeScript build.
5. Review the final source tree for stale generated files or browser-only dependencies.
