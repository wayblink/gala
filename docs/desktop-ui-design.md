# Desktop UI Design: Memory Table

> 桌面界面与交互设计。承接 [product-design.md](product-design.md) 的产品目标，不讨论数据结构和运行时逻辑（见 [data-and-control-design.md](data-and-control-design.md)）。

## Experience Goal

Gala 的桌面界面应像一张安静、可信、可长期使用的 memory light table。

用户打开应用后，最先感受到的应该是：

- 照片本身是主角。
- 原片是安全的。
- 自动视图是可以解释和验证的。
- 系统比文件夹更懂如何组织浏览体验。

---

## Main Desktop Layout

```text
┌────────────────────────────────────────────────────────────┐
│ Top Bar: current view / search / import / filters / density │
├───────────────┬──────────────────────────────┬─────────────┤
│ Left Rail     │ Photo Surface                │ Context     │
│               │                              │ Panel       │
│ Library       │ Timeline / Grid / Focus      │ EXIF        │
│ Views         │ Contact Sheet / Saved Views  │ View Reason │
│ Sources       │                              │ Actions     │
│ Explore       │                              │             │
└───────────────┴──────────────────────────────┴─────────────┘
```

布局原则：

- 左侧是视图导航，不是文件树。
- 中间是照片表面，是产品主舞台。
- 右侧是上下文解释，不是次级杂项面板。

---

## Primary Screen: Timeline Light Table

首次真正可用的主界面应是 Timeline Light Table，而不是设置页或文件浏览器。

这个界面需要做到：

1. 照片是最大视觉质量。
2. 当前视图标题始终明确。
3. Source 状态可见，但不喧宾夺主。
4. 右侧面板解释当前照片或当前视图。
5. 文件夹只出现在 Sources 下，不成为主导航隐喻。

---

## Key Screens

### First-Run Source Flow

首次导入流程必须把非破坏性承诺讲清楚。

文案应像承诺，而不是权限免责声明。

### Focus Viewer

打开单张照片后，中心区域切换到 focus 模式，但左侧 rail 和右侧 context panel 保持稳定。

### Generated View Explanation

每个自动生成视图都需要有可快速浏览的 explanation block，明确说明：

- 这个视图是什么。
- 它为何生成。
- 置信度如何。
- 用户接下来可以做什么。

---

## Visual Direction

工作命名为 `Memory Table`。

整体视觉应像一个温暖、克制、偏暗房气质的工作台，而不是企业后台或云相册。

方向关键词：

- Warm dark surfaces
- Matte panels
- Paper-like text colors
- Amber memory highlights
- Quiet motion

---

## Visual System

### Design Thesis

一个温暖、安静、可信的本地照片工作台。

用户应记住的一句话是：

> My photos stayed where they were, but the app gave me new ways to see them.

### Color Tokens

```css
:root {
  --ink-950: #171615;
  --ink-900: #201f1d;
  --ink-850: #24221f;
  --ink-800: #2a2825;
  --ink-700: #38342f;
  --stone-600: #6f695f;
  --stone-500: #8e887e;
  --paper-200: #d8d0c2;
  --paper-100: #eee6d8;
  --amber-dust: #c9974d;
  --lake-blue: #527c8e;
  --archive-red: #9d4b3f;
  --success-moss: #788b5a;
}
```

颜色原则：

- Amber 是唯一默认主强调色。
- Blue 只用于信息，不做主操作色。
- Red 只用于危险或缺失状态。
- UI chrome 保持克制，颜色主要来自照片本身。

### Typography

- UI and navigation: Alegreya Sans
- View titles: Literata
- EXIF, paths, counts: IBM Plex Mono

文字原则：

- 主要正文不低于 16px。
- 日期、数量、EXIF 使用等宽数字。
- 标题可以带一点 editorial 气质，但控件文字必须简单直接。

### Spacing and Shape

- Base unit: 4px
- Standard rhythm: 8, 12, 16, 24, 32, 48
- Photo cells: 4px radius
- Controls: 8px radius
- Panels: 12px radius

原则：

- 照片单元不应做得过于圆润。
- 卡片不是装饰，只在持续性区域或被选择对象上使用。
- 相邻层级的圆角要有从属关系。

### Motion

运动应像在桌面上移动 contact sheet，而不是做炫技过渡。

- View switch: 180-240ms
- Photo open: 220-320ms
- Filmstrip navigation: 120-180ms

原则：

- 尊重 reduced motion。
- 优先动画 transform 和 opacity。
- 动效应解释空间变化，而不是制造噱头。

---

## Component Behavior

### Left Rail

Left rail 是视图地图。

它必须长期可见，并清晰组织以下分组：

- Library
- Views
- Sources
- Explore
- Settings

### Top Bar

Top bar 负责说明“我当前在哪里”。

它应包含：

- App name
- Current view title
- Photo count
- Search
- Add Source
- Density switch
- Filter entry

### Photo Grid

Photo grid 是扫描表面。

规则：

- 时间分组优先于视觉拼贴效率。
- 尽量保留原始纵横比。
- Hover 可增强操作，但选择能力不能只依赖 hover。

### Context Panel

Context panel 的核心问题是：

- 我在看什么？
- 为什么它会在这里？

对于视图，重点是 strategy、explanation、confidence 和 actions。

对于照片，重点是文件名、时间、source、路径、器材和相关视图。

---

## Empty, Loading, and Failure States

### Empty Library

空状态必须先讲清“照片不会被移动”，再让用户添加 source。

### Scanning

扫描状态应明确当前 source、扫描进度和“可以边扫边看”的信息。

### Offline Source

离线状态必须明确说明：缩略图和保存视图仍可见，但原始文件暂时不可访问。

### Missing Photo

缺失状态必须明确说明：source 在线，但该文件路径已不存在。

离线和缺失不能混成一类提示。

---

## Key Interaction Rules

### Add First Source

1. 空状态先解释 promise。
2. 用户选择 folder 或 drive。
3. 扫描在后台开始。
4. Timeline 尽快可见。

### Save Generated View

1. 用户打开 Memories 或 Similar。
2. 系统展示 explanation。
3. 用户保存视图。
4. 视图出现在 Custom Views 下。

### Source Goes Offline

1. 系统检测到 volume 不可用。
2. Source 变为 offline。
3. Timeline 仍保留缓存缩略图。
4. Focus viewer 明确显示原始文件不可用。

---

## Design Guardrails

### Safe Choices

- Desktop-first 三栏布局。
- Warm dark chrome。
- Mono metadata。

### Deliberate Risks

- 使用 Literata 让回忆类标题更具个人感。
- 用 amber 作为唯一主强调色，避免 SaaS 化蓝色默认风格。

### Hard Guardrails

- 不要把产品重新做成文件树。
- 不要让 AI 看起来比实际更确定。
- 不要把 source 状态藏进设置页。
- 不要用装饰性渐变、blob 或紫色主视觉。

---

## UI Success Criteria

桌面 UI 成功的标准是：

- 用户第一次使用时能立即明白原片是安全的。
- 大量照片浏览时，界面仍然以照片为主。
- 自动视图始终带有可信解释。
- 离线、缺失、扫描等状态都能被一眼理解。

如果 UI 最终只是一个更精致的缩略图文件夹浏览器，那么这套设计就失败了。