# Fact / View / Action / Workflow 设计骨架

## 0. 核心一句话

一个数据工程 agent 化系统，本质上是：

**用 Fact 作为事实底座，用 View 组织可消费语境，用 Action 执行明确操作，用 Workflow 编排安全过程。**

---

## 1. 四个核心概念

### 1.1 Fact

Fact 是系统里的稳定事实。

特点：

- 可追溯
- 可版本化
- 不依赖 UI
- 尽量不可歧义
- 是其他所有层的基础

例子：

- 一条照片记录
- 一次相似度计算结果
- 一个用户确认的分组
- 一次收藏 / 隐藏 / 删除决定
- 一次扫描任务的输出

可以理解为：

**Fact = 系统认为“真实发生过”的事情。**

---

### 1.2 View

View 是对 Facts 的一种消费方式。

特点：

- 是组织方式，不是原始事实
- 可以动态计算，也可以缓存 / materialize
- 可以保存、恢复、分享
- 面向特定任务、角色或上下文

例子：

- Similar Review View
- Cleanup Queue View
- Best Shot View
- Search Results View
- Event View
- People View

可以理解为：

**View = 在某个任务语境下，Facts 被组织出来的“可看、可处理”的样子。**

---

### 1.3 Action

Action 是系统允许执行的明确操作。

特点：

- 有明确输入
- 有明确输出
- 有副作用
- 可审计
- 最好可撤销

例子：

- promote candidate group
- split logical group
- hide selected items
- favorite keeper
- create logical set
- dismiss candidate
- rerun scan
- apply batch decision

可以理解为：

**Action = 对 Facts 施加变化的最小操作单元。**

---

### 1.4 Workflow

Workflow 是 Action 的编排。

特点：

- 描述从一个状态到另一个状态的过程
- 负责顺序、条件、分支、确认、回滚
- 是 agent 和用户都能依赖的过程模型

例子：

- similarity review workflow
- duplicate cleanup workflow
- burst selection workflow
- onboarding workflow
- agent-assisted curation workflow

可以理解为：

**Workflow = 安全地把多个 Action 串起来的过程。**

---

## 2. 四者之间的关系

```text
Facts  ->  Views  ->  Actions  ->  Workflows
   ↑                     ↓
   └────── result & state changes ───────┘
```

更具体一点：

1. Fact 是底层事实。
2. View 读取 Fact 并组织成当前任务可消费的形式。
3. Action 在 View 上被选择和执行。
4. Workflow 负责把多个 Action 安全串联起来。
5. Workflow 的执行结果又会写回新的 Fact。

---

## 3. 系统原则

### 3.1 Facts are durable

事实是系统的稳定底座，不能随 UI 轻易变化。

### 3.2 Views are consumable

视图是面向任务的组织方式，可以动态生成、缓存、重建。

### 3.3 Actions are explicit

任何改变系统状态的行为都必须通过明确 Action 发生。

### 3.4 Workflows are safe orchestration

Workflow 负责过程安全，不允许 agent 直接跳过边界随意改底层。

### 3.5 AI suggests, human confirms when risky

AI 可以建议、排序、解释、预填动作，但高风险动作必须用户确认。

### 3.6 Every automatic result must be explainable

自动结果不能只是“看起来像”，必须能说明为什么。

### 3.7 Reversibility first

尤其在清理、分组、归档类场景里，优先保证可撤销。

---

## 4. 一个通用的层次结构

### 4.1 Ingestion / Observation Layer

负责采集输入和观察信号。

- 文件导入
- 用户操作
- 外部系统事件
- 扫描任务
- 模型结果

---

### 4.2 Fact Layer

负责保存稳定事实。

- 原始记录
- 结构化结果
- 用户确认
- 审计事件
- 工作流输出

---

### 4.3 View Layer

负责把 facts 组织成可理解对象。

- 任务视图
- 队列视图
- 聚合视图
- 折叠视图
- 智能推荐视图

---

### 4.4 Action Layer

负责定义允许的操作。

- 单步动作
- 批量动作
- 预览动作
- 提交动作
- 回滚动作

---

### 4.5 Workflow Layer

负责编排动作。

- 触发条件
- 步骤顺序
- 分支逻辑
- 人工确认
- 失败恢复
- 再进入机制

---

### 4.6 Agent Interface Layer

负责向 AI agent 暴露能力。

- 读 view
- 调 action
- 发起 workflow
- 请求解释
- 预览执行结果

---

## 5. 最小闭环

一个完整闭环通常是：

1. 观察到事实变化
2. 生成或更新 view
3. agent 或用户在 view 上做决策
4. 触发 action
5. action 被 workflow 编排执行
6. 写入新的 facts
7. view 重新 materialize

一句话概括：

**Fact drives View, View informs Action, Action updates Fact, Workflow keeps the process safe.**

---

## 6. 权限边界

### Agent 可以：

- 读取 view
- 排序、聚类、解释
- 建议 action
- 发起低风险 workflow
- 在确认后执行动作

### Agent 不应该：

- 直接改底层事实
- 绕过 workflow
- 把临时判断当永久事实
- 无解释地批量执行高风险动作

---

## 7. 在 Gala 里的映射

### Facts

- 照片文件
- EXIF
- 相似度结果
- 人脸 / 对象 / 场景信号
- 用户收藏 / 隐藏 / 删除
- logical group
- review decision

### Views

- Similar Review View
- Cleanup Queue View
- Burst Selection View
- People View
- Search View

### Actions

- promote candidate group
- create logical group
- hide others
- favorite keeper
- split group
- dismiss candidate

### Workflows

- similarity review workflow
- duplicate cleanup workflow
- burst review workflow
- agent-assisted curation workflow

---

## 8. 以“查重创建逻辑组”为例

“查重并创建逻辑组”不是一个孤立数据操作，而是一个 workflow 中的 action。

可以变成：

```text
Workflow: Similarity Review
  1. scan photos
  2. cluster candidates
  3. build review view
  4. rank groups
  5. user/agent chooses action
  6. promote to logical group
  7. update facts
  8. refresh views
```

这里的“创建逻辑组”只是第 6 步的一个 action。真正的产品对象是整个 **review workflow + view instance**。

---

## 9. 一个推荐的通用数据模型

```ts
type Fact = {
  id: string
  type: string
  payload: unknown
  source: string
  createdAt: string
}

type View = {
  id: string
  type: string
  sourceFacts: string[]
  filters?: unknown
  sort?: unknown
  state?: unknown
}

type Action = {
  id: string
  type: string
  input: unknown
  preconditions?: string[]
  reversible: boolean
}

type Workflow = {
  id: string
  type: string
  steps: Action[]
  trigger: string
  requiresConfirmation: boolean
}
```

---

## 10. 这套骨架的价值

### 对产品

- 不是做一个孤立 AI 功能，而是做一个可持续的操作系统式产品
- 可以逐步扩展到更多场景

### 对工程

- 事实、视图、动作、流程分层清楚
- 更容易测试、回滚、审计

### 对 AI / Agent

- agent 不直接碰底层
- agent 在 view 上思考，在 action 上行动
- 能力可控、边界清晰

### 对未来扩展

- 照片、文档、知识库、财务、运维、审查系统都能套这个模型

---

## 11. 一句更完整的总述

**一个由 Facts 提供真相、Views 提供语境、Actions 提供操作、Workflows 提供安全编排的 agent 化数据系统。**
