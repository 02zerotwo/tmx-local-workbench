# Windows GitHub Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish `v0.2.1` with a Windows x64 portable ZIP through GitHub Actions.

**Architecture:** A `v*` tag triggers the existing Windows workflow. The job verifies the app, packages Electron, uploads a temporary artifact, and then uses GitHub CLI to create a formal release with the ZIP attached.

**Tech Stack:** GitHub Actions, pnpm, Next.js, Electron Forge, GitHub CLI

---

### Task 1: Configure formal release publishing

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.github/workflows/build-windows.yml`

1. Set the application version to `0.2.1`.
2. Change workflow contents permission to `write`.
3. Add a tag-only `gh release create` step that attaches the generated Windows ZIP.
4. Inspect the workflow and run `git diff --check`.

### Task 2: Verify the release candidate

1. Run `pnpm test`.
2. Run `pnpm lint`.
3. Run `pnpm build`.
4. Run `pnpm desktop:build`.

### Task 3: Publish and monitor

1. Commit the complete release scope.
2. Push `feature/deepseek-ai-agent`.
3. Create and push annotated tag `v0.2.1`.
4. Watch the Windows workflow to completion.
5. Confirm the GitHub Release contains the portable ZIP.
