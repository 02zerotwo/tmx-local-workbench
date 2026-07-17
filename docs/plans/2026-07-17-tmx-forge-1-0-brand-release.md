# TMX Forge 1.0 Brand Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebrand the desktop application as TMX Forge 1.0.0 and publish verified Windows and macOS artifacts in GitHub Release v1.0.0.

**Architecture:** Generate one transparent 1024px master icon and derive platform-native ICO/ICNS assets. Centralize brand metadata in package and Forge configuration, verify application behavior, build both platforms, then publish the tagged commit and checksummed artifacts.

**Tech Stack:** Electron Forge, Next.js, TypeScript, Vitest, macOS iconutil/sips, Git, GitHub CLI

---

### Task 1: Create production icon assets

**Files:**
- Create: `build/icon.png`
- Create: `build/icon.ico`
- Create: `build/icon.icns`

Remove the generated chroma-key background, validate alpha and dimensions, and derive Windows/macOS icon formats.

### Task 2: Apply the TMX Forge 1.0 identity

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `forge.config.cjs`
- Modify: `src/app/layout.tsx`
- Modify: `build/README.md`
- Modify: `docs/ui-design-spec.md`

Replace current product/package/executable names, set version `1.0.0`, and configure the platform icons.

### Task 3: Verify source

Run `pnpm test`, `pnpm lint`, `pnpm build`, and `pnpm desktop:build`.

### Task 4: Build release artifacts

Build and validate:

- `TMX-Forge-win32-x64-1.0.0.zip`
- `TMX-Forge-darwin-arm64-1.0.0.zip`

Check ZIP integrity, executable/native module formats, icon presence, embedded brand strings, sizes, and SHA-256.

### Task 5: Publish GitHub Release

Commit the changes, push the current branch, tag and push `v1.0.0`, create `TMX Forge v1.0.0`, upload both ZIPs, and verify the public Release URL and assets.
