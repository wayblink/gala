# Product Design: Non-Destructive Photo View Engine

> 产品设计文档。回答产品是为谁做的、解决什么问题、核心模块与流程是什么。
> 架构参见 [technical-architecture.md](technical-architecture.md)；界面与交互见 [desktop-ui-design.md](desktop-ui-design.md)；数据与运行逻辑见 [data-and-control-design.md](data-and-control-design.md)。

## Summary

Gala 帮助摄影爱好者以可回溯、可解释、非破坏性优先的方式浏览、重访和整理本地照片库。

它不要求用户先修改原始文件夹结构，而是在原始照片之上建立索引、生成视图，并提供新的管理方式。后续即使引入移动、重命名、归档、删除等整理操作，也应优先通过索引、链接、归档和标记删除等机制实现更灵活、可回溯的管理体验，而不是让底层存储直接变成唯一真相。

产品应当更像一张“记忆 light table”，而不是一个文件管理器或数据库前端。

---

## Target Users

核心用户是拥有大量本地照片的摄影爱好者，他们的照片可能来自：

- 手机。
- 相机。
- 无人机。
- 外置硬盘。
- 多年来积累的旧文件夹。

他们需要：

- 更好的重访方式。
- 跨多年照片的快速浏览能力。
- 基于时间、地点、人物、器材、相似性和记忆的视图。
- 更高效的照片整理方式，减少筛选耗时。
- 处理“一张照片多个副本 / 多个版本”问题的能力。
- 在“不舍得删”和“必须做筛选”之间找到更灵活的中间路径。
- 对“原片不会被改动”的信任感。

他们通常不需要：

- 专业 RAW 编辑流程。
- 多人协作工作室流程。
- 云优先同步。
- 重型企业 DAM 系统。

---

## Product Positioning

Gala 是一个建立在本地照片之上的 view engine。

它不是：

- Lightroom 替代品。
- 云相册。
- Finder 或 Explorer 皮肤。
- 依赖直接改写底层文件结构的整理器。

它是：

- Local-first photo browser。
- Reversible photo management engine。
- Strategy-driven view generator。
- Personal photo rediscovery surface。

---

## Design Principles

### 1. Reversible and Non-Destructive by Default

Gala 默认不依赖直接改写底层文件来完成整理。

这并不意味着系统永远不能提供移动、重命名、归档或删除操作，而是意味着这些能力应优先建立在索引、链接、逻辑归档、标记删除和可回溯操作历史之上，让用户获得更灵活的管理体验。

允许：

- 读取图片文件。
- 在应用缓存中生成缩略图和预览。
- 在本地索引中存储引用和元数据。
- 将视图保存为照片引用集合。
- 建立照片之间的逻辑关系。
- 通过索引和产品状态实现归档、隐藏、筛选和标记删除。
- 提供移动、重命名、删除等整理操作的产品入口和接口，但要求这些操作具备可解释性、可追踪性和可回溯性。

默认不应把以下方式作为核心整理模型：

- 让“是否改写原始文件”成为唯一整理手段。
- 把低层文件操作直接等同于产品级整理语义。
- 让用户只能通过物理删除来完成筛选。
- 在没有清晰历史记录和恢复路径的情况下做不可逆操作。

### 2. Views Over Folders

文件夹是 source，不是产品主隐喻。

用户可以从磁盘添加文件夹，但产品主体验应围绕视图展开，例如：

- Timeline
- Places
- People
- Memories
- Similar
- Custom Views

### 3. Every Automatic View Must Explain Itself

每个自动生成的视图都必须解释“为什么我会看到这些照片”。

这条原则直接决定用户对 AI 和规则系统的信任边界。

### 4. AI Suggests, Users Stay in Control

AI 可以生成标签、记忆、分组、解释和视图建议，但 AI 不能默默替用户做破坏性决定。

### 5. The Photo Surface Is the Product

产品体验应优先让用户看照片，而不是看数据库控制面板。

---

## Core Product Model

```text
Photo Source
  -> Photo Index
    -> View Strategy
      -> View Instance
        -> Photo Surface
```

### Photo Source

包含原始图片文件的位置。

例如：

- 本地文件夹。
- 外置硬盘。
- 网络卷。
- 手机导出的目录。

### Photo Index

本地结构化索引，保存照片引用与派生元数据。

除了单张文件引用之外，Photo Index 还应逐步承载更高层的照片关系，例如同一逻辑照片下的 RAW、JPG 和编辑版本关联。

### Logical Photo Set

一个逻辑照片集合，用于把同一次拍摄产生的多个文件版本组织成一个更高层的产品对象。

典型情况包括：

- 同一张照片同时存在 RAW 和 JPG。
- 同一张照片存在导出版本或编辑后版本。
- 同一张照片因为历史迁移产生多个副本。

这个概念的目标不是掩盖文件差异，而是让产品在浏览、筛选和管理时，先以“同一张照片”作为基本语义单位，而不是把所有文件版本平铺成彼此独立的照片。

### View Strategy

基于规则、查询或模型，从索引中生成视图的过程。

### View Instance

某个策略在某次生成后得到的具体结果。

### Photo Surface

用户浏览照片和视图的主界面。

在更完整的版本中，Photo Surface 不仅展示单个文件，还应支持展示“逻辑照片”和“版本集合”的关系。

---

## V0 Information Architecture

```text
App
├── Library
│   ├── All Photos
│   ├── Recently Added
│   ├── Favorites
│   └── Hidden
│
├── Views
│   ├── Timeline
│   ├── Places
│   ├── People
│   ├── Memories
│   ├── Similar
│   └── Custom Views
│
├── Sources
│   ├── Local Folders
│   ├── External Drives
│   └── Offline Sources
│
├── Explore
│   ├── Same Day in Past Years
│   ├── Forgotten Photos
│   ├── Similar Light
│   └── Trips
│
└── Settings
    ├── Sources
    ├── Indexing
    ├── AI Strategies
    └── Privacy
```

---

## Core Product Modules

### Library

提供基础照片集合浏览，例如全部照片、最近导入、收藏和隐藏内容。

### Views

承载 Timeline、Places、People、Memories、Similar 和 Custom Views 等产品主体验。

### Sources

展示当前接入的照片来源，并向用户透明显示来源状态。

### Explore

提供用于重访和发现的探索入口，例如同一天、被遗忘的照片、相似光线和旅行集合。

### Settings

承载来源管理、索引策略、AI 能力开关和隐私设置。

---

## V0 View Types

### Timeline

按拍摄时间组织照片，是产品的基础视图。

### Places

按 GPS 和地点聚类组织照片。

### People

作为人物组织入口存在。V0 可以保留信息架构和数据位，但不要求立即具备自动人脸识别。

### Memories

生成类似“回忆”的视图，基于时间、地点、收藏、标签和其他轻量信号。

### Similar

组织视觉或上下文相似的照片。V0 可从轻量信号起步，后续再扩展到更强的相似能力。

### Custom Views

允许用户保存手动集合、保存过滤器或保存自动生成的视图。

---

## V1 Photo Management Capabilities

在 V1 中，Gala 应开始从“浏览与发现”进一步进入“高效整理与版本管理”。

### 1. 同一张照片的多版本关联

系统应允许并尽可能自动识别同一逻辑照片下的多个版本，例如：

- RAW 格式。
- JPG 格式。
- 编辑后的导出版本。
- 因历史迁移产生的重复副本。

这些文件在底层仍然是独立文件，但在产品层应被组织成有关联的一组内容。

### 2. RAW 与 JPG 自动关联

对于常见的同拍 RAW + JPG 组合，系统应尝试自动建立关联关系。

这类能力的产品价值是：

- 降低浏览时的重复感。
- 避免同一照片在主视图里被当成两张不相关内容反复出现。
- 为后续同步管理提供基础。

### 3. 去重展示

在存在多个版本或多个副本时，产品应支持“去重展示”。

去重展示的目标不是删除文件，而是：

- 在浏览时优先展示一个逻辑代表项。
- 在需要时展开查看全部关联版本。
- 让筛选和挑片以逻辑照片为单位，而不是以文件为单位。

### 4. 同步编辑管理

当多个版本已经建立逻辑关联后，系统应支持面向整组进行管理，例如：

- 统一标记收藏、归档或隐藏。
- 统一进入筛选流程。
- 在单个版本与整组操作之间切换。

这类能力的重点不是“文件同步写回”，而是“逻辑管理同步”，即用户对一组相关照片的管理动作可以拥有更高层的一致性。

### 5. 解决的核心痛点

这组 V1 能力要解决的不是技术炫技，而是非常具体的照片管理痛点：

- 照片整理耗时长。
- 同一张照片存在多个副本或多个版本。
- 用户不舍得删，但又必须筛选。
- 用户希望保留历史和回退空间，同时提高整理效率。

---

## Core Product Flows

### Add First Source

用户第一次打开产品时，应立即理解非破坏性承诺，并在添加 source 后尽快进入 Timeline 浏览。

### Browse Timeline

用户应能够沿时间结构快速浏览大量照片，并随时进入 focus viewer 查看单张细节。

### Save a Generated View

用户应能够查看自动生成视图的解释，并把有价值的结果保存为长期可访问的视图。

### Handle Offline Drive

当外部硬盘离线时，产品必须明确告知“source offline”和“file missing”的区别，这是用户信任的一部分。

---

## Product Success Criteria

V0 成功的标准是用户能够：

- 添加一个本地照片来源。
- 在不改变文件位置的前提下看到时间视图。
- 打开一张照片并理解其上下文。
- 保存一个生成视图。
- 理解自动视图为什么存在。
- 在 source 离线时仍然明白发生了什么。

如果产品最终只是一个“缩略图更好看的文件网格”，那就不算成功。

从 V1 往后，产品的进一步成功标准还包括：

- 用户能够把同一逻辑照片的 RAW、JPG 和编辑版本看作一组内容进行管理。
- 用户能够在不直接依赖底层物理删除的前提下完成更有效的筛选。
- 用户能够在“保留全部文件”和“高效整理照片”之间获得新的中间路径。

---

## Target User Priority

目标用户群体存在优先级，决定产品决策中的取舍方向：

1. **重度爱好者（首要）**：自己挑相机、关心 RAW、对色彩管理和元数据敏感、有跨年累积的几万到几十万张照片，对"工具懂自己"有强烈需求。
2. **业余爱好者（次要）**：拍得多、整理少，有"想找回某次旅行的某张照片"的痛点，但不愿意学 Lightroom。
3. **小白用户（兼容）**：只要默认行为安全（不动原片）、Timeline 能跑通，就算合格。
4. **专业摄影师（暂不优先）**：依赖 Capture One / Lightroom / 工作流插件，Gala 在 V0/V1 不与其正面竞争。

设计冲突时，先服务重度爱好者，再让小白也不被吓到。

---

## AI Posture

摄影师群体既传统又新锐，对"AI 味重"的产品本能戒备。Gala 的策略是：

- V1 之前不暴露鲜明 AI 特征，把"懂摄影"作为产品语言（EXIF 排版、镜头/焦段视角、连拍/RAW+JPG 的语义识别）。
- V2 引入 AI 能力时，仍以"摄影师工作流的解释"作为表达方式，而不是"AI 帮你做了什么"。
- 任何 AI 结果都必须可解释、可追溯、可拒绝。

---

## Sustainability

Gala 当前是个人 MVP 项目，不预设盈利模式。但为了避免后续架构被钱反向推着改，先固定几条原则：

承诺**不会**做的事：

- 不卖广告。
- 不出售用户数据，包括元数据、缩略图、行为埋点。
- 不把已有功能往付费版后撤。
- 不在免费版强制注册账号。

未来可能探索的方向（未承诺）：

- 捐赠 / Pay-what-you-want。
- 一次性买断 + 大版本付费升级。
- Pro Pack 增值服务，例如云 AI provider、跨设备同步、批量整理工具。
- 面向工作室的 B2B 模块。

这一节会随着产品演进继续修订。

---

## Reference Products

以下产品在某些维度上值得借鉴或对照，列在这里作为后续设计的参考点。

- **Apple Photos（macOS / iOS）**：人脸聚类、Memories、回忆视图、本地优先 + iCloud 同步的混合策略。值得借鉴它"Memories 自动生成 + 用户可保留可丢弃"的产品节奏。
- **Mylio Photos**：本地优先、跨设备非云同步、明确的 Source 概念、外置硬盘离线支持。是与 Gala 定位最接近的对照组，订阅制（约 $99/yr）。
- **digiKam**：开源、跨平台、强元数据管理、面向重度爱好者，证明非破坏性 + 关系数据库这条路在桌面端可行。一次性免费但 UX 偏 expert-only。
- **Adobe Bridge**：以"浏览器"自定位，强调元数据、批处理和文件级管理，对应 Gala "view engine 而非 Lightroom 替代品"的边界。
- **Lightroom Classic（Library 模块）**：智能预览、Catalog、Collection vs Folder 分离的概念，是 V1 多版本管理可对照的成熟模型。
- **Photo Mechanic**：摄影师挑片速度的天花板。Gala 在 V1 做"高效整理"时应以它的浏览/标记速度为基准。

具体借鉴策略与差异化点，将在后续 design review 中逐项展开。