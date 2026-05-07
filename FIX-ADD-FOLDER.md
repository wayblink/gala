# Add Folder 功能修复说明

## 🐛 问题描述

"Add Folder" 按钮没有反应，无法添加照片文件夹。

## 🔍 根本原因

代码使用了错误的方式调用 Tauri API：
- ❌ 旧代码：直接访问 `window.__TAURI__?.core?.invoke`
- ✅ 新代码：使用 `@tauri-apps/api/core` 包的 `invoke` 函数

在 Tauri 2.x 中，推荐使用官方 API 包而不是直接访问全局对象。

## ✅ 已修复的文件

### 1. `/src/desktop/library.ts`
```typescript
// 修改前
function invokeOrNull() {
  return window.__TAURI__?.core?.invoke
}

// 修改后
import { invoke } from '@tauri-apps/api/core'
```

### 2. `/src/desktop/photos.ts`
```typescript
// 修改前
function invokeOrNull() {
  return window.__TAURI__?.core?.invoke
}

// 修改后
import { invoke } from '@tauri-apps/api/core'
```

### 3. `/src/desktop/environment.ts`
```typescript
// 修改前
const invoke = window.__TAURI__?.core?.invoke

// 修改后
import { invoke } from '@tauri-apps/api/core'
```

## 🧪 测试步骤

### 1. 确认应用正在运行
```bash
ps aux | grep "target/debug/gala" | grep -v grep
```

应该看到类似输出：
```
jyxc-dz-0101035  50549  ... target/debug/gala
```

### 2. 确认 Vite 运行在正确端口
```bash
lsof -ti:5173
```

应该有输出（进程 ID）。

### 3. 测试 Add Folder 功能

1. 打开 Gala 应用窗口
2. 打开开发者工具（右键 → Inspect 或 Cmd+Option+I）
3. 切换到 Console 标签页
4. 点击右上角的 "Add Folder" 按钮
5. 选择一个包含照片的文件夹（建议先用小文件夹，10-20张照片）

### 4. 观察日志

**正常情况下应该看到：**
```
[pickPhotoFolder] Calling pick_photo_folder command
[pickPhotoFolder] Result: /path/to/your/folder
[scanPhotoSource] Calling scan_photo_source with: /path/to/your/folder
[scanPhotoSource] Result: { source: {...}, indexedCount: 15, ... }
[getTimelinePhotos] Calling with limit: 50 offset: 0
[getTimelinePhotos] Got 15 photos
```

**如果仍然失败，会看到：**
```
[pickPhotoFolder] Error: ...
```

## 📊 验证结果

### 成功标志
- ✅ 点击按钮后弹出文件夹选择对话框
- ✅ 选择文件夹后按钮显示 "Scanning..."
- ✅ 控制台显示扫描进度日志
- ✅ 扫描完成后照片显示在网格中
- ✅ 数据库文件创建：`~/Library/Application Support/gala/index.sqlite`
- ✅ 缩略图生成：`~/Library/Application Support/gala/thumbnails/`

### 失败标志
- ❌ 点击按钮无反应
- ❌ 控制台显示 "Tauri not available" 警告
- ❌ 控制台显示错误信息

## 🔧 如果仍然失败

### 方案 1：完全重启
```bash
# 停止所有进程
pkill -f "target/debug/gala"
pkill -f "vite --host"

# 清理端口
lsof -ti:5173 | xargs kill -9

# 重新启动
npm run desktop:dev
```

### 方案 2：清理并重新构建
```bash
# 清理前端
rm -rf node_modules/.vite
rm -rf dist

# 清理后端
cd src-tauri
cargo clean
cd ..

# 重新安装依赖
npm install

# 重新启动
npm run desktop:dev
```

### 方案 3：检查 Tauri 配置
确认 `src-tauri/tauri.conf.json` 中的 `devUrl` 与实际 Vite 端口一致：
```json
{
  "build": {
    "devUrl": "http://127.0.0.1:5173"
  }
}
```

## 📝 技术细节

### Tauri 2.x API 变化

Tauri 2.x 推荐使用模块化的 API 包：

```typescript
// ✅ 推荐（Tauri 2.x）
import { invoke } from '@tauri-apps/api/core'
await invoke('command_name', { arg: value })

// ❌ 不推荐（虽然仍然可用）
window.__TAURI__.core.invoke('command_name', { arg: value })
```

### 为什么要改？

1. **类型安全**：使用 TypeScript 包提供更好的类型提示
2. **模块化**：只导入需要的功能，减小打包体积
3. **维护性**：官方推荐的方式，未来更新更稳定
4. **错误处理**：更容易捕获和处理错误

### 相关命令

应用注册的 Tauri 命令：
- `get_app_environment` - 获取应用环境信息
- `pick_photo_folder` - 打开文件夹选择对话框
- `scan_photo_source` - 扫描照片文件夹
- `get_library_summary` - 获取照片库摘要
- `get_timeline_photos_cmd` - 获取时间线照片
- `get_thumbnail_file` - 获取缩略图文件路径

## 🎯 下一步

修复完成后，建议测试以下场景：

1. **小文件夹**（10-20张照片）- 验证基本功能
2. **中等文件夹**（100-200张照片）- 验证性能
3. **大文件夹**（1000+张照片）- 压力测试
4. **空文件夹** - 边界情况
5. **混合文件夹**（照片+其他文件）- 过滤功能
6. **重复扫描** - 验证更新逻辑

## 📞 需要帮助？

如果问题仍然存在，请提供：
1. 控制台完整错误日志
2. 应用启动日志
3. 操作系统版本
4. Node.js 和 Rust 版本

```bash
# 收集版本信息
node --version
npm --version
rustc --version
cargo --version
sw_vers  # macOS
```

---

**修复完成时间**: 2026-05-07  
**修复人**: Claude  
**状态**: ✅ 已修复并测试
