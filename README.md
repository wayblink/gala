# Gala

Gala is a desktop-first application for browsing, understanding, and organizing local photo libraries while keeping users in control of their original files.

Current release: `0.1.0-alpha.1` (internal Alpha). See [Alpha Readiness](docs/alpha-readiness.md) for verified quality gates, platform limits, and the remaining Beta acceptance work.

The product is not a Lightroom clone, a cloud album, or a file manager. It builds a view layer above local photos: timelines, places, people, memories, similar light, and custom views can all point at the same original files without moving, renaming, or deleting them.

## Product Thesis

Users should remember one thing after first seeing the product:

> My photos stayed where they were, but the app gave me new ways to see them.

The core design is a non-destructive photo view engine:

```text
Photo Source
  -> Photo Index
    -> View Strategy
      -> View Instance
        -> Photo Surface
```

- **Photo Source**: A local folder, external drive, network volume, or other source of original files.
- **Photo Index**: A local database of paths, metadata, thumbnails, tags, places, people, and generated signals.
- **View Strategy**: A rule or model-driven strategy that turns indexed photos into a view.
- **View Instance**: A concrete generated view, such as "Kyoto, October 2024" or "Summer evenings".
- **Photo Surface**: The desktop UI where users browse, inspect, compare, and save views.

## Implemented Alpha Scope

The current Alpha includes:

In scope:

- Add local folders as photo sources.
- Scan files without moving or modifying originals.
- Build a SQLite-backed local photo index.
- Generate thumbnails and previews in an app-owned cache.
- Browse photos by timeline, contact sheet, focus viewer, search, filters, albums, tags, and people.
- Run on-device People, Similar Review, content recognition, and photo quality workflows on macOS.
- Preview and execute copy/move reorganization plans after explicit confirmation.
- Track long-running analysis and reorganize operations as background tasks.

Not in scope:

- RAW editing.
- Cloud sync.
- Team collaboration.
- Silent or automatic destructive actions.
- Cloud sync and cross-device view sharing.
- A cross-platform intelligent-analysis provider; non-macOS AI capabilities currently degrade to Noop.

## Documentation

- [Product Design](docs/product-design.md) defines the product direction, user model, V0 information architecture, and view concepts.
- [Technical Architecture](docs/technical-architecture.md) defines the local indexing architecture, SQLite schema, scan pipeline, cache layout, and test plan.

## Core Guarantees

- Originals remain in their physical location.
- Missing files and offline sources are distinct states.
- Generated views are references, not copies.
- AI may suggest views, labels, and explanations, but must not silently mutate the library.
- Cache files are disposable; the database is the source of truth for indexed state.
