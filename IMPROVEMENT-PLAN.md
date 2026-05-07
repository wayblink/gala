# MVP 改进计划

## 🎯 目标
将当前的基础 MVP 升级为可用的照片浏览应用

---

## 📋 Phase 2: 核心查看功能（1-2 天）

### 1. 全屏照片查看器 ⭐⭐⭐
**优先级**: P0（必须）  
**工作量**: 4-6 小时

**功能需求**:
- 点击照片打开全屏查看
- 显示高分辨率原图
- 左右箭头键导航
- ESC 键关闭
- 显示文件名和基本信息

**技术实现**:
```typescript
// 新组件: PhotoViewer.tsx
- 全屏 modal 覆盖层
- 图片预加载（当前 + 前后各一张）
- 键盘事件监听
- 触摸手势支持（移动端）
```

**验收标准**:
- ✅ 点击网格中的照片打开查看器
- ✅ 可以用键盘导航到下一张/上一张
- ✅ ESC 关闭查看器
- ✅ 显示原图而不是缩略图

---

### 2. EXIF 元数据解析 ⭐⭐⭐
**优先级**: P0（必须）  
**工作量**: 3-4 小时

**功能需求**:
- 解析照片 EXIF 数据
- 提取拍摄时间
- 提取相机型号
- 提取镜头信息
- 提取 GPS 位置（如果有）

**技术实现**:
```rust
// 使用 kamadak-exif crate
dependencies = [
    "kamadak-exif = \"0.5\""
]

// 新模块: src-tauri/src/library/exif.rs
- parse_exif(path: &Path) -> Result<ExifData>
- 存储到数据库 photos 表
```

**数据库变更**:
```sql
ALTER TABLE photos ADD COLUMN taken_at TEXT;
ALTER TABLE photos ADD COLUMN camera_make TEXT;
ALTER TABLE photos ADD COLUMN camera_model TEXT;
ALTER TABLE photos ADD COLUMN lens_model TEXT;
ALTER TABLE photos ADD COLUMN latitude REAL;
ALTER TABLE photos ADD COLUMN longitude REAL;
```

**验收标准**:
- ✅ 扫描时自动解析 EXIF
- ✅ 数据存储到数据库
- ✅ 查看器中显示元数据
- ✅ 处理没有 EXIF 的照片

---

### 3. 改进扫描反馈 ⭐⭐
**优先级**: P1（重要）  
**工作量**: 2-3 小时

**功能需求**:
- 显示扫描进度条
- 显示当前扫描的文件
- 显示已扫描/总数
- 显示缩略图生成进度
- 可以取消扫描

**技术实现**:
```typescript
// 修改: TopBar.tsx
- 添加进度条组件
- 显示扫描状态文本
- 添加取消按钮

// 修改: Rust commands
- 使用 Tauri 事件系统发送进度
- emit("scan-progress", { current, total, file })
```

**验收标准**:
- ✅ 扫描时显示进度条
- ✅ 显示当前处理的文件名
- ✅ 显示百分比
- ✅ 可以取消扫描

---

## 📋 Phase 3: 时间线和组织（2-3 天）

### 4. 时间线视图 ⭐⭐⭐
**优先级**: P1（重要）  
**工作量**: 6-8 小时

**功能需求**:
- 按日期分组显示照片
- 显示日期标题（如 "2024年10月15日"）
- 按时间倒序排列
- 支持跳转到特定日期

**技术实现**:
```typescript
// 新组件: TimelineView.tsx
- 日期分组逻辑
- 虚拟滚动优化
- 日期标题 sticky 定位

// 修改: Rust queries
- GROUP BY date(taken_at)
- ORDER BY taken_at DESC
```

**验收标准**:
- ✅ 照片按日期分组
- ✅ 显示日期标题
- ✅ 滚动性能良好
- ✅ 没有 EXIF 的照片按文件修改时间分组

---

### 5. 搜索功能 ⭐⭐
**优先级**: P1（重要）  
**工作量**: 4-5 小时

**功能需求**:
- 按文件名搜索
- 按日期范围搜索
- 按相机型号搜索
- 实时搜索结果

**技术实现**:
```typescript
// 新组件: SearchBar.tsx
- 搜索输入框
- 过滤器选项
- 搜索结果计数

// 修改: Rust queries
- WHERE file_name LIKE ?
- WHERE taken_at BETWEEN ? AND ?
- WHERE camera_model = ?
```

**验收标准**:
- ✅ 可以按文件名搜索
- ✅ 可以按日期范围过滤
- ✅ 搜索结果实时更新
- ✅ 显示搜索结果数量

---

### 6. 键盘导航 ⭐⭐
**优先级**: P1（重要）  
**工作量**: 2-3 小时

**功能需求**:
- 方向键在网格中移动
- Enter 打开照片查看器
- Space 选中/取消选中
- Cmd+A 全选

**技术实现**:
```typescript
// 新 hook: useKeyboardNavigation.ts
- 监听键盘事件
- 管理焦点状态
- 处理选择状态

// 修改: PhotoCard.tsx
- 添加 focus 状态样式
- 支持键盘选中
```

**验收标准**:
- ✅ 方向键可以移动焦点
- ✅ Enter 打开查看器
- ✅ Space 选中照片
- ✅ 快捷键提示

---

## 📋 Phase 4: 性能优化（1-2 天）

### 7. 虚拟滚动 ⭐⭐
**优先级**: P2（可选）  
**工作量**: 4-6 小时

**功能需求**:
- 只渲染可见区域的照片
- 支持 10000+ 照片流畅滚动
- 保持滚动位置

**技术实现**:
```typescript
// 使用 react-window 或 react-virtuoso
import { FixedSizeGrid } from 'react-window';

// 修改: PhotoSurface.tsx
- 计算可见行数
- 动态渲染照片
- 缓存已加载的照片
```

**验收标准**:
- ✅ 10000 张照片流畅滚动
- ✅ 内存占用稳定
- ✅ 滚动位置保持

---

### 8. 异步缩略图生成 ⭐⭐
**优先级**: P2（可选）  
**工作量**: 3-4 小时

**功能需求**:
- 扫描和缩略图生成分离
- 后台队列处理缩略图
- 优先生成可见照片的缩略图

**技术实现**:
```rust
// 新模块: src-tauri/src/library/thumbnail_queue.rs
- 使用 tokio 异步任务
- 优先级队列
- 并发控制（最多 4 个并发任务）

// 修改: scan_photo_source
- 先完成扫描
- 将缩略图任务加入队列
- 发送进度事件
```

**验收标准**:
- ✅ 扫描不阻塞 UI
- ✅ 缩略图后台生成
- ✅ 可见照片优先生成
- ✅ 显示生成进度

---

## 📋 Phase 5: 高级功能（3-5 天）

### 9. 标签系统 ⭐
**优先级**: P2（可选）  
**工作量**: 6-8 小时

**功能需求**:
- 手动添加标签
- 按标签过滤
- 标签自动补全
- 批量添加标签

**技术实现**:
```sql
CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT
);

CREATE TABLE photo_tags (
    photo_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (photo_id, tag_id)
);
```

**验收标准**:
- ✅ 可以添加标签
- ✅ 可以按标签过滤
- ✅ 标签有颜色
- ✅ 支持批量操作

---

### 10. 智能分组 ⭐
**优先级**: P3（未来）  
**工作量**: 10-15 小时

**功能需求**:
- AI 识别场景（风景、人物、食物等）
- 自动生成相册
- 相似照片检测
- 重复照片检测

**技术实现**:
```rust
// 使用 ort (ONNX Runtime)
// 集成 MobileNet 或 ResNet 模型
// 生成图像特征向量
// 使用余弦相似度比较
```

**验收标准**:
- ✅ 自动识别场景类型
- ✅ 生成智能相册
- ✅ 找到相似照片
- ✅ 标记重复照片

---

## 🎯 推荐实施顺序

### 第一周（MVP → 可用版本）
1. **Day 1-2**: 全屏照片查看器 + EXIF 解析
2. **Day 3**: 改进扫描反馈
3. **Day 4-5**: 时间线视图

### 第二周（可用 → 好用）
4. **Day 1-2**: 搜索功能
5. **Day 3**: 键盘导航
6. **Day 4-5**: 性能优化（虚拟滚动 + 异步缩略图）

### 第三周（好用 → 强大）
7. **Day 1-2**: 标签系统
8. **Day 3-5**: 智能分组（可选）

---

## 📊 工作量估算

| Phase | 功能 | 工作量 | 优先级 |
|-------|------|--------|--------|
| Phase 2 | 核心查看 | 9-13h | P0 |
| Phase 3 | 时间线组织 | 12-16h | P1 |
| Phase 4 | 性能优化 | 7-10h | P2 |
| Phase 5 | 高级功能 | 16-23h | P2-P3 |
| **总计** | | **44-62h** | |

---

## 🚀 快速启动

### 立即开始 Phase 2
```bash
# 1. 创建新分支
git checkout -b feature/photo-viewer

# 2. 添加 EXIF 依赖
cd src-tauri
cargo add kamadak-exif

# 3. 开始开发
npm run desktop:dev
```

### 开发顺序
1. 先做 EXIF 解析（后端）
2. 再做照片查看器（前端）
3. 最后改进扫描反馈（前后端）

---

## 📝 注意事项

### 技术债务
- 在 Phase 4 之前，性能可能是瓶颈
- 建议先完成 Phase 2-3，再考虑优化
- 虚拟滚动可以等到有性能问题时再做

### 用户体验
- Phase 2 完成后就可以日常使用了
- Phase 3 让应用更好用
- Phase 4-5 是锦上添花

### 测试
- 每个 Phase 完成后都要写测试
- 保持测试覆盖率 > 80%
- 手动测试关键用户流程

---

**准备好开始了吗？建议从 Phase 2 的全屏查看器开始！** 🚀
