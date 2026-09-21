# 数据结构调整设计：事实、位置、关系与视图分离

## 1. 设计目标

照片组织会改变文件路径，但路径变化不应改变“这是哪一张照片”的身份；时间线、RAW+JPEG 关联和相似照片聚合也需要在物理文件变化后保持稳定。因此把当前 `photos` 里的概念拆成四层：稳定照片身份、当前物理位置、逻辑照片组、视图关系/结果。

## 2. 推荐拓扑

```text
photo_records              稳定的物理照片身份
  ├── photo_locations       当前和历史物理位置
  ├── photo_metadata        EXIF/技术事实
  ├── photo_assets          可重建缩略图/预览
  ├── photo_group_members   RAW/JPEG/HEIF 逻辑组
  ├── analysis_results      质量/标签/embedding 等派生结果
  └── view_items            View 对照片或逻辑组的关系

organization_plans
  └── organization_entries  dry run 中的 source location → target location
        └── execution_runs 经过确认后的实际物理操作和结果

background_tasks
  └── organization_task_logs / checkpoints / rollback_entries
```

当前 `photos` 表可以作为迁移期间的兼容投影，但长期不应让 `id` 同时承担内容身份、路径身份和逻辑组身份。

## 3. 核心实体

### photo_records

保存稳定的照片事实：`id`、`content_hash`、`fingerprint`、文件名、扩展名、尺寸、拍摄时间、相机、镜头、状态和创建时间。`id` 在组织移动后保持不变。

### photo_locations

保存物理位置：`photo_id`、`source_id`、`relative_path`、`absolute_path_snapshot`、`is_current`、`observed_at`、`moved_by_operation_id`。同一张照片跨目录移动时更新 current location，并可留下历史位置供回滚、审计和定位失败。

### photo_groups / photo_group_members

保存逻辑照片关系。一个 group 可以包含 RAW、JPEG、HEIF 或导出版本；成员关系带 `role`、`match_method`、`confidence` 和 `confirmed_by`。`logical_id` 可以在迁移期继续作为兼容字段，但新逻辑应逐步转为显式 group/member。

### views / view_instances / view_items

View 是查询或组织结果的外部投影，不复制完整 Photo 事实。`view_items` 通过 `photo_id` 或 `photo_group_id` 引用稳定身份，同时保存当次结果的 `group_key`、`sort_order`、`weight`、`reason_json` 和 `location_snapshot`。`location_snapshot` 只用于解释“当时用户看到的路径”，不作为事实来源。

View 可以按物理照片展示，也可以按逻辑组展示：`item_kind = photo | group`。时间线默认以 logical group 为展示单位，展开后再列出物理 variants；需要文件级整理时切换为 photo item。

### organization_plans / entries / execution_runs

Plan 是 dry run 的持久化意图；entry 保存稳定 `photo_id`/`group_id`、源位置版本、目标位置、规则解释、冲突结果和 provider action（move/copy/export/skip）。执行前校验源位置版本仍匹配，避免用户预览后文件已变化却误操作。execution run 记录逐条成功、失败、跳过和错误，不直接把 View 当前状态当作移动命令。

### 组织任务与目录树

组织页面是一个计划审查面：左栏展示 source tree，右栏展示 target tree。两栏都由同一个 immutable plan 生成，不能分别重新扫描，否则用户确认的左右映射可能漂移。树节点至少包含 path、photo/group count、代表性文件和冲突/跳过标记；明细列表展示 `source_location → target_location`。

dry run 本身也是后台任务：它负责递归发现、读取 metadata、匹配 logical group、套用规则、解决冲突并持久化 plan/tree snapshot。只有 dry run 成功且 plan 版本未变化时，execute 才能启动。

real run 是另一个后台任务，逐条消费 immutable plan entry。每条 entry 记录 `planned → verified → started → completed | skipped | failed | rolled_back`，并保存 source fingerprint、target existence、provider action、开始/完成时间和错误。任务级别保存 `queued/running/paused/succeeded/failed/cancelled/recovery_required`、completed/failed/skipped counters、current cursor 和 plan version。

执行失败、源 fingerprint 变化、目标冲突变化或 provider 能力不足时，任务默认转为 `paused`，禁止自动继续或自动回滚。`continue` 必须重新验证所有待执行 entry；`rollback` 只对有明确成功日志且仍满足安全条件的 entry 执行补偿操作。用户操作和每次状态转换都写入 task log。

续做从最后一个未完成 entry 开始，但必须重新验证所有待执行 entry 的 source fingerprint 和 target 状态；不能只依赖 cursor。回滚使用补偿操作日志：对已完成 move 执行反向 move，对 copy 删除由本次任务新建且仍未被用户修改的目标文件；无法安全补偿时标记 `recovery_required`，交给用户逐条处理。

日志分三层：任务状态日志、entry 物理操作日志、reconciliation 日志。日志必须写入持久化存储，不能只依赖前端 console 或内存 state。目录树快照和 plan JSON 需要保留到任务结束之后，保证用户能回看“修改前/修改后”。

## 4. 时间线与相似聚合

- 时间线排序使用 `photo_records.captured_at`，缺失时回退文件观察时间；它不依赖当前路径。
- 同一逻辑组只显示一个代表项，代表项选择可以按 RAW/JPEG 偏好、质量分数或用户设置决定。
- 相似聚合以 `photo_group_id` 为可选输入：先避免同一 RAW+JPEG 组内部重复计入，再把不同逻辑组按时间窗口、embedding 和质量信号聚合。
- 相似结果保存为分析/视图派生结果，不能反向改写 photo identity 或物理 location。
- 文件移动后只需要更新 `photo_locations` 并重新生成受影响 View；日期、相机、镜头、embedding 等事实不应因为路径变化而重算，除非文件内容 fingerprint 发生变化。

## 5. 迁移策略

1. 保留现有 `photos` 作为兼容读模型，增加 `photo_locations` 和显式 group/member 表。
2. 用现有 `photos.id` 创建 `photo_records.id`；把现有路径字段迁入一条 current location。
3. 现有 `logical_id` 按值创建 group，并把同值 photos 写入 members。
4. 先让现有查询继续返回 `TimelinePhoto`，内部改为从 records + current location + group 聚合。
5. 将 Reorganize 扩展为 organization plan/entry/run；执行后只更新 location，再触发索引 reconciliation。
6. 最后再考虑删除 `photos` 中的路径兼容字段，避免一次性破坏现有命令和 sidecar。

## 6. 索引结构

索引不等于事实表。移动文件时，必须同步更新影响路径查询的事实索引；缩略图、相似度和 View 结果可以在确认事实提交后异步重建。

### 6.1 事实索引（SQLite B-tree）

```sql
CREATE UNIQUE INDEX ux_photo_locations_current
  ON photo_locations(photo_id) WHERE is_current = 1;

CREATE UNIQUE INDEX ux_photo_locations_source_path
  ON photo_locations(source_id, relative_path) WHERE is_current = 1;

CREATE INDEX ix_photo_records_captured_at
  ON photo_records(captured_at, id);

CREATE INDEX ix_photo_records_format
  ON photo_records(format_kind, extension, id);

CREATE INDEX ix_photo_records_camera_lens
  ON photo_records(camera_model, lens_model, id);

CREATE INDEX ix_photo_records_content_hash
  ON photo_records(content_hash) WHERE content_hash IS NOT NULL;

CREATE INDEX ix_photo_records_fingerprint
  ON photo_records(fingerprint);
```

这些索引支撑来源浏览、时间线、格式/相机/镜头筛选、重复检测和移动后的路径唯一性。`photo_locations` 的 current partial index 是组织功能的关键：历史路径不能参与普通浏览和冲突判断。

### 6.2 逻辑关系索引

```sql
CREATE UNIQUE INDEX ux_group_member_active
  ON photo_group_members(photo_id) WHERE status = 'active';

CREATE INDEX ix_group_members_group
  ON photo_group_members(photo_group_id, role, confidence DESC);

CREATE INDEX ix_group_candidates_pair
  ON photo_group_candidates(photo_id, match_method, confidence DESC);
```

候选关联和已确认关联分开。RAW+JPEG 的低置信匹配不能直接进入 active group，否则时间线和组织计划会把错误配对当成事实。

### 6.3 View 结果索引

```sql
CREATE UNIQUE INDEX ux_view_items_instance_item
  ON view_items(view_instance_id, item_kind, item_id);

CREATE INDEX ix_view_items_order
  ON view_items(view_instance_id, group_key, sort_order);

CREATE INDEX ix_view_items_photo
  ON view_items(item_kind, item_id);
```

View 查询先按 `view_instance_id` 取排序结果，再通过稳定 `item_id` 回连 photo/group；不按 `location_snapshot` 查询。组织执行后，受影响 View 标记 stale 并重建，不需要修改 View 历史快照。

### 6.4 组织计划索引

```sql
CREATE INDEX ix_org_entries_plan_status
  ON organization_entries(plan_id, status);

CREATE INDEX ix_org_entries_source_location
  ON organization_entries(source_location_id, status);

CREATE INDEX ix_org_runs_plan_created
  ON organization_runs(plan_id, created_at DESC);
```

Plan entry 应保存 source location 的版本/fingerprint。执行时按 `source_location_id` 和版本校验，避免 dry run 后用户手动移动文件导致错误执行。

### 6.5 搜索与分析索引

- 文件名、路径、相机和镜头的文本搜索可使用 SQLite FTS5 投影；FTS 只存可搜索字段和稳定 `photo_id`，不存 UI 文案或物理路径的唯一真相。
- embedding 继续使用独立向量索引/文件资产，数据库保存 `photo_id`、模型版本、维度、artifact 路径和状态；向量索引重建后必须能按稳定 photo/group ID 回查。
- 相似照片查询先按 active logical group 去重，再访问 embedding 索引，避免 RAW/JPEG 同组重复占据相似结果。

### 6.6 更新时序

```text
execute operation
  → verify source location fingerprint
  → physical move/copy/export
  → transaction: current location + photo status + operation result
  → invalidate affected views / FTS path projection
  → async rebuild thumbnails/path search/view instances
```

如果物理操作失败，不能提前更新 current location；如果数据库事务失败，执行记录必须标记 reconciliation required，而不是假设文件仍在旧位置。

## 7. 关键不变量

- 移动文件不改变稳定 `photo_id`。
- 一个 `photo_id` 同时只能有一个 current location；历史 location 不参与普通浏览查询。
- 一个物理照片最多属于一个 active logical group；未确认的匹配可以保持候选关系而不进入 active group。
- View item 引用稳定 ID；路径快照只用于解释和审计。
- organization execute 必须校验 plan 版本、源位置 fingerprint 和 provider capability。
- Apple Photos asset 没有稳定可移动路径，只能产生 export entry；不能伪装成 move entry。
