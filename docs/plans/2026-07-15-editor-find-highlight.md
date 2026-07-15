# Editor Find Highlight Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add confirmed VS Code-style deferred find, case matching, all-match highlighting, selected-range initial capitalization, and action hints to the translation editor.

**Architecture:** Keep the native controlled textarea and separate query draft from the committed search. Compute literal match ranges from the committed query and render them in a synchronized, non-interactive mirror layer behind the textarea.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Lucide React, Vitest, Testing Library

---

### Task 1: Deferred and case-aware find

**Files:**
- Modify: `src/components/translation-editor.test.tsx`
- Modify: `src/components/translation-editor.tsx`

1. Add failing tests proving typing does not select or count matches until Enter or the find button is used.
2. Add failing tests for case-insensitive default matching and the case-sensitive toggle.
3. Run `pnpm test src/components/translation-editor.test.tsx` and confirm the expected failures.
4. Separate the find draft from the committed query and implement case-aware match ranges.
5. Run the focused tests and confirm they pass.

### Task 2: Match highlighting and replacement

**Files:**
- Modify: `src/components/translation-editor.test.tsx`
- Modify: `src/components/translation-editor.tsx`

1. Add failing tests for every highlighted match and the distinct active match.
2. Add a mirror highlight layer synchronized with textarea scrolling.
3. Update replace-current and replace-all to use committed case-aware ranges.
4. Run focused tests and confirm they pass.

### Task 3: Target initial capitalization

**Files:**
- Modify: `src/components/translation-editor.test.tsx`
- Modify: `src/components/translation-editor.tsx`

1. Add a failing test proving only the selected range's first English letter is capitalized while the selection is preserved.
2. Add the toolbar icon action, no-selection behavior, and hover hints, then route changes through the existing autosave draft flow.
3. Run focused tests and confirm they pass.

### Task 4: Regression verification

**Files:**
- Verify: `src/components/translation-editor.tsx`
- Verify: `src/components/translation-editor.test.tsx`

1. Run `pnpm test`.
2. Run `pnpm lint`.
3. Run `pnpm exec tsc --noEmit`.
4. Run `pnpm build`.
