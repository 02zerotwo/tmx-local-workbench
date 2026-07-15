# Source Editing And History Drawer Design

## Goal

Improve the desktop translation editor so translators can edit both source and target text, copy either field to the Windows clipboard, reliably find and replace within the current target, and inspect complete versions from a right-side history drawer.

## Confirmed Behavior

- Keep the existing debounced automatic save.
- Every database save stores source text and target text together as one complete version.
- Restoring a version restores both fields and creates a new history version.
- Remove the old action that copied source text into the target editor.
- Source and target copy buttons copy their own text to the operating-system clipboard.
- Find and replace affects only the current target editor.
- The table pagination footer and editor action footer use the same fixed height.

## Data Model

Database migration v3 adds `original_source_text` to each translation unit and adds source snapshots to each history row. Existing projects initialize `original_source_text` from their current source text. Existing target-only history rows are backfilled with the translation unit's current source text because older source versions cannot be reconstructed.

The update API accepts both `sourceText` and `targetText`. A transaction reads the current unit, returns immediately when neither field changed, appends a complete before/after snapshot, updates the unit and project counters, and lets the existing FTS trigger refresh source and target search content. A unit counts as changed when either field differs from its imported original.

## Desktop Boundary

Clipboard writes use a typed Electron IPC method backed by Electron's `clipboard` module. This avoids depending on browser clipboard permissions in packaged Windows builds. The renderer receives a simple success result and shows a short inline confirmation.

## Editor Structure

The editor header contains the row identity, save state, and a history button. Source and target sections each have a compact heading row with a copy icon. Source becomes a textarea and participates in the same save queue as target.

The history button opens a drawer over the existing right editor region so the translation table width does not jump. Entries are newest first and show timestamp plus source and target previews. Restore is disabled while a restore is running.

Find and replace remains attached to the target section. Match calculation is literal and supports Unicode and line breaks. Navigation always focuses and selects the active match; replacing current or all updates the target draft through the same autosave path.

## Layout And Accessibility

Both bottom bars use a fixed 56px height. Previous and next buttons expose upward custom tooltips containing `Alt+Up` and `Alt+Down`, while accessible labels remain concise. Icon actions use Lucide icons and have focus-visible states.

## Verification

Repository tests cover migration, complete snapshots, unchanged saves, restore behavior, changed counters, and source FTS updates. IPC tests cover the new payload and clipboard route. Component tests cover source editing, autosave payloads, clipboard success/error feedback, find/replace behavior, drawer opening/restoring, and aligned footer classes. Full lint, type checking, tests, Next build, and Electron packaging run before delivery.
