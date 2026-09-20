# 技术设计：安全清理与边界收敛

## 目标边界

首轮只处理不改变产品语义的整理。前端继续以 React feature/component/state 分层，`src/desktop` 作为唯一 Tauri/web mock 适配边界；Rust 继续保持 `library`（照片事实与持久化）和 `capability`（分析能力）分界。

## 重点审查面

1. `src/desktop/library.ts` 与 `src/desktop/photos.ts`：核对重复导出和重复的 invoke/error 包装。已有调用路径显示 `getTimelinePhotos`、`getThumbnailFile` 在两个模块同时存在，必须先按 import 图确认是否能安全收敛。
2. Coming-soon 与已实现 feature：核对 `ComingSoonView`、`PeopleView`、`SimilarReviewView`、Explore 和 Reorganize 的路由条件，只有确认无入口且无测试价值才删除或改名。
3. Rust `#[allow(dead_code)]`：逐项检查 `JobRecord`、`artifact_path_for`、provider `calls()` 等是否由测试、条件编译或未来公开边界使用；优先移除无必要的 suppress，而不是盲删 API。
4. 文档、脚本和规范：区分仍用于开发/验收的入口与历史记录；只整理明显重复、过期且无引用的说明，规范文件补充实际约定。

## 工作方式

- 先生成基线：`git status --short`、相关文件 diff、构建和测试结果。
- 每个候选改动都保留“引用证据 + 编译/测试证据”。
- 适配层如需合并，使用小步提交式修改和行为测试，保证 web mock 与 Tauri 两条路径都覆盖。
- 不修改数据库 schema、算法阈值、导航产品决策或外部公开命令名。

## 回滚与风险

高风险项是删除可能被 Tauri command 注册、测试或未来 feature 使用的 Rust 公共函数，以及合并两个返回类型/错误策略不同的 desktop bridge。任何证据不足的项进入 deferred 清单，不在本轮处理。每轮修改后运行完整质量门槛，发现行为差异时按文件恢复本轮局部改动。
