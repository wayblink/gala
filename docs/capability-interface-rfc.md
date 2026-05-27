# Capability Interface RFC

> 能力层（capability layer）的接口契约。回答控制层如何调用能力层、provider 如何接入、分析任务如何持久化、结果如何被上层与外部消费。
>
> 上层定位见 [core-image-analysis-platform.md](core-image-analysis-platform.md)；底层 schema 与扫描流程见 [data-and-control-design.md](data-and-control-design.md)。
>
> Status: **Draft v0.1** · Last updated 2026-05-27 (5 open questions resolved)

---

## 一句话结论

控制层通过一个 in-process Rust trait `CapabilityProvider` 调用能力层；provider 实现可以纯 Rust（macOS Vision、ONNX）也可以内部启子进程（Python torch）；分析任务用全新的 `analysis_jobs` / `analysis_events` 两表持久化，与 `scan_jobs` 解耦；结果分两层落地——首类信号（人脸、嵌入向量）落进入域专属表，其余落入通用 `analysis_results(photo_id, capability, provider_id, result_json)` 账本。

People 是首个 capability consumer，复用同一套机制，不开特殊后门。

---

## 1. 动机

`docs/TODOS.md` P0 三个相邻问题汇成一个 RFC：

1. **控制层 → 能力层** 的调用形态：Rust trait / FFI / 子进程 HTTP / in-process channel？
2. Provider 结果的**统一序列化格式**。
3. 任务状态**持久化表**——能否复用 `scan_jobs`？

不先把这层契约定下来，People、Places、Memories 三个 V1 模块都会各自捏一套底层，能力无法复用，外部 AI Agent 接入无锚。

设计目标：

- **上下分层**：控制层只看 `CapabilityProvider` trait，不感知具体模型在哪。
- **进出可换**：macOS Vision、ONNX、远程推理、子进程 Python 都能作为同一 trait 的实现。
- **结果可复用**：跑过的 (photo, capability, provider_version) 不重复算，除非显式强制。
- **任务可追溯**：每次分析对应一条 `analysis_jobs` 记录，事件流可审计。
- **外部可调**：AI Agent 层经控制层调用能力，不绕过事实表。

非目标（V0 不解决）：

- 分布式推理调度。
- 跨设备 provider 协商。
- Provider 自动升级 / 热替换。
- 实时（< 100ms）流式分析。

---

## 2. 调用形态

### 2.1 决策：**in-process Rust trait** 作为契约

```rust
// src-tauri/src/capability/mod.rs（待新建）

pub type CapabilityId = &'static str;       // e.g. "face.detect", "face.embed"
pub type ProviderId  = String;              // e.g. "macos.vision.v1"

#[async_trait::async_trait]
pub trait CapabilityProvider: Send + Sync {
    fn id(&self) -> ProviderId;
    fn capabilities(&self) -> &'static [CapabilityId];
    fn schema_version(&self, capability: CapabilityId) -> u32;

    /// 单张照片分析。Provider 内部决定是同步、异步还是 spawn 子进程。
    async fn analyze(
        &self,
        ctx: &AnalyzeContext,
        capability: CapabilityId,
        input: &AnalyzeInput,
    ) -> Result<AnalyzeOutput, CapabilityError>;

    /// 可选：批量入口，让 provider 自己优化批 inference。
    async fn analyze_batch(
        &self,
        ctx: &AnalyzeContext,
        capability: CapabilityId,
        inputs: &[AnalyzeInput],
    ) -> Result<Vec<Result<AnalyzeOutput, CapabilityError>>, CapabilityError> {
        // 默认逐张回落到 analyze()
        let mut out = Vec::with_capacity(inputs.len());
        for input in inputs {
            out.push(self.analyze(ctx, capability, input).await);
        }
        Ok(out)
    }
}

pub struct AnalyzeContext {
    pub job_id: String,
    pub cancel: tokio_util::sync::CancellationToken,
    pub config: serde_json::Value,   // provider-specific
}

pub struct AnalyzeInput {
    pub photo_id: String,
    pub image_path: PathBuf,         // 解析过的真实路径
    pub thumbnail_path: Option<PathBuf>,
    pub hint_dimensions: Option<(u32, u32)>,
}

pub struct AnalyzeOutput {
    pub capability: CapabilityId,
    pub provider_id: ProviderId,
    pub schema_version: u32,
    pub result: serde_json::Value,   // 结构由 capability schema 定义
    pub confidence: Option<f32>,
    pub artifacts: Vec<Artifact>,    // 嵌入文件、热区图等附属物
}

pub struct Artifact {
    pub kind: &'static str,          // "embedding", "heatmap", "crop"
    pub bytes: Vec<u8>,              // 或 path 引用，看大小
    pub mime: &'static str,
}
```

### 2.2 为什么是 trait + in-process

| 选项 | Pros | Cons | 评级 |
|---|---|---|---|
| **In-process Rust trait** | 零 IPC、类型安全、可调试；macOS Vision 经 objc2 直接调；ONNX Runtime 有 Rust binding | 与宿主进程同生命周期，模型崩溃会拖累 app；语言生态绑死 Rust | **采纳** |
| 子进程 IPC | 沙箱化；可跑 Python torch；崩溃隔离 | 协议、序列化、进程管理全要写 | V2 选项 |
| Localhost HTTP/gRPC | 解耦彻底；可跨机器 | 启动慢；本地用户不需要这层 overhead | 拒绝 |
| C FFI 直连模型 | 性能极致 | 极易踩 ABI/内存 bug；难以替换 | 拒绝 |

但是注意：**trait 是契约，进程边界是实现细节**。一个 trait impl 内部完全可以 spawn 子进程（例如未来 `OnnxPythonProvider` 维护一个长存 Python 子进程，trait 调用通过 stdin/stdout 转发）。控制层不需要也不应该知道。

### 2.3 注册与发现

```rust
pub struct CapabilityRegistry {
    by_id: HashMap<ProviderId, Arc<dyn CapabilityProvider>>,
    by_capability: HashMap<CapabilityId, Vec<ProviderId>>,
}

impl CapabilityRegistry {
    pub fn register(&mut self, provider: Arc<dyn CapabilityProvider>);
    pub fn providers_for(&self, capability: CapabilityId) -> &[ProviderId];
    pub fn select(&self, capability: CapabilityId) -> Option<Arc<dyn CapabilityProvider>>;
}
```

Provider 注册在 `lib.rs` 启动时完成，按 capability 排序（优先级表写在 `assets/capability-priority.toml`，可被用户偏好覆盖）。

---

## 3. Provider 结果的统一序列化

### 3.1 两层结构

```
┌──────────────────────────────────────────────────────────────┐
│  analysis_results (通用账本)                                 │
│  photo_id | capability | provider_id | schema_v | json blob  │
│  - 完整保留每个 (photo, capability, provider) 三元组          │
│  - 查询入口稳定；结构由 capability 自描述                     │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼ 物化（写入时同步）
┌──────────────────────────────────────────────────────────────┐
│  域专属表（首类信号）                                          │
│  faces / face_embeddings / scene_labels / image_embeddings   │
│  - 为索引、join、UI 渲染优化                                  │
│  - 模式稳定，跨 provider 兼容                                 │
└──────────────────────────────────────────────────────────────┘
```

**写入路径**：provider 返回 `AnalyzeOutput { result: serde_json::Value }` →  capability orchestrator 同时写 `analysis_results` 账本 + 解构成域表行。账本是真源（source of truth），域表是物化视图（materialized view）。schema 升级时可以从账本重物化。

### 3.2 Capability 结果 Schema 约定

每个 capability 必须发布一个 JSON Schema 写在 `docs/capability-schemas/<capability>.json`：

```json
// docs/capability-schemas/face.detect.v1.json
{
  "capability": "face.detect",
  "schema_version": 1,
  "result": {
    "type": "object",
    "required": ["faces"],
    "properties": {
      "faces": {
        "type": "array",
        "items": {
          "required": ["bbox", "confidence"],
          "properties": {
            "bbox": { "type": "array", "items": { "type": "number" }, "minItems": 4, "maxItems": 4 },
            "confidence": { "type": "number" },
            "landmarks": { "type": "array", "items": { "type": "number" } }
          }
        }
      }
    }
  }
}
```

线上格式：JSON UTF-8。后续若性能瓶颈再切 msgpack；切换不影响 schema。

### 3.3 大对象（嵌入向量、特征图）

不放进 `analysis_results.result_json`。走 `Artifact` 通道写到 `data/artifacts/<photo_id>/<capability>/<provider>/<id>.bin`，并把路径记进域专属表（`face_embeddings.embedding_path`）。

---

## 4. 任务持久化：`analysis_jobs` 不复用 `scan_jobs`

### 4.1 为什么不复用

| 维度 | scan_jobs | analysis_jobs |
|---|---|---|
| 触发源 | 用户加 source | 任意 capability 请求 |
| 单位 | source 整体 | photo / source / all |
| 失败语义 | 单个文件 IO 错误 | 模型推理错误、provider 不可用 |
| 状态集 | queued/running/completed/failed/cancelled | 同上 + `partial`（部分照片成功） |
| 生命周期 | 一次性 | 可重跑（schema 升级、provider 换代） |

混在一张表会丢掉 capability/provider 维度，索引也变畸形。

### 4.2 Schema

```sql
CREATE TABLE analysis_jobs (
  id              TEXT PRIMARY KEY,
  capability      TEXT NOT NULL,                  -- 'face.detect' | 'face.embed' | ...
  provider_id     TEXT NOT NULL,                  -- 'macos.vision.v1'
  schema_version  INTEGER NOT NULL,
  scope_kind      TEXT NOT NULL,                  -- 'photo' | 'source' | 'all'
  scope_id        TEXT,                           -- photo_id 或 source_id，scope_kind='all' 时 NULL
  status          TEXT NOT NULL,                  -- queued | running | paused | completed | failed | cancelled | partial
  priority        INTEGER NOT NULL DEFAULT 0,     -- 高优先级先跑
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  parent_job_id   TEXT REFERENCES analysis_jobs(id),  -- 组合任务（例：people 整理 = detect + embed + cluster）
  config_json     TEXT,                           -- provider 配置
  started_at      TEXT,
  completed_at    TEXT,
  photos_total    INTEGER NOT NULL DEFAULT 0,
  photos_done     INTEGER NOT NULL DEFAULT 0,
  photos_failed   INTEGER NOT NULL DEFAULT 0,
  photos_skipped  INTEGER NOT NULL DEFAULT 0,     -- 命中缓存
  error_message   TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE analysis_events (
  id              TEXT PRIMARY KEY,
  analysis_job_id TEXT NOT NULL REFERENCES analysis_jobs(id),
  photo_id        TEXT REFERENCES photos(id),
  event_type      TEXT NOT NULL,                  -- started | result | skipped | failed | retried
  message         TEXT,
  result_summary  TEXT,                           -- 短 JSON，仅用于事件流；完整结果在 analysis_results
  created_at      TEXT NOT NULL
);

CREATE INDEX idx_analysis_jobs_status      ON analysis_jobs(status, priority DESC, created_at);
CREATE INDEX idx_analysis_jobs_capability  ON analysis_jobs(capability, provider_id);
CREATE INDEX idx_analysis_events_job       ON analysis_events(analysis_job_id, created_at);

CREATE TABLE analysis_results (
  photo_id        TEXT NOT NULL REFERENCES photos(id),
  capability      TEXT NOT NULL,
  provider_id     TEXT NOT NULL,
  schema_version  INTEGER NOT NULL,
  result_json     TEXT NOT NULL,
  confidence      REAL,
  job_id          TEXT REFERENCES analysis_jobs(id),
  generated_at    TEXT NOT NULL,
  PRIMARY KEY (photo_id, capability, provider_id, schema_version)
);

CREATE INDEX idx_analysis_results_capability ON analysis_results(capability, provider_id);
```

### 4.3 Job 生命周期

```
queued
  └─> running
        ├─> completed   (所有 photo 成功)
        ├─> partial     (部分成功 + 部分失败，可以续跑)
        ├─> failed      (provider 不可用 / 致命错误)
        └─> cancelled   (用户主动取消)
  └─> paused             (UI 暂停按钮，将来支持)
```

### 4.4 幂等性

orchestrator 调度前查 `analysis_results`：(photo_id, capability, provider_id, schema_version) 命中即跳过（`photos_skipped++`）。强制重算走 `analysis_jobs.config_json.force = true`。

---

## 5. People V0 — 首个 capability consumer

打通 RFC 的最小竖切。

### 5.1 涉及的 capabilities

| Capability | V0 Provider | 输入 | 输出（result JSON） | 写入域表 |
|---|---|---|---|---|
| `face.detect` | `macos.vision.v1`（macOS）/ `onnx.scrfd.v1`（其他） | image_path | `{ faces: [{ bbox, confidence, landmarks }] }` | `faces` |
| `face.embed`  | 同上 | image_path + bbox | `{ embedding_ref }` | `face_embeddings`（Artifact） |
| `face.cluster`| `cpu.hnsw.v1`（纯 Rust） | 全库 embeddings | `{ clusters: [{ rep_face_id, members: [face_id] }] }` | `persons`, `photo_faces` |

注意 `face.cluster` 是 **all-scope** 任务（不针对单张照片），但仍走同一 `analysis_jobs` 表，`scope_kind='all'`。

### 5.2 域专属表

```sql
CREATE TABLE faces (
  id              TEXT PRIMARY KEY,
  photo_id        TEXT NOT NULL REFERENCES photos(id),
  detected_by     TEXT NOT NULL,                  -- provider_id
  bbox_x          REAL NOT NULL,
  bbox_y          REAL NOT NULL,
  bbox_w          REAL NOT NULL,
  bbox_h          REAL NOT NULL,
  confidence      REAL NOT NULL,
  landmarks_json  TEXT,
  embedding_path  TEXT,                           -- artifact 路径，可为 NULL
  embedding_dim   INTEGER,
  person_id       TEXT REFERENCES persons(id),    -- cluster 分配，可为 NULL
  status          TEXT NOT NULL DEFAULT 'active', -- active | rejected | merged
  created_at      TEXT NOT NULL
);

CREATE TABLE persons (
  id              TEXT PRIMARY KEY,
  display_name    TEXT,                           -- 用户起的名，NULL = 未命名
  rep_face_id     TEXT REFERENCES faces(id),      -- 代表脸（用于 UI 缩略）
  cluster_method  TEXT NOT NULL,                  -- 'hnsw.v1' | 'manual'
  face_count      INTEGER NOT NULL DEFAULT 0,     -- 物化计数
  is_hidden       INTEGER NOT NULL DEFAULT 0,     -- 用户隐藏（如非人体）
  merged_into     TEXT REFERENCES persons(id),    -- 合并后指向新 person
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE photo_faces (
  photo_id        TEXT NOT NULL REFERENCES photos(id),
  face_id         TEXT NOT NULL REFERENCES faces(id),
  PRIMARY KEY(photo_id, face_id)
);

CREATE INDEX idx_faces_photo  ON faces(photo_id);
CREATE INDEX idx_faces_person ON faces(person_id) WHERE person_id IS NOT NULL;
CREATE INDEX idx_persons_name ON persons(display_name) WHERE display_name IS NOT NULL;
```

`photo_faces` 看似冗余于 `faces.photo_id`，但保留：(a) 与现有 `photo_tags` / `photo_albums` 模式一致；(b) 将来允许同一 photo 多个 face_id 时有 FK 完整性。

### 5.3 People V0 UX 范围

V0 暂不做：
- 命名 UI（待 V0.5）
- 合并 / 拆分聚类的人工 UI（待 V1）
- 人物推荐照片

V0 只做：
- 后台 `face.detect` + `face.embed` + `face.cluster` 任务跑通
- LeftRail → People 视图：宫格展示所有 person，每个 person 显示代表脸 + 张数
- 点击 person → 该人物的全部照片（复用 PhotoSurface）
- 可隐藏明显非人脸的聚类（设 `is_hidden=1`）

---

## 6. Tauri 命令表面

```rust
// 启动 / 排队
#[tauri::command] fn analysis_request(req: AnalysisRequest) -> Result<JobId>;
// req 包含 capability、scope、provider override、priority、config

// 查询单个 job
#[tauri::command] fn analysis_job(id: JobId) -> Result<AnalysisJob>;

// 列出近期 job
#[tauri::command] fn analysis_jobs_list(filter: JobFilter) -> Result<Vec<AnalysisJobSummary>>;

// 取消
#[tauri::command] fn analysis_cancel(id: JobId) -> Result<()>;

// 查结果（按 capability 聚合一张照片）
#[tauri::command] fn analysis_results(photo_id: PhotoId, capability: Option<CapabilityId>) -> Result<Vec<AnalysisResult>>;

// 通用 capability 注册查询（前端展示可用 provider）
#[tauri::command] fn capabilities_list() -> Result<Vec<CapabilityDescriptor>>;
```

People 模块在前端只调 `analysis_request({ capability: 'face.cluster', scope: 'all' })` 即可触发整链路。

---

## 7. AI Agent 层暴露

V0 不开 MCP，但接口要为后续暴露留口子。

外部要看到的：`capabilities_list`、`analysis_request`、`analysis_results`、`analysis_job`。

不暴露的：具体 provider 实现、模型文件路径、artifact 二进制位置。

---

## 8. 演进路径

**M1（本 RFC 落地）**：
- 建立 `capability` crate 模块、trait、registry。
- 落 `analysis_jobs` / `analysis_events` / `analysis_results` 三表 schema v7 migration（基线 v6 → v7）。
- People V0：`MacosVisionFaceProvider` + `HnswFaceClusterer`，最简 UI。

**M2**：
- Scene / Object provider，捞 Similar Review 的真实信号（替换现在的"时间窗 + 文件名"启发式）。
- Embedding 提取 + 近似最近邻索引（`image.embed` + `similar.search`）。

**M3**：
- 子进程 provider 形态（Python torch），用 stdio JSON 协议。
- MCP 服务器暴露 capability。

**M4**：
- 远程 provider（cloud inference）。
- Provider 自动选择策略（device-aware）。

---

## 9. Open Questions — Resolved (2026-05-27)

1. **Provider 优先级表的位置** → `assets/capability-priority.toml`（开发者默认顺序）+ user settings overrides（高级用户可调）。代码层 fallback 必须存在以防 toml 缺失。
2. **Artifact 存储路径根** → 同根 `data/artifacts/<photo_id>/<capability>/<provider>/<id>.bin`，与 thumbnail 共用顶层目录便于备份脚本扫描。若以后需要分保留策略，再切表里加 `retention_policy` 字段而不是分目录。
3. **Job 调度器** → V0 手写 tokio task pool（~100-200 行 Rust）。M3 上子进程 provider 时再评估 `apalis` / 自研 work queue。不引入 Redis 等外部依赖。
4. **聚类阈值的用户可调性** → V0 写死 `cosine = 0.55`，不暴露 UI。等真实用户反馈再决定是否暴露。
5. **GPU 路径** → V0 只走 Apple Silicon Neural Engine（macOS Vision 自动）+ CPU（ONNX 兜底）。Metal / CUDA 推迟到 M2 评估，避免踩 GPU 驱动适配坑。

## 10. Open Questions（未来）

留给 M2/M3 阶段决策的事项：

- **Metal / CUDA backend**：何时开 ONNX GPU runtime？需要先看 face.embed 在 CPU 上的 P50 / P95 latency。
- **聚类阈值暴露形态**：slider / 预设 chip / 高级设置开关？取决于用户实测投诉量。
- **Provider 自动选择策略**：现在按优先级取第一个能用的；将来要不要按 device load / battery 自动切换？

---

## 11. 相关文档

- [technical-architecture.md](technical-architecture.md) — 五层架构总纲
- [core-image-analysis-platform.md](core-image-analysis-platform.md) — 能力层定位
- [data-and-control-design.md](data-and-control-design.md) — 现有 photos / scan_jobs schema
- [TODOS.md](TODOS.md) — P0「能力层接口 RFC」收敛于本文
