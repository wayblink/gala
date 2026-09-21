# 实施清单

- [x] 定义 SourceDescriptor、AssetDescriptor、CollectionDescriptor、错误类型和 capability 类型。
- [x] 将 Local Folder 递归枚举、metadata/original 读取、collection 发现和 move 接入 adapter。
- [x] 将 Apple Photos 资产枚举、metadata、preview、original、集合和 export 接入 adapter，明确当前 organization 仍不支持 move。
- [x] 增加现有 `source_type` 到统一 descriptor 的兼容映射和物理 action capability gate，保持现有来源命令与前端 DTO 兼容。
- [x] 为 provider 能力不足和错误边界补充测试；暂停/继续/回滚通过组织执行链验证。
- [x] 将现有 Reorganize 扫描入口接入 provider action capability gate；Apple Photos 的 move/copy 在计划阶段 fail closed，后续 export 仍单独接入。
- [x] 在前后端 Reorganize 边界同时强制 move-only，旧客户端传入 copy 也会被拒绝。
- [x] 运行 `npm run test`、`npm run build`、`cargo check --manifest-path src-tauri/Cargo.toml` 和相关 Rust 测试。
