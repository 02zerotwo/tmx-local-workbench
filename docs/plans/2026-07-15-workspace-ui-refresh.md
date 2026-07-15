# Workspace UI Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a polished shadcn-based workspace with a draggable 50/50 split, stable Edit/AI panel width, and independent AI audit filters with an exact result count.

**Architecture:** A shadcn Resizable panel group owns the table/right-panel split, while one stable right-panel host switches between editor and AI content. The AI setup panel owns a separate filter reducer, uses the existing desktop query API for count previews, and snapshots those filters when creating an audit job.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn UI, Radix UI, react-resizable-panels, Vitest, Testing Library, Electron.

---

### Task 1: Add the shadcn resizable primitive

**Files:**
- Create: `src/components/ui/resizable.tsx`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Test: `src/components/project-workspace.test.tsx`

1. Add a failing workspace test that expects a horizontal resizable group, two panels with 50 percent defaults, and an accessible resize handle.
2. Run `pnpm exec vitest run src/components/project-workspace.test.tsx` and confirm the new assertion fails.
3. Install `react-resizable-panels` with pnpm and add the shadcn resizable wrapper.
4. Replace the fixed flex split in `ProjectWorkspace` with `ResizablePanelGroup`, `ResizablePanel`, and `ResizableHandle`.
5. Run the focused test and confirm it passes.

### Task 2: Unify workspace controls

**Files:**
- Modify: `src/components/project-workspace.tsx`
- Modify: `src/components/project-workspace.test.tsx`
- Modify: `src/components/ui/button-group.tsx`

1. Add failing tests for shadcn target-language Select and the Edit/AI segmented ButtonGroup.
2. Confirm the tests fail against the current NativeSelect and separate button layout.
3. Replace NativeSelect with Select and render both modes in one ButtonGroup with `aria-pressed` state.
4. Keep the right host mounted at the current dragged width while switching modes.
5. Convert ordinary workspace actions to ghost variants and retain destructive styling only for delete operations.
6. Run focused tests.

### Task 3: Add independent AI audit filters and count preview

**Files:**
- Modify: `src/components/ai/ai-mode-panel.tsx`
- Modify: `src/components/ai/audit-panels.tsx`
- Modify: `src/components/ai/audit-panels.test.tsx`
- Modify: `src/components/project-workspace.tsx`
- Modify: `src/lib/desktop-types.ts` only if a narrower API type requires it

1. Add failing tests showing that typing AI search text does not query immediately, Enter/click commits it, structured filters refresh the count, and main table filters are not reused.
2. Extend the AI panel props with project target languages and the existing `queryProject` API.
3. Add local draft and committed AI filters using `DEFAULT_PROJECT_FILTERS` as the initial value.
4. Query page one with a valid page size and use the returned `total` as the expected audit count.
5. Pass only AI-owned filters into `startAiAudit` and show the exact count in the confirmation dialog.
6. Lock filter controls while the current audit is running or paused and provide a clear-filters action.
7. Run AI and workspace focused tests.

### Task 4: Migrate remaining overlays to shadcn

**Files:**
- Modify: `src/components/translation-editor.tsx`
- Modify: `src/components/translation-editor.test.tsx`
- Modify: `src/components/ai/ai-mode-panel.tsx`
- Modify: `src/components/ai/ai-mode-panel.test.tsx`

1. Add failing tests that expect translation history in a shadcn Sheet and API-key deletion behind an AlertDialog.
2. Replace the hand-built history overlay with Sheet while preserving restore, focus return, loading, and error behavior.
3. Add a destructive API-key removal confirmation using AlertDialog.
4. Run focused editor and AI tests.

### Task 5: Apply the compact visual system

**Files:**
- Modify: `src/components/project-workspace.tsx`
- Modify: `src/components/project-library.tsx`
- Modify: `src/components/translation-editor.tsx`
- Modify: `src/components/ai/ai-mode-panel.tsx`
- Modify: `src/components/ai/audit-panels.tsx`
- Modify: `src/components/confirm-dialog.tsx`
- Modify: `src/app/globals.css`

1. Normalize header heights, toolbar spacing, borders, typography, and background surfaces.
2. Remove component-level classes that recreate shadcn button borders/backgrounds.
3. Use ghost variants for ordinary actions and red destructive variants for delete actions.
4. Keep status feedback, progress bars, focus rings, and disabled states visible.
5. Run all component tests touched by the visual refactor.

### Task 6: Verify the desktop application

**Files:**
- Verify all modified files

1. Run `pnpm test` and expect all tests to pass.
2. Run `pnpm lint` and expect no lint errors.
3. Run `pnpm build` and expect the static Next.js export to succeed.
4. Run `pnpm desktop:build` and expect Electron TypeScript compilation to succeed.
5. Run `git diff --check` and confirm no whitespace errors.
