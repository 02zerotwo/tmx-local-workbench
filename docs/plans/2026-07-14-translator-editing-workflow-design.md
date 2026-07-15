# Translator Editing Workflow Design

## Goal

Improve the desktop editing loop for translators with fast row navigation, explicit save feedback, current-row find and replace, source-text copying, folder-based export, and complete per-row version history.

## Editing Interaction

- Keep previous, next, copy source, save, and save-and-next controls on one editor action row.
- Navigate in the current filtered sort order and cross page boundaries automatically.
- Support `Alt+ArrowUp`, `Alt+ArrowDown`, and `Ctrl/Cmd+Enter` without interfering with normal textarea cursor movement.
- Auto-save continues to persist idle edits. Explicit save actions show a success notification; auto-save updates the saved timestamp without repeatedly showing a notification.
- Copy source updates the target draft and participates in the normal save/version flow.

## Current-Row Find And Replace

- An expandable toolbar above the target textarea contains literal find and replacement inputs.
- Previous/next match, replace current, and replace all operate only on the selected row's target draft.
- Matching is case-sensitive and shows the current match and total match count.
- Replacement changes the draft first; saving creates the history version.

## Version History

- Database migration v2 adds a translation history table with an incrementing per-row version, before text, after text, and timestamp.
- Every real target-text database update inserts one history version in the same transaction. No-op saves do not create versions.
- The editor shows newest versions first and can restore any version. Restoring uses the normal update path, so the restore itself is another auditable version.
- Translation rows expose their latest update time for the editor save status.

## Export

- Export asks for a destination directory instead of a full filename.
- The main process creates a sanitized project-and-date filename and appends a numeric suffix when needed.
- Successful export shows the final path and offers an action to open its containing folder.

## Error Handling And Testing

- Navigation flushes the active edit before changing rows or pages; failed saves keep the current row selected.
- History writes and translation updates are atomic.
- IPC validates project IDs, row IDs, target text, and export paths.
- Repository, IPC bridge, workspace navigation, editor interaction, and export-dialog behavior receive focused regression tests.
