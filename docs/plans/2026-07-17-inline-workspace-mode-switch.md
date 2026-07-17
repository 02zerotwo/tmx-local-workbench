# Inline Workspace Mode Switch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the standalone workspace mode row and place bidirectional mode actions inside the editor and AI toolbars.

**Architecture:** Keep mode ownership and lazy AI mounting in `WorkspaceDetailPanel`, but expose mode-change callbacks through render props. Pass those callbacks into the editor header, editor empty state, AI toolbar, AI loading state, and AI key setup state so switching is always available without a dedicated row.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, shadcn/ui, Lucide React, Vitest, Testing Library

---

### Task 1: Specify mode switching behavior

**Files:**
- Modify: `src/components/project-workspace.test.tsx`
- Modify: `src/components/ai/ai-compact-toolbar.test.tsx`

**Step 1: Write the failing tests**

Update the workspace test to assert that no `tablist` named `工作模式` exists, that an `AI 模式` button opens the AI panel, and that an `编辑模式` button returns to the editor. Update the compact toolbar test to require and invoke `onOpenEditor`.

**Step 2: Run tests to verify they fail**

Run: `pnpm test src/components/project-workspace.test.tsx src/components/ai/ai-compact-toolbar.test.tsx`

Expected: FAIL because the standalone tabs still exist and the embedded mode buttons do not.

### Task 2: Implement render-prop mode controls

**Files:**
- Modify: `src/components/workspace-detail-panel.tsx`
- Modify: `src/components/project-workspace.tsx`
- Modify: `src/components/translation-editor.tsx`
- Modify: `src/components/ai/ai-mode-panel.tsx`
- Modify: `src/components/ai/ai-compact-toolbar.tsx`

**Step 1: Implement the minimal behavior**

Change `editor` and `aiPanel` to render props receiving mode callbacks. Remove `TabsList` and the fixed header row from `WorkspaceDetailPanel`, while preserving forced mounting and AI lazy mounting. Add accessible mode buttons to the editor header, empty state, AI toolbar, loading state, and key setup header.

**Step 2: Run focused tests**

Run: `pnpm test src/components/project-workspace.test.tsx src/components/translation-editor.test.tsx src/components/ai/ai-mode-panel.test.tsx src/components/ai/ai-compact-toolbar.test.tsx`

Expected: PASS.

### Task 3: Verify the complete change

**Files:**
- Verify only

**Step 1: Run all tests**

Run: `pnpm test`

Expected: all tests pass.

**Step 2: Run static checks**

Run: `pnpm lint`

Expected: no lint errors.

**Step 3: Run production builds**

Run: `pnpm build && pnpm desktop:build`

Expected: both builds complete successfully.

**Step 4: Commit**

```bash
git add docs/plans/2026-07-17-inline-workspace-mode-switch-design.md docs/plans/2026-07-17-inline-workspace-mode-switch.md src/components/workspace-detail-panel.tsx src/components/project-workspace.tsx src/components/project-workspace.test.tsx src/components/translation-editor.tsx src/components/ai/ai-mode-panel.tsx src/components/ai/ai-compact-toolbar.tsx src/components/ai/ai-compact-toolbar.test.tsx
git commit -m "feat: embed workspace mode controls"
```
