# Full Sidebar Mode Switch Correction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make each workspace mode explicitly occupy the entire right sidebar and add styled tooltips to both mode icons.

**Architecture:** Keep both mode trees mounted under `WorkspaceDetailPanel` to preserve state, but apply explicit active `flex h-full w-full` and inactive `hidden` classes at the top-level sidebar layers. Wrap the editor and AI mode buttons with the shared Radix/shadcn Tooltip components.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, shadcn/ui Tooltip, Vitest, Testing Library

---

### Task 1: Specify full-sidebar switching and tooltips

**Files:**
- Modify: `src/components/project-workspace.test.tsx`
- Modify: `src/components/ai/ai-compact-toolbar.test.tsx`

**Step 1: Write failing tests**

Assert that the active mode region has `flex h-full w-full`, the inactive region has `hidden`, and those classes swap after clicking each mode button. Hover the two icon buttons and assert Tooltip text “进入 AI 模式” and “返回编辑模式”.

**Step 2: Verify failure**

Run: `pnpm test src/components/project-workspace.test.tsx src/components/ai/ai-compact-toolbar.test.tsx`

Expected: FAIL because the current regions do not expose explicit full-size mode classes and the buttons only use native titles.

### Task 2: Implement explicit mode layers and tooltips

**Files:**
- Modify: `src/components/workspace-detail-panel.tsx`
- Modify: `src/components/translation-editor.tsx`
- Modify: `src/components/ai/ai-compact-toolbar.tsx`
- Modify: `src/components/ai/ai-mode-panel.tsx`

**Step 1: Implement minimal behavior**

Use conditional Tailwind classes on top-level mode regions. Wrap both icon buttons in `Tooltip`, `TooltipTrigger`, and `TooltipContent`, retaining accessible labels and click callbacks. Apply the same AI-to-editor tooltip to loading and unconfigured-Key states.

**Step 2: Run focused tests**

Run: `pnpm test src/components/project-workspace.test.tsx src/components/translation-editor.test.tsx src/components/ai/ai-mode-panel.test.tsx src/components/ai/ai-compact-toolbar.test.tsx`

Expected: PASS.

### Task 3: Verify and commit

**Step 1:** Run `pnpm test`.

**Step 2:** Run `pnpm lint`.

**Step 3:** Run `pnpm build && pnpm desktop:build`.

**Step 4:** Commit with `git commit -m "fix: switch the full workspace sidebar mode"`.
