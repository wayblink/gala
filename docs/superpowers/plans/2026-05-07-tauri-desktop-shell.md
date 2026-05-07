# Tauri Desktop Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing React/Vite prototype into a desktop-app skeleton with Tauri, Rust, and one verified frontend-to-backend command.

**Architecture:** Keep React as the desktop UI layer and add Tauri as the native shell. Rust owns local desktop capabilities and will become the scanner/index/cache engine; this step only exposes a small environment command to validate the bridge.

**Tech Stack:** Tauri 2, Rust, React, Vite, TypeScript, SQLite planned for later engine work, Vitest, Testing Library, Playwright.

---

## Scope

In scope:

- Add Tauri dependencies and scripts.
- Add `src-tauri` Rust app skeleton.
- Add one Rust command returning desktop runtime/environment metadata.
- Add a small frontend bridge module and unit test.
- Render desktop runtime status in the existing context panel.
- Validate with unit tests, web build, e2e smoke tests, and Rust checks.

Out of scope:

- Real file scanning.
- SQLite schema implementation.
- Thumbnail generation.
- Native file picker.
- App signing, icons, release packaging.

## Files

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/components/ContextPanel.tsx`
- Modify: `src/App.tsx`
- Create: `src/desktop/environment.ts`
- Create: `src/desktop/environment.test.ts`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/main.rs`

## Tasks

- [x] Add Tauri npm dependencies and desktop scripts.
- [x] Write a failing frontend test for desktop environment fallback and command invocation.
- [x] Implement the minimal TypeScript bridge for Tauri command access.
- [x] Add the Rust/Tauri app skeleton and `get_app_environment` command.
- [x] Surface desktop runtime status in the existing context panel.
- [x] Run `npm test`, `npm run build`, `npm run e2e`, `cargo check`, and `npm run desktop:build`.
- [x] Commit the desktop skeleton.
