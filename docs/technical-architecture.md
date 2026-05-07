# Technical Architecture: Local Photo Index and View Engine

## Summary

The application uses a local SQLite index plus file-based caches to build non-destructive views over photo libraries. Original files remain in their source locations. The app stores references, metadata, thumbnails, strategy results, and explanations.

Core architecture:

```text
User Folder / Drive
        |
        v
+------------------+
| Source Scanner   |
+------------------+
        |
        v
+------------------+        +-------------------+
| Metadata Parser  | -----> | Thumbnail Cache   |
+------------------+        +-------------------+
        |
        v
+------------------+
| SQLite Index DB  |
+------------------+
        |
        v
+------------------+
| View Strategies  |
+------------------+
        |
        v
+------------------+
| View Instances   |
+------------------+
        |
        v
+------------------+
| Photo Surface UI |
+------------------+
```

## Architecture Decisions

### Use SQLite as the Local Index

SQLite is the V0 indexing foundation.

Reasons:

- Mature for local desktop apps.
- Supports transactions, indexes, migrations, WAL, and backups.
- Handles tens of thousands of photo rows without introducing a server.
- Can support future full-text search through FTS.
- Keeps deployment simple across desktop platforms.

### Use File Cache for Large Derived Assets

The database stores structured metadata and paths to generated assets. Large derived files live in app-managed cache directories.

Examples:

- Thumbnails.
- Preview images.
- Embeddings.
- Model output blobs.

Cache files are disposable. If cache files are missing, they can be regenerated from the index and original photo files when available.

### Keep Vector Search Out of the V0 Critical Path

V0 may reserve schema for embeddings, but vector search should not be a required dependency.

Reasons:

- It adds packaging and migration complexity.
- Timeline, places, camera, manual views, and simple memories can work without it.
- Similarity can begin with simpler signals and later upgrade to embeddings.

### Distinguish Offline Sources from Missing Photos

This distinction is core to user trust.

```text
offline source:
  drive not mounted
  -> source.status = offline
  -> photos remain visible, originals unavailable

missing photo:
  source online, file path gone
  -> photo.status = missing
  -> show missing state for that file
```

An offline external drive should not make every photo look deleted.

## Local Data Directory

Suggested layout:

```text
app-data/
├── index.sqlite
├── index.sqlite-wal
├── thumbnails/
│   ├── small/
│   ├── medium/
│   └── large/
├── previews/
├── models/
│   ├── embeddings/
│   └── tags/
├── logs/
└── backups/
```

## Core Database Schema

### sources

Stores user-added photo roots.

```sql
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  source_type TEXT NOT NULL,
  volume_id TEXT,
  status TEXT NOT NULL,
  last_scan_started_at TEXT,
  last_scan_completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Expected `source_type` values:

- `local_folder`
- `external_drive`
- `network_volume`

Expected `status` values:

- `online`
- `offline`
- `missing`
- `error`

### photos

Stores one row per indexed photo reference.

```sql
CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  relative_path TEXT NOT NULL,
  absolute_path_snapshot TEXT NOT NULL,
  file_name TEXT NOT NULL,
  extension TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER NOT NULL,
  file_mtime INTEGER NOT NULL,
  content_hash TEXT,
  fingerprint TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  orientation INTEGER,
  captured_at TEXT,
  imported_at TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_id, relative_path)
);
```

Expected `status` values:

- `indexed`
- `missing`
- `changed`
- `unsupported`
- `corrupted`

### photo_metadata

Stores EXIF and technical metadata.

```sql
CREATE TABLE photo_metadata (
  photo_id TEXT PRIMARY KEY REFERENCES photos(id),
  camera_make TEXT,
  camera_model TEXT,
  lens_model TEXT,
  focal_length REAL,
  aperture REAL,
  shutter_speed TEXT,
  iso INTEGER,
  gps_lat REAL,
  gps_lng REAL,
  gps_altitude REAL,
  raw_exif_json TEXT
);
```

### photo_assets

Stores paths and derived visual metadata for generated assets.

```sql
CREATE TABLE photo_assets (
  photo_id TEXT PRIMARY KEY REFERENCES photos(id),
  thumbnail_small_path TEXT,
  thumbnail_medium_path TEXT,
  thumbnail_large_path TEXT,
  preview_path TEXT,
  dominant_color TEXT,
  color_palette_json TEXT,
  blurhash TEXT,
  asset_status TEXT NOT NULL,
  generated_at TEXT
);
```

Expected `asset_status` values:

- `pending`
- `ready`
- `failed`
- `stale`

### tags and photo_tags

```sql
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tag_type TEXT NOT NULL,
  confidence REAL,
  created_at TEXT NOT NULL,
  UNIQUE(name, tag_type)
);

CREATE TABLE photo_tags (
  photo_id TEXT NOT NULL REFERENCES photos(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  source TEXT NOT NULL,
  confidence REAL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(photo_id, tag_id, source)
);
```

Expected `tag_type` values:

- `manual`
- `ai`
- `system`

### people and photo_people

V0 can support manual people labels while reserving space for future face detection.

```sql
CREATE TABLE people (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  person_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE photo_people (
  photo_id TEXT NOT NULL REFERENCES photos(id),
  person_id TEXT NOT NULL REFERENCES people(id),
  confidence REAL,
  face_box_json TEXT,
  source TEXT NOT NULL,
  PRIMARY KEY(photo_id, person_id, source)
);
```

### places and photo_places

```sql
CREATE TABLE places (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat REAL,
  lng REAL,
  radius_meters REAL,
  place_type TEXT NOT NULL
);

CREATE TABLE photo_places (
  photo_id TEXT NOT NULL REFERENCES photos(id),
  place_id TEXT NOT NULL REFERENCES places(id),
  confidence REAL,
  source TEXT NOT NULL,
  PRIMARY KEY(photo_id, place_id, source)
);
```

### view_strategies

Stores available strategy definitions and versions.

```sql
CREATE TABLE view_strategies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  strategy_type TEXT NOT NULL,
  version TEXT NOT NULL,
  config_json TEXT,
  enabled INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
```

Expected `strategy_type` values:

- `builtin`
- `ai`
- `user_rule`

### views

Stores user-visible views.

```sql
CREATE TABLE views (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  view_type TEXT NOT NULL,
  strategy_id TEXT REFERENCES view_strategies(id),
  user_editable INTEGER NOT NULL,
  saved INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Expected `view_type` values:

- `timeline`
- `place`
- `person`
- `memory`
- `similar`
- `custom`

### view_instances and view_items

A view may be regenerated over time. A view instance captures one generated result.

```sql
CREATE TABLE view_instances (
  id TEXT PRIMARY KEY,
  view_id TEXT NOT NULL REFERENCES views(id),
  strategy_id TEXT NOT NULL REFERENCES view_strategies(id),
  title TEXT NOT NULL,
  explanation TEXT,
  confidence REAL,
  generated_at TEXT NOT NULL,
  params_json TEXT
);

CREATE TABLE view_items (
  view_instance_id TEXT NOT NULL REFERENCES view_instances(id),
  photo_id TEXT NOT NULL REFERENCES photos(id),
  group_key TEXT,
  sort_order INTEGER NOT NULL,
  weight REAL,
  reason_json TEXT,
  PRIMARY KEY(view_instance_id, photo_id)
);
```

### scan_jobs and scan_events

```sql
CREATE TABLE scan_jobs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  status TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  files_seen INTEGER NOT NULL DEFAULT 0,
  files_indexed INTEGER NOT NULL DEFAULT 0,
  files_skipped INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE TABLE scan_events (
  id TEXT PRIMARY KEY,
  scan_job_id TEXT NOT NULL REFERENCES scan_jobs(id),
  photo_id TEXT REFERENCES photos(id),
  event_type TEXT NOT NULL,
  message TEXT,
  created_at TEXT NOT NULL
);
```

Expected `scan_jobs.status` values:

- `queued`
- `running`
- `paused`
- `completed`
- `failed`
- `cancelled`

Expected `scan_events.event_type` values:

- `added`
- `changed`
- `missing`
- `unsupported`
- `error`

### photo_embeddings

Reserved for later similarity search.

```sql
CREATE TABLE photo_embeddings (
  photo_id TEXT NOT NULL REFERENCES photos(id),
  model_name TEXT NOT NULL,
  embedding_path TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  generated_at TEXT NOT NULL,
  PRIMARY KEY(photo_id, model_name)
);
```

## Recommended Indexes

```sql
CREATE INDEX idx_photos_source_relative_path ON photos(source_id, relative_path);
CREATE INDEX idx_photos_captured_at ON photos(captured_at);
CREATE INDEX idx_photos_status ON photos(status);
CREATE INDEX idx_photos_fingerprint ON photos(file_size, file_mtime, fingerprint);
CREATE INDEX idx_photo_metadata_camera ON photo_metadata(camera_model);
CREATE INDEX idx_photo_metadata_gps ON photo_metadata(gps_lat, gps_lng);
CREATE INDEX idx_view_items_instance_sort ON view_items(view_instance_id, sort_order);
CREATE INDEX idx_view_items_photo ON view_items(photo_id);
CREATE INDEX idx_photo_tags_tag_photo ON photo_tags(tag_id, photo_id);
CREATE INDEX idx_photo_people_person_photo ON photo_people(person_id, photo_id);
CREATE INDEX idx_photo_places_place_photo ON photo_places(place_id, photo_id);
CREATE INDEX idx_scan_jobs_source_status ON scan_jobs(source_id, status);
```

## Scan Pipeline

```text
ScanJob
  |
  ├── enumerate files
  |     ├── supported image
  |     └── unsupported -> scan_events
  |
  ├── fingerprint file
  |     ├── unchanged -> skip
  |     ├── new -> parse
  |     └── changed -> re-index
  |
  ├── parse metadata
  |     ├── EXIF ok
  |     ├── EXIF missing
  |     └── corrupted -> status=corrupted
  |
  ├── generate thumbnails
  |
  ├── write SQLite transaction
  |
  └── trigger view refresh
```

### Incremental Scan Rules

- If `relative_path + file_size + file_mtime` are unchanged, skip parsing.
- If the path is unchanged but size or mtime changed, mark the photo `changed` and re-index.
- If the source is online and a file disappears, mark the photo `missing`.
- If the source root is offline, mark the source `offline`; do not mark photos missing.
- If a file reappears, restore it to `indexed` after a successful scan.

### Transaction Strategy

Use batched transactions.

Recommended batch size: 100 to 500 files.

```text
BEGIN
  upsert photos
  upsert photo_metadata
  upsert photo_assets
  insert scan_events
COMMIT
```

Thumbnail generation should be retryable. The database should store asset status, and missing cache files should be regenerated when needed.

## State Machines

### Photo Status

```text
          +----------+
          | indexed  |
          +----+-----+
               |
     file changed / missing
               |
     +---------+---------+
     |                   |
     v                   v
+---------+         +----------+
| changed |         | missing  |
+----+----+         +----+-----+
     |                   |
 re-index           file returns
     |                   |
     v                   v
+----------+       +----------+
| indexed  |       | indexed  |
+----------+       +----------+

unsupported and corrupted remain until a rescan or decoder change.
```

### Source Status

```text
online -> offline -> online
online -> error   -> online
online -> missing -> online
```

Definitions:

- `offline`: a known volume is not mounted.
- `missing`: the configured root path is unavailable while the volume appears present.
- `error`: permission or read failure.

## View Strategy Interface

```ts
type ViewStrategyInput = {
  viewId?: string
  sourceIds?: string[]
  filters?: PhotoFilter
  selectedPhotoIds?: string[]
  userPrompt?: string
}

type ViewStrategyOutput = {
  title: string
  explanation: string
  confidence: number
  groups: ViewGroup[]
}

type ViewGroup = {
  key: string
  title: string
  items: ViewItem[]
}

type ViewItem = {
  photoId: string
  sortOrder: number
  weight: number
  reason: string[]
}
```

Strategies read from SQLite and caches. They write `view_instances` and `view_items`. They must never write original photo files.

## V0 Strategies

### TimelineStrategy

Groups photos by captured date.

Inputs:

- Source filter.
- Optional date range.
- Optional status filter.

Outputs:

- Groups by year/month/day.
- Sort order within each group.

### PlaceStrategy

Groups photos by GPS and inferred places.

Inputs:

- GPS metadata.
- Optional radius.
- Optional place filter.

Outputs:

- Place groups.
- Unknown-location bucket.

### CameraStrategy

Groups photos by camera, lens, or focal length.

Inputs:

- EXIF camera metadata.

Outputs:

- Camera groups.
- Lens groups.

### SimilarityStrategy

V0 uses simple similarity signals before embeddings.

Inputs:

- Captured time.
- Dominant color.
- Aspect ratio.
- Camera/lens.

Outputs:

- Similar groups.
- Reason strings for each match.

### MemoryStrategy

Generates a curated memory-style view.

Inputs:

- Time range.
- Place clusters.
- Favorites.
- Tags.
- Similarity signals.

Outputs:

- Title.
- Explanation.
- Photo groups.
- Confidence.

### ManualStrategy

Stores a user-created selection or saved filter.

Inputs:

- Selected photo IDs.
- Filter query.

Outputs:

- Stable saved view.

## Query Patterns

### Timeline

```sql
SELECT *
FROM photos
WHERE status IN ('indexed', 'missing')
ORDER BY captured_at DESC
LIMIT ? OFFSET ?;
```

### View Instance

```sql
SELECT p.*, vi.group_key, vi.weight, vi.reason_json
FROM view_items vi
JOIN photos p ON p.id = vi.photo_id
WHERE vi.view_instance_id = ?
ORDER BY vi.group_key, vi.sort_order;
```

### Place

```sql
SELECT p.*
FROM photo_places pp
JOIN photos p ON p.id = pp.photo_id
WHERE pp.place_id = ?
ORDER BY p.captured_at DESC;
```

### Camera

```sql
SELECT p.*
FROM photos p
JOIN photo_metadata m ON m.photo_id = p.id
WHERE m.camera_model = ?
ORDER BY p.captured_at DESC;
```

## Privacy and AI Boundaries

V0 defaults:

- Originals stay local.
- Index stays local.
- AI features are optional.
- Cloud AI, if introduced later, must require explicit user opt-in.
- Cloud AI should use derived thumbnails or metadata, not original files, unless explicitly allowed.
- Every model output stores model name, version, confidence, and generation time.

## Performance Targets

Initial targets:

- 10k photos: timeline first screen under 300 ms.
- 50k photos: timeline first screen under 800 ms.
- Background scans must not block the UI.
- Lists must use pagination or virtual scrolling.
- SQLite should use WAL mode.
- View results should be materialized to `view_items` instead of recomputing on every open.

## Failure Modes

| Failure | Expected Behavior |
| --- | --- |
| External drive disconnected | Mark source offline; keep thumbnails visible. |
| Source path removed | Mark source missing or error; do not delete indexed photos. |
| Photo deleted while source online | Mark photo missing. |
| Corrupted image | Mark photo corrupted; continue scan. |
| Unsupported file | Record scan event; skip indexing as photo. |
| Thumbnail cache deleted | Regenerate when source is available. |
| Scan cancelled | Preserve indexed batches; mark job cancelled. |
| App crashes during scan | Resume from committed batches. |
| AI strategy returns low-confidence result | Show explanation and confidence; do not autosave unless user approves. |

## Test Plan

No test framework exists yet. When implementation starts, add tests with the data layer.

Required test categories:

- SQLite migration tests.
- Scanner unit tests.
- Metadata parser fixture tests.
- Thumbnail cache retry tests.
- Source offline vs missing tests.
- View strategy deterministic output tests.
- Integration test: source -> scan -> database -> view query.
- UI/E2E test: add source -> scan -> timeline -> focus viewer -> EXIF panel.
- Performance tests for 10k and 50k photo rows.

Coverage map:

```text
CODE PATHS                                      USER FLOWS
[+] Source Scanner                              [+] Add photo source
  ├── [REQUIRED] supported image                  ├── [REQUIRED] folder selected -> scan starts
  ├── [REQUIRED] unsupported file                 ├── [REQUIRED] permission denied
  ├── [REQUIRED] corrupted image                  ├── [REQUIRED] external drive offline
  ├── [REQUIRED] unchanged file                   └── [REQUIRED] cancel scan
  ├── [REQUIRED] changed file
  └── [REQUIRED] missing file

[+] Metadata Parser                             [+] Browse timeline
  ├── [REQUIRED] EXIF date exists                 ├── [REQUIRED] photos grouped by month/day
  ├── [REQUIRED] EXIF missing                     ├── [REQUIRED] missing date fallback
  ├── [REQUIRED] GPS valid                        └── [REQUIRED] large library pagination
  └── [REQUIRED] GPS invalid

[+] Thumbnail Cache                             [+] Focus viewer
  ├── [REQUIRED] generate small/medium/large       ├── [REQUIRED] open photo
  ├── [REQUIRED] cache hit                         ├── [REQUIRED] next/previous
  ├── [REQUIRED] cache missing -> regenerate       └── [REQUIRED] original file unavailable
  └── [REQUIRED] write failure

[+] View Strategy                               [+] Generated memory view
  ├── [REQUIRED] timeline strategy                 ├── [REQUIRED] explanation visible
  ├── [REQUIRED] place strategy                    ├── [REQUIRED] save view
  ├── [REQUIRED] memory strategy                   └── [REQUIRED] refresh view
  └── [REQUIRED] manual strategy
```

## Parallel Implementation Lanes

```text
Lane A: SQLite schema + migrations -> repository queries
Lane B: metadata parser + thumbnail cache fixtures
Lane C: strategy interface + timeline strategy
Lane D: desktop UI shell + mock photo surface
```

Recommended order:

1. Build Lane A first.
2. Build Lanes B and C after the schema stabilizes.
3. Start Lane D with mock data, then wire it to A and C.

## Deferred Work

- RAW editing.
- Cloud sync.
- Automatic face recognition.
- Full vector search.
- Multi-user collaboration.
- Destructive file operations.
- Full map-first browsing.
