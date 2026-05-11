# Data and Control Design

> 数据层与控制层的详细设计：schema、状态机、扫描流程、策略接口、查询模式、运行约束。
> 上层架构见 [technical-architecture.md](technical-architecture.md)；算法层与能力层见 [core-image-analysis-platform.md](core-image-analysis-platform.md)。

## 适用范围

这份文档主要回答：

- 数据层保存什么。
- 控制层如何驱动导入、扫描、索引和视图生成。
- 系统如何组织状态、策略和查询。
- V0 的性能、失败处理和测试要求是什么。

算法层本身的定位与边界，请参见 [core-image-analysis-platform.md](core-image-analysis-platform.md)。

---

## 数据层职责

数据层负责保存照片事实与产品知识。

它至少需要承载：

- 来源与照片引用关系。
- 文件状态与基础技术信息。
- EXIF 与派生元数据。
- 缩略图和预览等缓存引用。
- 标签、人物、地点、视图、任务与策略结果。
- 为相似能力和后续 AI 能力预留的索引结构。

---

## 控制层职责

控制层负责把系统从“数据集合”变成“可运行产品”。

它负责：

- 接收前端和 AI Agent 的请求。
- 编排扫描、导入、索引、缓存和视图生成流程。
- 调用数据层与算法层。
- 输出稳定的接口和任务状态。

---

## Local Data Directory

建议的本地目录布局如下：

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

原则：

- 结构化事实进入数据库。
- 大型派生资产进入缓存目录。
- 缓存文件应可丢弃、可重建。

---

## Core Database Schema

### sources

保存用户添加的照片来源。

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

保存每张被索引照片的基础引用信息。

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

保存 EXIF 和技术元数据。

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

保存生成资产的路径和视觉派生信息。

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

V0 可以先支持手动人物标签，同时为未来人脸能力预留结构。

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

保存可用策略及其版本定义。

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

保存用户可见的视图。

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

视图可能会重复生成，因此需要区分视图定义与单次生成结果。

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

为未来相似能力预留。

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

---

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

---

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

缩略图生成应可重试。数据库应保存资产状态，缺失缓存文件应能在需要时重建。

---

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

---

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

---

## V0 Strategies

### TimelineStrategy

Groups photos by captured date.

### PlaceStrategy

Groups photos by GPS and inferred places.

### CameraStrategy

Groups photos by camera, lens, or focal length.

### SimilarityStrategy

V0 uses lightweight similarity signals before embeddings.

### MemoryStrategy

Generates a curated memory-style view using time, place, favorites, tags, and similarity signals.

### ManualStrategy

Stores a user-created selection or saved filter.

---

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

---

## Privacy and AI Boundaries

V0 defaults:

- Originals stay local.
- Index stays local.
- AI features are optional.
- Cloud AI, if introduced later, must require explicit user opt-in.
- Cloud AI should use derived thumbnails or metadata, not original files, unless explicitly allowed.
- Every model output stores model name, version, confidence, and generation time.

---

## Performance Targets

Initial targets:

- 10k photos: timeline first screen under 300 ms.
- 50k photos: timeline first screen under 800 ms.
- Background scans must not block the UI.
- Lists must use pagination or virtual scrolling.
- SQLite should use WAL mode.
- View results should be materialized to `view_items` instead of recomputing on every open.

---

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

---

## Test Plan

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

---

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

---

## Deferred Work

- RAW editing.
- Cloud sync.
- Automatic face recognition.
- Full vector search.
- Multi-user collaboration.
- Destructive file operations.
- Full map-first browsing.