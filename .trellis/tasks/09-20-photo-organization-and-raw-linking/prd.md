# 照片组织与 RAW 关联

## Goal

扩展现有 Reorganize 能力，支持递归多目录、可配置规则、dry run 预览执行，以及 RAW/JPEG/HEIF 逻辑关联展示。

## Confirmed repository facts

- The repository already has `src/features/reorganize/ReorganizeView.tsx` and `src/desktop/reorganize.ts`, with scan-plan then execute-plan flow, copy/move modes, collision strategies, custom path tokens, and a before/after tree preview.
- Rust exposes `reorganize_scan_plan_cmd` and `reorganize_execute_plan_cmd`. The current plan is built from indexed `photos` rows and currently accepts one target root; it is not yet a complete multi-input organization model.
- `photos.logical_id` and `TimelinePhoto.variants` already provide a base for grouping RAW/JPEG/HEIF physical variants under one logical photo. The UI already supports merged/separate display and format-specific selection.
- EXIF fields `captured_at`, `camera_make`, `camera_model`, and `lens_model` are already stored or exposed, so rule evaluation can reuse indexed metadata rather than re-parsing in the UI.
- `background_tasks` persists long-running operation state and is already used by the Reorganize view.
- The current data model has no durable first-class organization plan / entry / execution history table; the existing plan is an in-memory DTO consumed by the execute command.

## Requirements

- Recursively scan one or more selected local source folders and produce a deterministic organization plan without changing files.
- Let the user configure date, extension/format, camera model, and lens model path segments, including explicit fallbacks for missing metadata.
- Show planned source-to-target paths, counts, collisions, skipped items, and RAW/JPEG/HEIF grouping before execution.
- Require an explicit confirmation step before physical move; execution must consume the reviewed plan and report per-entry success/failure.
- Preserve source/photo facts and refresh or reconcile indexed paths after successful physical operations.
- Detect likely RAW+JPEG/HEIF pairs using stable, explainable matching inputs and expose grouped/separate display state in the product.

## Brainstorm artifact

The current data/result topology is documented in [`artifacts/gala-data-topology.html`](../../../artifacts/gala-data-topology.html). It distinguishes source facts, photo facts, logical variants, analysis projections, UI DTOs, and organization control records.

## Acceptance Criteria

- [ ] A dry run over multiple recursive roots produces a stable plan without creating directories or moving/copying/exporting files.
- [ ] The plan UI shows rule configuration plus left/right before-after directory trees, source-to-target examples, collisions, skipped entries, and RAW/JPEG/HEIF grouping.
- [ ] Execute is disabled until the plan is reviewed and explicitly confirmed; execution never re-evaluates a changed UI rule silently.
- [ ] Dry run and execute both appear in durable Background Tasks with queued/running/succeeded/failed/paused status, progress counters, logs, and resumable checkpoints.
- [ ] Successful Local Folder move operations can be reconciled into the library index without duplicate photo facts or broken logical variant links.
- [ ] A partially completed operation records enough source/target state to resume safely and create compensating rollback operations.
- [ ] Merged display shows one logical photo with variant labels; separate display shows physical variants and keeps RAW/JPEG/HEIF distinguishable.
- [ ] Existing scan, library browsing, and current Reorganize behavior remain covered by tests.

## Confirmed product decisions

- An organization rule is planned per logical photo group by default: matched RAW/JPEG/HEIF variants go to the same destination directory while preserving distinct filenames. Per-physical-file planning remains a later advanced option.
- Moving or exporting a file never changes its stable `photo_id`. Current and historical physical locations are recorded separately in `photo_locations`; views and analysis results continue to reference stable photo/group IDs.
- The organization surface shows a two-column before/after directory tree for the reviewed plan. Dry run generates this preview first; execute applies the confirmed plan.
- Dry run is read-only: it only reads indexed facts and provider/filesystem state. Both dry run and real execution run as durable background tasks with status, progress, per-entry logs, checkpoints, resume support, and rollback metadata.
- The first real execution action is move for Local Folder sources only; Apple Photos remains outside organization execution until a separate export workflow is designed.
- If execution encounters an error or external state mismatch, it defaults to `paused`; the user can explicitly trigger `continue` after revalidation or `rollback` through compensating operations.
