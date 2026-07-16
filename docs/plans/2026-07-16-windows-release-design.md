# Windows GitHub Release Design

## Goal

Publish version `v0.2.1` as a formal GitHub Release containing the Windows x64 portable ZIP built by GitHub Actions.

## Design

- Keep `workflow_dispatch` for build verification without creating a release.
- Treat a pushed `v*` tag as the only formal release trigger.
- Build and test on `windows-latest` with the repository's pinned pnpm version.
- Upload the portable ZIP as both a 30-day Actions artifact and a permanent GitHub Release asset.
- Grant `contents: write` only to the workflow so it can create the tag's release.
- Use `gh release create` with `--generate-notes` to avoid an additional marketplace publishing action.

## Failure Behavior

The release step runs only after installation, tests, linting, packaging, and artifact upload succeed. A failed build therefore leaves the tag visible but does not create a partial GitHub Release.

## Verification

- Validate the workflow syntax through inspection and GitHub Actions execution.
- Run the full local test suite, lint, Next.js production build, and Electron TypeScript build before pushing.
- Confirm the remote workflow run and Release asset after pushing `v0.2.1`.
