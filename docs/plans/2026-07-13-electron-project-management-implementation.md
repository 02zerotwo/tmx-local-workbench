# Electron Project Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the TMX workbench into an Electron portable desktop app with SQLite-backed project management, database filtering and pagination, smooth single-row editing, and Excel export.

**Architecture:** Electron's main process owns SQLite, files, import, export, and project lifecycle. A typed preload bridge is the only boundary exposed to the statically exported Next.js renderer. The renderer has a project library view and a project workspace view; it only keeps the current page and editor draft in React state.

**Tech Stack:** Next.js 15, React 19, TypeScript, Electron, Electron Forge, better-sqlite3, saxes, SQLite FTS5 trigram, TanStack Virtual, SheetJS, Vitest, Testing Library.

---

## Constraints

- Preserve the existing TMX cleaning behavior and Excel column format.
- Do not expose Node.js or unrestricted filesystem access to the renderer.
- Keep all data local and avoid opening a localhost port.
- Reset page number and scroll position whenever committed filters change.
- Flush editor drafts before row changes, project navigation, export, and app close.
- The current directory is not a Git repository. Replace commit steps with verification checkpoints unless the user later initializes Git.
- A real Windows x64 artifact must be built on Windows because SQLite is a native dependency. Add a Windows workflow and keep local macOS verification separate.

### Task 1: Define Desktop Contracts and Workspace State

**Files:**
- Create: `src/lib/desktop-types.ts`
- Create: `src/lib/workspace-state.ts`
- Create: `src/lib/workspace-state.test.ts`
- Modify: `src/lib/types.ts`

**Step 1: Write failing state tests**

Cover these behaviors:

```ts
expect(applyWorkspaceAction(initial, { type: "set-query", query: "alarm" })).toMatchObject({
  filters: { query: "alarm" },
  page: 1,
});

expect(applyWorkspaceAction(pageThree, { type: "set-status", status: "changed" }).page).toBe(1);
expect(applyWorkspaceAction(initial, { type: "set-page-size", pageSize: 500 })).toMatchObject({ page: 1, pageSize: 500 });
```

**Step 2: Run the test and verify RED**

Run: `pnpm vitest run src/lib/workspace-state.test.ts`

Expected: FAIL because `workspace-state` does not exist.

**Step 3: Add typed desktop API contracts**

Define `ProjectSummary`, `ProjectDetail`, `TranslationUnitRow`, `ProjectFilters`, `ProjectQuery`, `ProjectQueryResult`, `ImportProgress`, `ExportProgress`, and `TmxDesktopApi`. The query result must include `rows`, `total`, `page`, `pageSize`, and `pageCount`.

**Step 4: Implement a pure workspace reducer**

Use a reducer or pure action function so text draft and committed query remain separate. Language, status, duplicate-only, clear-filters, and page-size actions all reset the page to one.

**Step 5: Run tests and verify GREEN**

Run: `pnpm vitest run src/lib/workspace-state.test.ts`

Expected: PASS.

### Task 2: Add SQLite Schema and Project Repository

**Files:**
- Create: `desktop/database/schema.ts`
- Create: `desktop/database/connection.ts`
- Create: `desktop/database/project-repository.ts`
- Create: `desktop/database/project-repository.test.ts`
- Create: `desktop/database/test-database.ts`

**Step 1: Write failing repository tests**

Test project creation, listing order by `updated_at`, rename, ready/failed status, deleting a project with all child rows, and counter updates.

**Step 2: Run the repository test and verify RED**

Run: `pnpm vitest run desktop/database/project-repository.test.ts`

Expected: FAIL because the repository does not exist.

**Step 3: Create migration version 1**

Create `projects`, `translation_units`, and `translation_search` tables. Use foreign keys and indexes:

```sql
CREATE INDEX idx_units_project_ordinal
ON translation_units(project_id, ordinal);

CREATE INDEX idx_units_project_language_status
ON translation_units(project_id, target_lang, status);

CREATE INDEX idx_units_project_duplicate
ON translation_units(project_id, duplicate_key);

CREATE VIRTUAL TABLE translation_search USING fts5(
  unit_key UNINDEXED,
  external_id,
  source_text,
  target_text,
  metadata_text,
  tokenize='trigram'
);
```

Enable `foreign_keys`, WAL mode, and a bounded busy timeout. Store schema version in `PRAGMA user_version` and run migrations inside transactions.

**Step 4: Implement portable path selection**

Attempt `<executable directory>/data/tmx-workbench.db` when packaged and writable. Fall back to Electron `userData` when it is not writable. In tests, always inject a temporary path.

**Step 5: Implement project CRUD and counters**

Use prepared statements and transactions. Project deletion must remove units and FTS rows atomically.

**Step 6: Run tests and verify GREEN**

Run: `pnpm vitest run desktop/database/project-repository.test.ts`

Expected: PASS.

### Task 3: Implement Database Filtering and Pagination

**Files:**
- Create: `desktop/database/unit-repository.ts`
- Create: `desktop/database/unit-repository.test.ts`
- Modify: `desktop/database/schema.ts`

**Step 1: Write failing query tests**

Seed at least two languages, original/changed/empty statuses, duplicate and unique source rows, and searchable Chinese and English text. Verify:

- target-language filtering;
- empty and changed filtering;
- duplicate-only filtering;
- combined filters use AND semantics;
- substring search matches Chinese and English;
- page two returns the correct stable ordinal range;
- total and page count are correct;
- editing one row updates search and status results.

**Step 2: Run the query test and verify RED**

Run: `pnpm vitest run desktop/database/unit-repository.test.ts`

Expected: FAIL because query methods do not exist.

**Step 3: Implement parameterized query building**

Build `WHERE` fragments and values separately. Use FTS5 trigram search for queries of at least three characters and escaped `LIKE` fallback for shorter queries. Never interpolate user text into SQL.

**Step 4: Implement count and page queries**

Use stable `ORDER BY ordinal, row_id`, then `LIMIT ? OFFSET ?`. Return only the requested page. Validate page sizes against `100`, `200`, and `500`.

**Step 5: Implement single-row updates**

Update `target_text`, derived status, FTS text, row timestamp, and project counters in one transaction.

**Step 6: Run tests and verify GREEN**

Run: `pnpm vitest run desktop/database/unit-repository.test.ts`

Expected: PASS.

### Task 4: Move TMX Cleaning and Add Streaming Import

**Files:**
- Create: `src/lib/text-cleaning.ts`
- Create: `src/lib/text-cleaning.test.ts`
- Create: `desktop/import/tmx-stream-parser.ts`
- Create: `desktop/import/tmx-stream-parser.test.ts`
- Create: `desktop/import/import-service.ts`
- Create: `desktop/import/import-service.test.ts`
- Modify: `src/lib/tmx.ts`

**Step 1: Extract existing cleaning regression tests**

Move brace cleaning and code-like detection expectations into pure Node-compatible tests. Preserve `{}Specification{}` to `Specification`, inline-code removal, and code-row rejection.

**Step 2: Run tests and verify RED where new APIs are missing**

Run: `pnpm vitest run src/lib/text-cleaning.test.ts desktop/import/tmx-stream-parser.test.ts`

**Step 3: Implement the streaming parser with `saxes`**

Capture header source language, translation-unit ID, properties, `tuv` language, and segment text. Ignore inline code tags while retaining surrounding natural text. Emit completed translation pairs incrementally.

**Step 4: Implement transactional batch import**

Create an importing project, insert rows in batches of about 2,000, emit progress, calculate duplicate groups, update counters, and mark ready. On any error, remove inserted child data and mark the project failed.

**Step 5: Run import tests and verify GREEN**

Run: `pnpm vitest run src/lib/text-cleaning.test.ts desktop/import/tmx-stream-parser.test.ts desktop/import/import-service.test.ts`

Expected: PASS.

### Task 5: Add Electron Shell, Preload Bridge, and IPC

**Files:**
- Create: `desktop/main.ts`
- Create: `desktop/preload.ts`
- Create: `desktop/ipc/register-handlers.ts`
- Create: `desktop/ipc/channels.ts`
- Create: `desktop/window.ts`
- Create: `desktop/global.d.ts`
- Create: `tsconfig.desktop.json`
- Modify: `package.json`
- Create: `forge.config.cjs`

**Step 1: Write an IPC contract smoke test**

Test that every method declared by `TmxDesktopApi` has a channel and preload wrapper, and progress subscriptions return unsubscribe functions.

**Step 2: Run the smoke test and verify RED**

Run: `pnpm vitest run desktop/ipc/ipc-contract.test.ts`

Expected: FAIL because Electron files do not exist.

**Step 3: Configure the secure BrowserWindow**

Use `contextIsolation: true`, `nodeIntegration: false`, a preload script, navigation restrictions, and a restrictive content security policy. Load Next dev URL only in development and `out/index.html` when packaged.

**Step 4: Expose the minimum typed bridge**

Expose project CRUD, file import dialog, paginated query, row update, Excel export, backup/restore, data directory, and progress subscriptions. Validate all IPC inputs in the main process.

**Step 5: Add desktop scripts and dependencies**

Add scripts for desktop TypeScript build, development, local packaging, and Forge ZIP generation. Configure ASAR and native-module unpacking for SQLite.

**Step 6: Run the IPC test and desktop typecheck**

Run: `pnpm vitest run desktop/ipc/ipc-contract.test.ts`

Run: `pnpm exec tsc -p tsconfig.desktop.json --noEmit`

Expected: both PASS.

### Task 6: Build the Project Library UI

**Files:**
- Create: `src/components/project-library.tsx`
- Create: `src/components/project-library.test.tsx`
- Create: `src/components/confirm-dialog.tsx`
- Create: `src/lib/desktop-api.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `vitest.config.ts`
- Create: `src/test/setup.ts`

**Step 1: Write failing renderer tests**

Mock the typed desktop API. Verify loading projects, empty state, import action, automatic project opening after import, rename, delete confirmation, and opening an existing project.

**Step 2: Run the component test and verify RED**

Run: `pnpm vitest run src/components/project-library.test.tsx`

Expected: FAIL because the project library does not exist.

**Step 3: Implement the project library**

Use a full-height operational layout with a compact header, primary import command, database backup/data-folder commands, summary strip, and a dense sortable project table. Avoid nested cards and marketing copy.

**Step 4: Handle non-desktop mode**

Show a clear message when the preload API is unavailable. Do not silently fall back to temporary in-memory storage.

**Step 5: Run component tests and verify GREEN**

Run: `pnpm vitest run src/components/project-library.test.tsx`

Expected: PASS.

### Task 7: Rebuild the Project Workspace Around Database Queries

**Files:**
- Create: `src/components/project-workspace.tsx`
- Create: `src/components/project-workspace.test.tsx`
- Create: `src/components/translation-table.tsx`
- Create: `src/components/translation-editor.tsx`
- Create: `src/components/pagination.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

**Step 1: Write failing interaction tests**

Verify that search only runs on Enter or the search button, structured filters apply immediately, every committed filter resets page one, clearing filters resets all controls, page changes query the requested page, and selecting a row opens the editor.

**Step 2: Write failing editor tests**

Use fake timers to verify immediate textarea updates, debounced single-row save, blur flush, row-change flush, export flush, and no full-list state update per keystroke.

**Step 3: Run tests and verify RED**

Run: `pnpm vitest run src/components/project-workspace.test.tsx`

Expected: FAIL because the database workspace components do not exist.

**Step 4: Implement database-backed workspace state**

Keep only project metadata, query state, current page rows, selection, and editor draft in React. Use `startTransition` for query results. Cancel or ignore stale query responses with a monotonically increasing request ID.

**Step 5: Implement pagination plus virtual scrolling**

Render 100, 200, or 500 database rows for the selected page. Virtualize the current page only. Provide previous, next, page number, page-size selector, total matches, and visible range. Scroll to top after every committed filter or page change.

**Step 6: Implement smooth editor persistence**

Keep draft text inside the editor component and debounce one-row IPC updates. Flush before operations that could lose the current draft.

**Step 7: Run interaction tests and verify GREEN**

Run: `pnpm vitest run src/components/project-workspace.test.tsx`

Expected: PASS.

### Task 8: Move Excel Export and Database Backup to Main Process

**Files:**
- Create: `desktop/export/excel-export-service.ts`
- Create: `desktop/export/excel-export-service.test.ts`
- Create: `desktop/database/backup-service.ts`
- Create: `desktop/database/backup-service.test.ts`
- Modify: `desktop/ipc/register-handlers.ts`
- Modify: `src/components/project-library.tsx`
- Modify: `src/components/project-workspace.tsx`

**Step 1: Write failing export and backup tests**

Verify all/filtered export row selection, unchanged Excel headings, progress callbacks, database backup creation, restore validation, and backup-before-restore behavior.

**Step 2: Run tests and verify RED**

Run: `pnpm vitest run desktop/export/excel-export-service.test.ts desktop/database/backup-service.test.ts`

Expected: FAIL because services do not exist.

**Step 3: Implement chunked Excel export**

Read rows in chunks, append to workbook data, update progress, and save through Electron's native save dialog. Reuse the current spreadsheet column names.

**Step 4: Implement backup and restore**

Checkpoint WAL before copying. Restore only after validating schema metadata, close and reopen the active connection, and refresh project state.

**Step 5: Run tests and verify GREEN**

Run: `pnpm vitest run desktop/export/excel-export-service.test.ts desktop/database/backup-service.test.ts`

Expected: PASS.

### Task 9: Add Windows Portable Packaging

**Files:**
- Create: `.github/workflows/build-windows.yml`
- Create: `build/README.md`
- Modify: `forge.config.cjs`
- Modify: `package.json`
- Modify: `next.config.ts`

**Step 1: Configure renderer and Electron production builds**

Build Next static output, compile desktop TypeScript, package application resources, unpack the SQLite native binary, and produce a Windows x64 ZIP.

**Step 2: Add a Windows build workflow**

Use a Windows x64 runner, install with the lockfile, run tests/lint/build, package with Forge, and upload the ZIP artifact. Do not publish externally.

**Step 3: Add portable folder documentation**

Document the executable, runtime files, `data` folder, database backup behavior, and unsigned-app Windows warning.

**Step 4: Verify local packaging configuration**

Run: `pnpm test`

Run: `pnpm lint`

Run: `pnpm build`

Run: `pnpm exec tsc -p tsconfig.desktop.json --noEmit`

Expected: all commands exit zero.

### Task 10: End-to-End Verification

**Files:**
- Modify only files required by discovered defects.

**Step 1: Run the full automated suite**

Run: `pnpm test`

Expected: all tests PASS with zero failures.

**Step 2: Run static checks**

Run: `pnpm lint`

Run: `pnpm build`

Run: `pnpm exec tsc -p tsconfig.desktop.json --noEmit`

Expected: all commands exit zero.

**Step 3: Run desktop smoke verification**

Launch the Electron development app, import a sample TMX, return to the project library, reopen it, search, combine filters, change pages, edit rapidly, restart the app, and verify the edit remains.

**Step 4: Verify export and project lifecycle**

Export filtered and all rows, delete a temporary project, back up the database, restore it, and verify project counters and translated text.

**Step 5: Verify the Windows artifact on Windows**

Download the workflow artifact, extract it into a normal user-writable folder, launch the executable without Node.js installed, and repeat the smoke flow. Record the ZIP filename and size in the delivery note.
