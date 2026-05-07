# Rust Source Indexing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real desktop data loop: choose a local photo folder, scan supported image files in Rust, persist source/photo records locally, and show scan results in the existing React photo surface.

**Architecture:** Keep React/Vite as the desktop UI and use Tauri commands for native capabilities. Rust owns source selection, filesystem scanning, and the local SQLite index; React only invokes commands and renders returned view models. This milestone intentionally stops at metadata rows and mock/placeholder thumbnails so the storage boundary is correct before thumbnail generation and EXIF parsing.

**Tech Stack:** Tauri 2, Rust, React, Vite, TypeScript, SQLite via `rusqlite`, Tauri dialog plugin, Vitest, Testing Library, Playwright, Rust unit tests.

---

## Scope

In scope:

- Add a native "Add Folder" flow using Tauri's dialog plugin.
- Add a Rust scanner that recursively finds supported image files.
- Create the first SQLite database and migrations for `sources` and `photos`.
- Persist scan results without modifying original files.
- Add Tauri commands for picking a folder, scanning it, and reading the current library summary.
- Render the selected source and indexed photo count in the prototype UI.
- Keep web mode usable with deterministic mock behavior.

Out of scope:

- Thumbnail generation.
- EXIF parsing.
- RAW decoding.
- AI tagging, embeddings, or vector search.
- File watching.
- App signing, final icon work, installer packaging.

## File Structure

- Modify: `package.json`
  - Keep existing scripts; no new frontend dependency is expected unless tests require it.
- Modify: `src/App.tsx`
  - Own the top-level desktop source/indexing state.
- Modify: `src/components/TopBar.tsx`
  - Add the source import button and scanning status affordance.
- Modify: `src/components/ContextPanel.tsx`
  - Show source/index summary next to the existing desktop runtime status.
- Create: `src/desktop/library.ts`
  - TypeScript bridge for library commands with web fallbacks.
- Create: `src/desktop/library.test.ts`
  - Unit tests for command invocation and fallback behavior.
- Create: `src/types/library.ts`
  - Shared frontend types for source and scan summaries.
- Modify: `src-tauri/Cargo.toml`
  - Add `rusqlite`, `uuid`, `chrono`, `walkdir`, `serde_json`, and Tauri dialog plugin dependencies.
- Modify: `src-tauri/tauri.conf.json`
  - Register required Tauri plugin permissions if needed by Tauri 2 config.
- Modify: `src-tauri/src/lib.rs`
  - Register new commands and plugins.
- Create: `src-tauri/src/library/mod.rs`
  - Rust module boundary for source, scan, storage, and command wiring.
- Create: `src-tauri/src/library/models.rs`
  - Serializable command return types and database models.
- Create: `src-tauri/src/library/storage.rs`
  - SQLite connection setup, migrations, inserts, and summary queries.
- Create: `src-tauri/src/library/scanner.rs`
  - Recursive image file discovery and file metadata extraction.
- Create: `src-tauri/src/library/commands.rs`
  - Tauri commands exposed to React.
- Create: `src-tauri/tests/library_storage.rs`
  - Rust integration tests for schema and persistence.
- Create: `src-tauri/tests/library_scanner.rs`
  - Rust integration tests for extension filtering and recursion.

## Data Contracts

Frontend command return types:

```ts
export type LibrarySource = {
  id: string
  name: string
  rootPath: string
  status: 'online' | 'offline' | 'missing' | 'error'
  photoCount: number
}

export type ScanSummary = {
  source: LibrarySource
  indexedCount: number
  skippedCount: number
}

export type LibrarySummary = {
  sources: LibrarySource[]
  totalPhotos: number
}
```

Rust command names:

- `pick_photo_folder() -> Option<String>`
- `scan_photo_source(root_path: String) -> ScanSummary`
- `get_library_summary() -> LibrarySummary`

Supported V0 extensions:

- `.jpg`
- `.jpeg`
- `.png`
- `.heic`
- `.webp`
- `.tif`
- `.tiff`

## Tasks

### Task 1: Frontend Library Bridge

**Files:**

- Create: `src/types/library.ts`
- Create: `src/desktop/library.ts`
- Create: `src/desktop/library.test.ts`

- [ ] **Step 1: Write failing tests for web fallback and Tauri invocation**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLibrarySummary, pickPhotoFolder, scanPhotoSource } from './library'

afterEach(() => {
  vi.restoreAllMocks()
  delete window.__TAURI__
})

describe('library desktop bridge', () => {
  it('returns an empty library summary in web mode', async () => {
    await expect(getLibrarySummary()).resolves.toEqual({
      sources: [],
      totalPhotos: 0,
    })
  })

  it('invokes the native folder picker when Tauri is available', async () => {
    const invoke = vi.fn().mockResolvedValue('/Users/me/Pictures')
    window.__TAURI__ = { core: { invoke } }

    await expect(pickPhotoFolder()).resolves.toBe('/Users/me/Pictures')
    expect(invoke).toHaveBeenCalledWith('pick_photo_folder')
  })

  it('passes the root path into the native scan command', async () => {
    const summary = {
      source: {
        id: 'source-1',
        name: 'Pictures',
        rootPath: '/Users/me/Pictures',
        status: 'online',
        photoCount: 2,
      },
      indexedCount: 2,
      skippedCount: 0,
    }
    const invoke = vi.fn().mockResolvedValue(summary)
    window.__TAURI__ = { core: { invoke } }

    await expect(scanPhotoSource('/Users/me/Pictures')).resolves.toEqual(summary)
    expect(invoke).toHaveBeenCalledWith('scan_photo_source', {
      rootPath: '/Users/me/Pictures',
    })
  })
})
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npm test -- src/desktop/library.test.ts`

Expected: FAIL because `src/desktop/library.ts` does not exist.

- [ ] **Step 3: Implement frontend bridge**

Create `src/types/library.ts` with the shared types from "Data Contracts".

Create `src/desktop/library.ts`:

```ts
import type { LibrarySummary, ScanSummary } from '../types/library'

function invokeOrNull() {
  return window.__TAURI__?.core?.invoke
}

export async function pickPhotoFolder(): Promise<string | null> {
  const invoke = invokeOrNull()
  if (!invoke) return null
  return invoke<string | null>('pick_photo_folder')
}

export async function scanPhotoSource(rootPath: string): Promise<ScanSummary | null> {
  const invoke = invokeOrNull()
  if (!invoke) return null
  return invoke<ScanSummary>('scan_photo_source', { rootPath })
}

export async function getLibrarySummary(): Promise<LibrarySummary> {
  const invoke = invokeOrNull()
  if (!invoke) return { sources: [], totalPhotos: 0 }
  return invoke<LibrarySummary>('get_library_summary')
}
```

- [ ] **Step 4: Run bridge test and verify it passes**

Run: `npm test -- src/desktop/library.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/library.ts src/desktop/library.ts src/desktop/library.test.ts
git commit -m "feat: add library desktop bridge"
```

### Task 2: Rust Scanner

**Files:**

- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/library/mod.rs`
- Create: `src-tauri/src/library/scanner.rs`
- Create: `src-tauri/tests/library_scanner.rs`

- [ ] **Step 1: Add failing scanner tests**

Test cases:

- Finds supported files recursively.
- Ignores unsupported files.
- Extension matching is case-insensitive.
- Returns deterministic path ordering.

Run: `cd src-tauri && cargo test library_scanner`

Expected: FAIL because scanner module does not exist.

- [ ] **Step 2: Add dependencies**

Add to `src-tauri/Cargo.toml`:

```toml
walkdir = "2"
tempfile = "3"
```

`tempfile` may be a dev-dependency if only used in tests.

- [ ] **Step 3: Implement scanner**

`src-tauri/src/library/scanner.rs` should expose:

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiscoveredPhoto {
    pub absolute_path: std::path::PathBuf,
    pub file_name: String,
    pub extension: String,
    pub file_size: u64,
    pub file_mtime: i64,
}

pub fn discover_photos(root_path: &std::path::Path) -> Result<Vec<DiscoveredPhoto>, String> {
    // Walk recursively, filter supported extensions, collect metadata, sort by path.
}
```

- [ ] **Step 4: Run scanner tests**

Run: `cd src-tauri && cargo test library_scanner`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/library src-tauri/tests/library_scanner.rs
git commit -m "feat: add rust photo scanner"
```

### Task 3: SQLite Storage

**Files:**

- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/library/models.rs`
- Create: `src-tauri/src/library/storage.rs`
- Create: `src-tauri/tests/library_storage.rs`

- [ ] **Step 1: Add failing storage tests**

Test cases:

- Initializes schema.
- Upserts one source.
- Inserts discovered photos for a source.
- Re-scanning the same source updates rows instead of duplicating them.
- Summary returns total photo count and source photo count.

Run: `cd src-tauri && cargo test library_storage`

Expected: FAIL because storage module does not exist.

- [ ] **Step 2: Add dependencies**

Add to `src-tauri/Cargo.toml`:

```toml
chrono = { version = "0.4", features = ["serde"] }
rusqlite = { version = "0.32", features = ["bundled"] }
serde_json = "1"
uuid = { version = "1", features = ["v4", "serde"] }
```

- [ ] **Step 3: Implement schema initialization**

Use the V0 subset:

```sql
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL,
  last_scan_started_at TEXT,
  last_scan_completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  relative_path TEXT NOT NULL,
  absolute_path_snapshot TEXT NOT NULL,
  file_name TEXT NOT NULL,
  extension TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_mtime INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_id, relative_path)
);
```

- [ ] **Step 4: Implement source/photo persistence**

Expose functions:

```rust
pub fn open_database(path: &std::path::Path) -> Result<rusqlite::Connection, String>;
pub fn initialize_schema(conn: &rusqlite::Connection) -> Result<(), String>;
pub fn upsert_source(conn: &rusqlite::Connection, root_path: &std::path::Path) -> Result<LibrarySource, String>;
pub fn replace_source_photos(conn: &mut rusqlite::Connection, source_id: &str, root_path: &std::path::Path, photos: &[DiscoveredPhoto]) -> Result<(), String>;
pub fn get_library_summary(conn: &rusqlite::Connection) -> Result<LibrarySummary, String>;
```

- [ ] **Step 5: Run storage tests**

Run: `cd src-tauri && cargo test library_storage`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/library src-tauri/tests/library_storage.rs
git commit -m "feat: persist local photo index"
```

### Task 4: Tauri Commands

**Files:**

- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/library/commands.rs`

- [ ] **Step 1: Add Tauri dialog plugin dependency**

Add:

```toml
tauri-plugin-dialog = "2"
```

- [ ] **Step 2: Implement command models and command functions**

Expose:

```rust
#[tauri::command]
pub async fn pick_photo_folder(app: tauri::AppHandle) -> Result<Option<String>, String>;

#[tauri::command]
pub fn scan_photo_source(app: tauri::AppHandle, root_path: String) -> Result<ScanSummary, String>;

#[tauri::command]
pub fn get_library_summary(app: tauri::AppHandle) -> Result<LibrarySummary, String>;
```

Use `app.path().app_data_dir()` for the database location:

```text
<app-data>/index.sqlite
```

- [ ] **Step 3: Register plugin and commands**

In `src-tauri/src/lib.rs`:

```rust
mod library;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_app_environment,
            library::commands::pick_photo_folder,
            library::commands::scan_photo_source,
            library::commands::get_library_summary,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Gala desktop app");
}
```

- [ ] **Step 4: Verify Rust command registration**

Run: `cd src-tauri && cargo check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/src/library/commands.rs
git commit -m "feat: expose source indexing commands"
```

### Task 5: UI Flow

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/components/TopBar.tsx`
- Modify: `src/components/ContextPanel.tsx`
- Modify: `src/App.test.tsx`
- Modify: `tests/shell.spec.ts`

- [ ] **Step 1: Add failing UI tests**

Expected behaviors:

- App renders an "Add Folder" button.
- In web mode, clicking the button does not crash and keeps the mock/empty library state.
- Existing photo surface remains the dominant visual area.
- Context panel shows total indexed photos.

Run: `npm test -- src/App.test.tsx`

Expected: FAIL until UI is wired.

- [ ] **Step 2: Wire app state**

In `src/App.tsx`:

- Load `getLibrarySummary()` on mount.
- Add `handleAddFolder()`:
  - call `pickPhotoFolder()`
  - if path exists, set scanning state
  - call `scanPhotoSource(path)`
  - refresh summary or merge returned source
  - clear scanning state
- Pass `onAddFolder`, `isScanning`, and `librarySummary` into child components.

- [ ] **Step 3: Add toolbar control**

In `src/components/TopBar.tsx`:

- Add an icon button with `FolderPlus` from `lucide-react`.
- Use text label only if existing top bar pattern requires it.
- Disable while scanning.
- Provide an accessible label.

- [ ] **Step 4: Add context summary**

In `src/components/ContextPanel.tsx`:

- Show total indexed photos.
- Show first source name/path if one exists.
- Preserve the existing desktop runtime block.

- [ ] **Step 5: Run frontend tests**

Run: `npm test -- src/App.test.tsx src/desktop/library.test.ts`

Expected: PASS.

- [ ] **Step 6: Run visual/e2e checks**

Run: `npm run e2e`

Expected: PASS or existing viewport-conditional skips only.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/TopBar.tsx src/components/ContextPanel.tsx src/App.test.tsx tests/shell.spec.ts
git commit -m "feat: add source indexing UI flow"
```

### Task 6: End-to-End Verification

**Files:**

- Modify only if verification exposes a concrete bug.

- [ ] **Step 1: Run complete verification**

```bash
npm test
npm run build
npm run e2e
(cd src-tauri && cargo test)
(cd src-tauri && cargo check)
npm run desktop:build
```

Expected:

- Vitest passes.
- Vite production build passes.
- Playwright passes with only intentional viewport skips.
- Rust tests pass.
- Tauri desktop build succeeds.

- [ ] **Step 2: Manual desktop smoke test**

Run: `npm run desktop:dev`

Smoke flow:

- App opens as a desktop window.
- Click "Add Folder".
- Select a small folder containing a few `.jpg` or `.png` files.
- UI reports the source and indexed count.
- Restart the app.
- Summary still shows the persisted source and photo count.

- [ ] **Step 3: Commit any verification fixes**

Only if fixes were needed:

```bash
git add <changed-files>
git commit -m "fix: stabilize source indexing flow"
```

## Recommended Execution Order

1. Frontend bridge first, because it defines the command contract and keeps web fallback stable.
2. Rust scanner second, because it is pure logic and easy to test.
3. SQLite storage third, because persistence depends on scanner output shape.
4. Tauri commands fourth, because they compose scanner and storage.
5. UI flow fifth, because the native contract is then real.
6. Full verification last.

## Completion Criteria

- A user can open the desktop app, choose a folder, and see an indexed source count.
- Original files are never modified.
- Indexed source/photo data persists locally across app restarts.
- Web preview still works without Tauri.
- All frontend, e2e, Rust, and Tauri build checks pass.
