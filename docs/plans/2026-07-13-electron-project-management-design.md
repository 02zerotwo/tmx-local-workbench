# TMX Desktop Project Management Design

## Goal

Convert the current static TMX page into a Windows portable desktop application. Every imported TMX file becomes a persistent local project. Users can return to a project later, continue editing, filter and search its translation units, and export the current result to Excel.

## Product Structure

The application has two primary views:

1. Project library
   - Lists all imported projects.
   - Shows file name, language pair, total rows, changed rows, empty rows, import time, and last edited time.
   - Supports importing a new TMX file, opening a project, renaming a project, deleting a project, and opening the local data folder.
   - Uses a dense table or list layout intended for repeated work rather than a marketing dashboard.

2. Project workspace
   - Keeps the existing full-screen workbench model.
   - Adds a back button and project identity in the header.
   - Provides committed text search, target-language filter, status filter, duplicate-source filter, and clear filters.
   - Uses database pagination with 100, 200, or 500 rows per page, plus virtual scrolling inside the current page.
   - Keeps a right-side editor that saves a single row without rebuilding the full dataset.
   - Exports all rows or the current filtered result to Excel.

## Desktop Architecture

- Electron main process owns the application window, filesystem access, SQLite connection, TMX import jobs, and Excel export jobs.
- Next.js remains a statically exported renderer UI.
- A preload bridge exposes a small typed API to the renderer. Node integration remains disabled and context isolation remains enabled.
- The renderer never opens SQLite directly and never receives unrestricted filesystem access.
- Long-running import, search, and export operations report progress through Electron events.

## Local Data Model

### projects

- `id`: stable project UUID
- `name`: user-facing project name
- `source_file_name`: original TMX filename
- `source_language`: declared source language
- `target_languages`: JSON list of target languages
- `total_units`: imported row count
- `skipped_units`: filtered code/format row count
- `changed_units`: modified row count
- `empty_units`: empty target count
- `import_status`: importing, ready, or failed
- `created_at`: import timestamp
- `updated_at`: last edit timestamp

### translation_units

- `project_id` and `row_id`: composite identity
- `ordinal`: stable source order
- `external_id`: TMX `tuid`
- `source_lang`, `source_text`
- `target_lang`, `target_text`, `original_target_text`
- `status`: original, changed, or empty
- `duplicate_key`: normalized source-text key when duplicated
- `metadata_json`: TMX properties
- `updated_at`: last edit timestamp

Indexes cover project order, language, status, duplicate key, and common filter combinations. An FTS5 trigram table indexes identifiers, source text, target text, and metadata for substring search.

## Data Flow

### Import

1. User selects a TMX file from the project library.
2. The main process creates an `importing` project row.
3. TMX parsing cleans placeholder braces and rejects code-like rows using the existing rules.
4. Translation units are inserted in transactions of approximately 2,000 rows.
5. Duplicate groups and project counters are calculated.
6. The project becomes `ready` and opens automatically.
7. A failed import rolls back translation rows and leaves a readable failure record that can be removed or retried.

### Query

1. The renderer submits committed filters and page settings.
2. SQLite applies structured filters and text search.
3. The response returns total matches, current-page rows, and page metadata.
4. Changing any filter resets the page and scroll position.

### Edit

1. The editor keeps immediate local draft state.
2. A short debounce saves one row through the preload bridge.
3. Blur, row change, navigation, and export flush pending edits immediately.
4. SQLite updates the row and project counters in one transaction.

### Export

1. The renderer submits project ID and the chosen export scope.
2. The main process reads matching rows in chunks and builds the workbook.
3. The user chooses the output path with a native save dialog.
4. Progress and completion are shown in the workbench.

## Portable Data Location

The portable build first attempts to use a writable `data` directory beside the executable so copying the whole folder also copies all projects. If that location is read-only, it falls back to the user's local application-data directory and clearly shows the active data location in settings.

The application provides database backup, restore, and open-data-folder commands. Schema migrations run in a transaction and create a backup before destructive changes.

## Error Handling

- Database and filesystem errors are translated into user-facing Chinese messages.
- Import and export operations can be retried without restarting the application.
- A project with an incomplete import is never presented as editable.
- Deleting a project requires confirmation and removes its translations and search index in one transaction.
- Closing the window waits for a pending edit flush before shutdown.

## Testing

- Unit tests cover filter SQL generation, pagination, project counters, and text cleaning.
- Integration tests use a temporary SQLite database for project creation, import rollback, editing, deletion, and export queries.
- Renderer tests cover project navigation, filter submission, page reset, and editor draft flushing.
- Desktop smoke tests verify startup, preload API availability, local file selection, and window rendering.
- A Windows build workflow produces the portable ZIP and verifies the packaged executable starts.

## Delivery

The primary artifact is a Windows x64 ZIP containing the application executable, bundled runtime files, and an initially empty `data` directory. Users extract the folder and double-click the executable. No network service, Node.js installation, or database installation is required.
