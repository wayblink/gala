# Gala Design TODOs

Review 反馈汇总。按优先级与领域组织，逐项消化后迁移到对应设计文档或归档。

- P0：V0 实现前必须敲定，否则 V1 会踩坑。
- P1：V0 发布前强烈建议解决。
- P2：V1 前解决即可。

---

## P0 — 必须敲定

### 工程 / 数据

- [x] **`content_hash` vs `fingerprint` 的语义区分**
  - 明确：`content_hash = SHA-256(全文件)` 作为强身份；`fingerprint = size+mtime+header` 作为快速筛选。
  - 给 `content_hash` 加非唯一索引，用于跨 source 去重查询。
  - 更新 `data-and-control-design.md` 的 photos 表注释与扫描 pipeline 说明。

- [x] **`photos.logical_id TEXT NULL` 字段预留**
  - V0 不填写，V1 由 RAW+JPG 自动关联流程填写。
  - 避免 V1 落地时全表 migration。
  - 同时预留 `photo_groups` 表的草稿 schema（可在 TODOS.md 内先画 draft）。

- [x] **能力层接口形态 RFC**
  - 收敛于 [capability-interface-rfc.md](capability-interface-rfc.md)（2026-05-27 起草）。
  - 决策摘要：trait `CapabilityProvider` in-process / `analysis_jobs` 与 `scan_jobs` 解耦 / 结果走 `analysis_results` 账本 + 域专属表（faces、persons、photo_faces）/ JSON 序列化。
  - 实现入口：People V0 作为首个 capability consumer。

### UI / 设计

- [ ] **Focus Viewer wireframe**
  - 单张查看模式下，左 rail、中央图片、右 context panel 的比例与行为。
  - Filmstrip 导航栏的位置与尺寸。
  - 键盘快捷键（方向键、空格、Esc、数字键收藏）定稿。

- [ ] **Color system WCAG AA 校验**
  - 跑一遍 `amber-dust #c9974d` vs `ink-900 #201f1d`、`stone-500` vs `ink-850` 等组合。
  - 标记不达标的组合并提出替代色值。
  - 明确 `disabled` / `placeholder` / `focus ring` 的对比度策略。

---

## P1 — V0 发布前强烈建议

### 产品 / 战略

- [ ] **用户优先级已落地到 `product-design.md`**（已完成于本轮 review）
  - 重度爱好者 > 业余爱好者 > 小白 > 专业。
  - 后续每个 feature 的取舍都要回到这个排序上。

- [ ] **Sustainability section 的持续维护**（已起草于 `product-design.md`）
  - 随着反馈扩展「不做」清单。
  - V0 验收通过后再补"可能的付费形态"细化。

- [ ] **参考产品对照**（已列入 `product-design.md`）
  - Apple Photos、Mylio、digiKam、Adobe Bridge、Lightroom Classic、Photo Mechanic。
  - 下一步：为每个产品写一段「Gala 借鉴 / 回避」的具体细节，做成 `reference-products-analysis.md`（可选）。

- [ ] **差异化叙述收紧**
  - 在 `product-design.md` 的 Product Positioning 补一段「vs Apple Photos」和「vs Mylio」的一句话差异。
  - 核心差异候选：可解释的视图、AI Agent 对外开放、逻辑照片集合。

### 工程 / 数据

- [ ] **`views × view_instances × view_strategies` 三者关系收敛**
  - Manual / Saved view 的 `strategy_id` 是否允许 NULL？
  - 或者引入 `strategy_type=user_rule` 作为占位 strategy？
  - 在 `data-and-control-design.md` 的 schema 注释里明确。

- [x] **`photo_tags` 的 PK 与 source 语义**
  - 当前 `PRIMARY KEY(photo_id, tag_id, source)` 会让同一 tag 的 manual/ai 双来源各存一条。
  - 方案 A：改为 `PRIMARY KEY(photo_id, tag_id)`，`source` 改为 JSON 数组。
  - 方案 B：拆出 `photo_tag_sources(photo_id, tag_id, source, confidence)` 关联表。（已选）
  - 选一个并更新 schema。

- [ ] **扫描并发与锁策略**
  - 同一 source 串行，跨 source 并发 N 路（N 与 CPU 核心数挂钩？可配置？）。
  - SQLite WAL 下 batch 之间必须 yield 给 UI 读路径。
  - 写入 `data-and-control-design.md` 的 Scan Pipeline section。

- [ ] **Tauri / Rust 异步模型定稿**
  - 扫描：`tokio::spawn_blocking`？专用 thread pool？
  - 缩略图：`rayon` 并行？CPU core 数的多少百分比？
  - EXIF 解析：同步库 + blocking pool，还是完全 async？
  - 这个决定直接影响 UI 卡顿体验，必须在第一个性能回归发生前定。

- [ ] **资源预算（Resource Budget）section**
  - 在 `data-and-control-design.md` 新增 section，给出：
    - 磁盘缓存上限（10k / 50k / 200k 三档）。
    - 内存占用上限。
    - 空闲 / 工作模式下的 CPU 占比目标。
    - 电池模式下是否暂停后台任务。

- [ ] **Compute Tier 分层**
  - 在 `core-image-analysis-platform.md` 补：
    - T0 扫描时必做（EXIF、fingerprint、缩略图）。
    - T1 用户进入对应视图时触发（embedding、face）。
    - T2 显式触发（大模型、云 AI）。
  - 避免在导入时全量跑重计算。

- [ ] **缩略图与预览的存储策略细化**
  - 缩略图三档用 WebP 或 AVIF（而非 JPEG）。
  - 大库（>10 万）的目录分桶：`thumbnails/small/ab/cd/abcdxxx.webp`。
  - `previews/` 按需生成 + LRU 淘汰，上限 N GB。
  - 明确不把缩略图塞进 SQLite blob。
  - macOS 上走 Image I/O / QuickLook 生成缩略图，其它平台 fallback 到跨平台库。

- [ ] **索引优化**
  - `idx_photos_captured_at` 改为 partial index 或 captured_at NULL 时用 imported_at 兜底。
  - 同时评估是否需要 `idx_photos_content_hash`（用于跨 source 去重）。

- [ ] **每个 Failure Mode 至少一个集成测试**
  - 列一张「Failure Mode × 对应测试用例」表，挂在 `data-and-control-design.md` 的 Test Plan section。
  - 优先覆盖：扫描 commit 时外置硬盘拔出、扫描中途崩溃恢复、同一 source 两次扫描冲突。

- [ ] **Vector search 方案选型（V1+ 准备）**
  - 候选：`sqlite-vec`、`hnswlib`、`usearch`（推荐）。
  - 单文件、跨平台、Rust binding、增量插入成本。
  - 早点决定，避免 embedding 先落盘再迁移。

### UI / 设计

- [ ] **Top Bar 信息密度 & 响应式策略**
  - 1440px 下 7 个元素（name、view title、count、search、add source、density、filter）能否放下？
  - 窗口缩到 1024 时哪些降级？哪些进入 overflow menu？
  - 附上 1440 / 1280 / 1024 三档草图。

- [ ] **Context Panel 两种模式切换规则**
  - 选中照片展示 EXIF、选中视图展示 explanation——切换契机是什么？
  - 用户能否 pin 一个视图的 explanation 然后继续浏览照片？
  - 输出状态图或决策树。

- [ ] **Offline / Missing 的视觉表达定稿**
  - 缩略图打角标？整张 tint？banner？
  - 区分的价值完全取决于用户能否一眼看出。
  - 与 `desktop-ui-design.md` 的 Empty/Loading/Failure States 合并。

- [ ] **Similar / Memories 的 IA 位置复议**
  - 目前与 Timeline/Places 同级，但 Timeline 是「总在那里」的基础视图，Similar 是「有内容时才亮」的探索视图。
  - 建议下沉到 Explore。
  - 如果保留现状，需要设计 Similar 空态的解释文案。

- [ ] **Light mode 决策**
  - V0 是否只做 dark？显式声明。
  - 若 V1 加 light mode，现在的色彩 token 语义（amber 主操作、stone 中性）要能安全迁移。

- [ ] **可访问性清单**
  - 键盘导航：grid 上下左右、focus viewer 的 Tab 顺序。
  - 触控 / 触控板手势：pinch、双指滚动方向。
  - 屏幕阅读器：photo tile / view explanation 的 aria-label 规则。
  - Reduced motion：禁用哪些动画、哪些保留结构提示。

---

## P2 — V1 之前

- [x] **Logical Photo Set 完整 schema**
  - 已基于 `photos.logical_id` 增加 `photo_groups` 与 `photo_group_members`，并在迁移时投影现有关联。
  - 当前自动关联继续使用已有 logical_id；基于时间戳/文件名/camera 的候选匹配和用户手动合并/拆分仍属于后续 V1 任务。

- [ ] **AI Agent 层接口草案**
  - 承接 V2 的 AI 能力引入。
  - MCP / Skill / HTTP API 三选一或组合策略。
  - 能力列表（查询、分析任务、结果复用）。

- [ ] **内存 / 磁盘占用目标纳入 NFR**
  - 在 `data-and-control-design.md` 补一份 Non-Functional Requirements。
  - 包含可靠性（崩溃恢复能力）、启动时间、后台任务 CPU 占比等。

- [ ] **多视图保存 / 分享策略**
  - 保存的 view instance 能否被另一台设备消费？
  - 是走独立导出文件，还是依赖未来的同步机制？

- [ ] **迁移与兼容**
  - SQLite schema 版本化与 migration 流程。
  - V0 → V1 的数据迁移脚本测试。

---

## 跨维度 / 文档治理

- [ ] **V0 / V1 / 阶段 1/2/3 术语统一**
  - 各文档目前混用，建议在 `README.md` 补一张「milestone × 能力」映射表，各文档引用。

- [ ] **本文档的消化流程**
  - 每解决一项，迁移到对应设计文档并在本文件勾掉。
  - 每季度 review 一次未解决项的优先级是否需要上调。
