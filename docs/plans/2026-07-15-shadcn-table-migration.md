# Shadcn Table Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate every remaining business table to shadcn/ui while preserving translation virtualization and existing project workflows.

**Architecture:** The shared shadcn `Table` primitive gains an optional container class so the translation table can keep one external scroll element. Translation rows remain virtualized and are rendered as semantic table rows; the project library uses ordinary shadcn table primitives.

**Tech Stack:** React 19, TypeScript, shadcn/ui, Tailwind CSS, TanStack Virtual, Vitest, Testing Library.

---

### Task 1: Lock Translation Table Behavior

**Files:**
- Create: `src/components/translation-table.test.tsx`

**Steps:**
1. Add failing tests for table semantics, headers, mouse selection, Enter/Space selection, selected state, empty translation state, and a page large enough to activate virtualization.
2. Run `pnpm test -- src/components/translation-table.test.tsx` and confirm the semantic-table assertions fail against the current grid implementation.

### Task 2: Support External Scrolling In The Table Primitive

**Files:**
- Modify: `src/components/ui/table.tsx`

**Steps:**
1. Add an optional `containerClassName` prop while preserving the standard table props and generated `data-slot` attributes.
2. Keep the default `overflow-x-auto` behavior for ordinary tables.
3. Use `cn` for both table and container class merging.

### Task 3: Migrate The Virtual Translation Table

**Files:**
- Modify: `src/components/translation-table.tsx`
- Test: `src/components/translation-table.test.tsx`

**Steps:**
1. Replace the custom header grid with `TableHeader`, `TableRow`, and `TableHead`.
2. Render virtual rows through `TableBody`, `TableRow`, and `TableCell` using the existing virtual positions and reserved total height.
3. Preserve fixed columns, truncation, loading and empty states.
4. Add keyboard activation and `aria-selected` without nesting invalid interactive elements inside rows.
5. Replace hand-styled statuses with shadcn `Badge`.
6. Run the focused test and confirm it passes.

### Task 4: Migrate The Project Library Table

**Files:**
- Modify: `src/components/project-library.tsx`
- Test: `src/components/project-library.test.tsx`

**Steps:**
1. Replace native `table`, `thead`, `tbody`, `tr`, `th`, and `td` tags with shadcn table primitives.
2. Update the sortable heading helper to render `TableHead`.
3. Preserve sticky headings, fixed widths, rename controls, row status, project actions, and sorting.
4. Run the project library tests and fix only semantic-role expectations affected by the migration.

### Task 5: Verify The Refactor

**Files:**
- Review all modified files.

**Steps:**
1. Search business components for remaining native table tags.
2. Run `pnpm test` and require all tests to pass.
3. Run `pnpm lint` and require zero errors or warnings.
4. Run `pnpm build` and `pnpm desktop:build`.
5. Run `git diff --check` and review the scoped diff.

No commits are included because this branch already contains uncommitted feature work that must remain intact.
