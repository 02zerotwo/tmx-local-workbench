# Shadcn Table Migration Design

## Goal

Replace the remaining custom and native business tables with shadcn/ui table primitives without changing filtering, pagination, selection, editing, or project-management behavior.

## Scope

- Migrate the translation workspace table from a CSS grid of buttons to `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, and `TableCell`.
- Preserve TanStack Virtual for translation pages larger than 50 rows.
- Migrate the project library's native table to the same shadcn primitives.
- Replace hand-styled table status labels with the existing shadcn `Badge` component.
- Extend the shared `Table` primitive only as needed to let virtualized tables use an external vertical scroll container.

## Interaction

- Translation rows remain clickable and keyboard-selectable with Enter or Space.
- The selected row remains visually distinct and exposes `aria-selected`.
- Existing fixed column widths, truncation, tooltips, loading states, and empty states remain unchanged.
- Project sorting, rename, open, delete, backup, restore, and import controls keep their current handlers.

## Performance

- TanStack Virtual remains the source of visible translation row positions.
- Virtual rows use absolute positioning inside a height-reserved `TableBody`.
- Row calculations and database pagination remain unchanged.

## Testing

- Add focused translation table tests for semantic table rendering, row selection, keyboard selection, selected state, empty rows, and virtualized pages.
- Update project library tests where semantic roles change.
- Run the full component suite, lint, Next.js build, and Electron TypeScript build.
