# Provider 抽象设计

## 边界

统一 contract 负责资产读取、元数据、集合和能力声明；控制层负责 plan、后台任务、路径事实、日志、暂停、继续和回滚。provider 不直接写 View、不生成 photo identity，也不自行决定失败后的恢复策略。

## Contract

```text
SourceProvider
  describe(source) -> SourceDescriptor
  enumerate_assets(scope) -> AssetDescriptor[]
  read_metadata(asset_id) -> PhotoMetadata
  read_preview(asset_id, size) -> AssetHandle
  read_original(asset_id) -> AssetHandle
  list_collections(source) -> CollectionDescriptor[]
  export(asset_id, destination) -> PhysicalResult
  copy(asset_id, destination) -> PhysicalResult      // capability-gated
  move(asset_id, destination) -> PhysicalResult      // capability-gated
```

`SourceDescriptor.capabilities` 至少包含 `read`, `readOriginal`, `collections`, `export`, `copy`, `move`。Local Folder 实现 move/copy；Apple Photos 实现 read/readOriginal/collections/export。

## 失败状态

控制层将 provider 错误、源 fingerprint 变化、目标状态变化和 capability mismatch 映射到后台任务 `paused`。`continue` 重新验证所有未完成 entry；`rollback` 读取成功操作日志并执行安全补偿。provider 只返回成功、失败和错误详情。

## 兼容性

现有 `sources.source_type`、`photos.source_id` 和 `TimelinePhoto` 保持兼容。新 contract 通过 adapter 接入现有 commands，再逐步让 Reorganize/organization 依赖 capabilities。
