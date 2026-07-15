# Workspace UI Refresh Design

## Goal

Unify the desktop workbench around shadcn UI, keep the translation table and editor efficient, and give AI audit tasks an independent filter scope.

## Layout

- Use a horizontal shadcn resizable panel group for the translation table and the right workspace.
- Start both panels at 50 percent width.
- Keep practical minimum sizes so neither side can collapse into an unusable state.
- Render editing and AI content inside the same right panel so switching modes never changes its width.
- Use a visible but restrained resize handle with keyboard support.

## Controls

- Replace the target-language native select with shadcn Select.
- Replace the Edit/AI pair with a shadcn ButtonGroup segmented control.
- Use ghost buttons for ordinary toolbar and inline actions.
- Keep delete actions visually destructive and keep destructive confirmations prominent.
- Preserve icons, tooltips, disabled states, loading feedback, and keyboard behavior.

## AI Audit Filters

- AI audit filters are independent from the main translation table filters.
- The AI panel contains its own committed search query, target language, translation status, and duplicate-only condition.
- Search text applies only on Enter or an explicit search action.
- Structured filters refresh the count immediately.
- The panel queries the repository for the matching total and displays the exact expected audit count.
- Starting an audit snapshots the AI filters into the job. Later changes to the main table do not affect the running job.
- Filters are locked while an audit is running or paused.

## Dialogs

- Use shadcn Sheet for translation history.
- Use Dialog for rename and other editable forms.
- Use AlertDialog for delete, AI audit start/apply, and API-key removal confirmations.
- Native operating-system file and folder pickers remain native because they are outside the web UI layer.

## Visual Direction

- Compact, neutral desktop-tool styling with white working surfaces, slate dividers, blue focus and selection states, amber modified states, and red destructive states.
- Avoid decorative cards and heavy shadows. Use hierarchy through spacing, typography, separators, and restrained surface changes.
- Keep table density and virtual scrolling behavior unchanged.

## Verification

- Test the 50/50 default split, stable right-panel container, and mode toggle semantics.
- Test that AI search does not query per keystroke and does query on Enter/click.
- Test that AI filters do not alter the main table filters and that the displayed count is passed into the audit snapshot.
- Test shadcn Select, Sheet, Dialog, and AlertDialog presence and key interactions.
- Run focused tests, the full test suite, lint, Next.js production build, and Electron TypeScript build.
