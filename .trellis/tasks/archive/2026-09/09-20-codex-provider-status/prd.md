# Enhance codex-provider status and switching

## Goal

参考远程 shai 上的 codex-provider，增强本机 provider 状态展示、切换后的状态回显、配置备份与并发保护。

## Requirements

- `codex-provider status` 显示当前 `model`、`model_provider`、`preferred_auth_method`、`responses_websockets`。
- `status` 显示 `~/.codex/auth.json` 是否存在且可解析，但不得输出认证值。
- `status` 显示 `MODEL_PROXY_KEY`、`STEP_SYS_KEY` 等已支持密钥是否可用，只显示 available/missing。
- `help` 说明各 provider、配置作用、备份和安全行为。
- 切换 provider/model 后自动打印完整状态，方便立即确认结果。
- 修改配置前创建带时间戳的备份，并通过锁避免并发写入；写入失败不得覆盖原配置。
- 保留现有 `chatgpt`、`model_proxy`、`step-sys` 入口及其兼容别名。
- 可执行命令放在公共用户命令目录 `~/.local/bin/codex-provider`，不再把脚本实体放在 `~/.codex/scripts`。
- `.zshrc`、快捷命令和 Codex 执行规则统一引用公共命令路径。

## Acceptance Criteria

- [ ] `status` 能在当前配置上输出上述字段和脱敏的鉴权可用性。
- [ ] `help` 与切换命令输出中文、准确说明行为。
- [ ] 切换命令创建备份、成功写入后输出状态，未知 provider 返回非零退出码。
- [ ] 配置文件经过 `tomllib` 解析，Shell 脚本通过 `bash -n`。
- [ ] 真实运行 `codex-provider status`、切换到当前 provider 再切回，并确认 Codex smoke request 仍成功。
- [ ] PATH 直接发现 `~/.local/bin/codex-provider`，旧 `.codex/scripts` 实体不存在，且没有活动配置入口继续引用旧路径。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
