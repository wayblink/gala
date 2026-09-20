# 实施清单

## Phase A：盘点与分类

- [x] 记录工作区基线和当前未提交 diff，不触碰已有改动。
- [x] 建立前端导入/导出清单，重点核验 `src/desktop/library.ts`、`src/desktop/photos.ts` 和 `src/desktop/webMock.ts`。
- [x] 建立 Rust 模块/命令/测试引用清单，核验全部 `allow(dead_code)`。
- [x] 将候选项分为 confirmed-unused、duplicate-but-live、deferred 三类，并在评审记录中保留路径和符号。

## Phase B：安全整理

- [x] 先为行为边界补充或调整最小回归测试。
- [x] 删除 confirmed-unused 代码和无引用临时入口。
- [x] 在不改变错误语义和 web mock 行为的前提下收敛重复 desktop bridge 包装。
- [x] 补齐 frontend spec 中与实际目录、测试、状态和类型约定相关的最小内容。
- [x] 评估直接相关的重复/过期文档；保留历史设计记录，未删除证据不足的文件。

## Phase C：验证与交付

- [x] `npm run test`
- [x] `npm run build`
- [x] `cargo check --manifest-path src-tauri/Cargo.toml`
- [x] `cargo test --manifest-path src-tauri/Cargo.toml`
- [x] 检查 `git diff`，确认没有覆盖用户已有改动或生成临时产物。
- [x] 输出已完成项、证据不足的 deferred 项和后续独立任务建议。

## 回滚点

每个清理类别独立修改；如果 bridge 合并或 Rust 删除导致测试/构建/行为回归，只回退该类别的文件改动，保留已验证的规范和审查文档更新。
