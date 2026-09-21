# 统一照片来源 Provider 抽象

## Goal

把 Local Folder 与 Apple Photos 统一到一套来源能力抽象之上，让浏览、索引、预览、集合和照片组织使用统一的上层数据流，同时明确不同 provider 的物理能力差异。

## Dependency

本任务是父任务“照片组织与 RAW 关联”的前置任务。照片组织计划必须依赖 provider 能力判断：当前 execute 只允许 Local Folder move；Apple Photos 只提供读取能力，未来 export 另立流程。

## Requirements

- 定义统一的来源身份、能力声明、资产枚举、元数据读取、预览、原图读取、集合读取和导出接口。
- 保留 Local Folder 的递归文件扫描、物理 move/copy 和目录集合语义。
- 保留 Apple Photos 的授权、PhotoKit asset identifier、album 集合和导出语义。
- 上层浏览与组织计划依赖 provider capability，而不是散落判断 `sourceKind`。
- 统一层不得把 Apple Photos 虚构成拥有稳定 Finder 路径或可原地移动的文件夹。
- 保持现有 `sources`、`photos`、`source_collections`、`TimelinePhoto` 和现有前端行为兼容。
- 以父任务设计中的 `photo_records`、`photo_locations`、`photo_groups`、`views` 和 `organization_plans` 分层为长期目标，provider 只负责资产访问与物理能力，不拥有 View 或照片身份。
- provider 执行物理动作时不得重建稳定 `photo_id`；位置历史由控制层记录，provider 只返回物理操作结果。
- provider 或物理操作返回错误时由控制层默认暂停任务；继续和回滚是显式控制命令，不由 provider 自行决定。

## Out of scope

- 不在本任务中实现完整照片组织规则或 dry run UI。
- 不直接修改 Apple Photos 原库内容。
- 不引入插件系统或跨进程 provider 服务。

## Acceptance Criteria

- [x] Local Folder 与 Apple Photos 都能通过统一 provider contract 提供浏览所需的照片资产和元数据。
- [x] provider contract 可以描述 `move`、`copy`、`export`、`readOriginal`、`collections` 等能力，但当前 organization execute 只消费 `move`。
- [x] Provider capability gate 已接入 Reorganize 计划扫描：只有支持 move 的 Local Folder 才能进入 organization execute；Apple Photos 当前 fail closed。
- [x] Reorganize 前后端均强制 move-only；copy/export 不属于当前组织执行路径。
- [ ] 现有前端测试、Rust 测试和数据迁移兼容性保持通过。
- [ ] 形成 provider contract、错误语义和迁移边界的设计文档。
- [ ] provider 错误、能力不足和目标状态变化都能映射到可持久化的 paused 状态，并支持显式 continue/rollback。

## Confirmed data identity rule

照片移动后保持原有 `photo_id` 不变；当前路径和历史路径由控制层写入 `photo_locations`，View、分析结果和逻辑组只引用稳定 ID。
