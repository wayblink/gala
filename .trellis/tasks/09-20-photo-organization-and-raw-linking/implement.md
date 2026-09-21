# 实施清单

## Phase 1：Provider 与数据基础

- [x] 建立 Local Folder / Apple Photos provider contract 和 capability gate。
- [x] 将组织执行收敛为 Local Folder move-only；dry run 不创建目录、不修改文件。
- [x] 增加 `organization_plans`、`organization_entries`、`organization_runs`、`organization_logs` schema。
- [x] 增加 `photo_locations`、显式 photo group/member 和 View item schema。

## Phase 2：持久化 dry run

- [x] 支持一个或多个已索引 Local Folder 输入根目录，并把范围写入 plan。
- [x] 将 before/after tree、entry、冲突和规则快照持久化。
- [x] dry run 通过现有 durable background task 执行，并持久化 plan/tree snapshot，可重新打开查看。
- [x] plan version 和 source fingerprint 校验；支持可选 sourceRoots 过滤。

## Phase 3：真实执行与恢复

- [x] execute 只消费已持久化且状态可执行的 plan，并创建 organization run。
- [x] entry 级状态、run 计数、cursor、日志和最终 plan 状态持久化。
- [x] 失败默认 paused，增加显式 continue 和 rollback 命令及前端入口。
- [x] move 前校验 source fingerprint，move 后写入 photo_locations 历史/current 记录并更新照片路径快照，保持 photo_id 不变。

## Phase 4：UI 与聚合

- [x] 左右目录树展示同一 plan 的 before/after snapshot。
- [x] 按日期、格式、相机、镜头配置规则并展示缺失值 fallback。
- [x] 按现有 `logical_id` 迁移到显式 group/member，并规划 RAW/JPEG/HEIF 的共同目标目录。
- [x] Timeline 查询写入 `view_instances/view_items` 快照，并按 merged 模式以 logical group item 去重；物理 variants 仍可展开。
- [x] Similar 聚合输入按 logical group 去重，优先保留收藏/质量更高的代表项；物理 variants 仍由 Timeline 展开。
- [x] move 成功后将 Timeline/Similar view instances 标记 stale，避免继续使用旧路径快照。

## Validation

- `npm run test`
- `npm run build`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- 物理文件测试使用临时目录，结束后清理全部测试文件和目录。
