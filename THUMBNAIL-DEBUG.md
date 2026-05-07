# 缩略图加载失败诊断

## 🐛 问题

照片网格显示 "Failed to load"，缩略图无法加载。

## 🔍 可能的原因

### 1. 缩略图路径问题
- 数据库中存储的是绝对路径
- 前端使用 `file://` 协议加载
- Tauri 可能不允许直接访问文件系统

### 2. 缩略图未生成
- 扫描过程中缩略图生成失败
- 数据库中 thumbnail_path 为 NULL

### 3. React 重复渲染
- PhotoSurface useEffect 依赖问题
- 照片被加载多次导致重复 key

## 🧪 诊断步骤

### 步骤 1: 添加测试文件夹
```bash
# 在应用中点击 "Add Folder"
# 选择: /Users/jyxc-dz-0101035/gala/test-photos
```

### 步骤 2: 查看 Rust 日志
```bash
tail -f /private/tmp/claude-501/-Users-jyxc-dz-0101035-gala/*/tasks/bvrf7r1ap.output | grep "scan_photo_source"
```

**预期输出**:
```
[scan_photo_source] Starting scan for: /Users/jyxc-dz-0101035/gala/test-photos
[scan_photo_source] Database path: "/Users/jyxc-dz-0101035/Library/Application Support/gala/index.sqlite"
[scan_photo_source] Source ID: xxx-xxx-xxx
[scan_photo_source] Discovered 25 photos
[scan_photo_source] Thumbnail cache: "/Users/jyxc-dz-0101035/Library/Application Support/gala/thumbnails"
[scan_photo_source] Generating thumbnails for: /Users/jyxc-dz-0101035/gala/test-photos/IMG_0001.jpg
[scan_photo_source] Generated thumbnails: small=..., medium=..., large=...
...
[scan_photo_source] Scan complete!
```

### 步骤 3: 检查数据库
```bash
sqlite3 ~/Library/Application\ Support/gala/index.sqlite << EOF
SELECT COUNT(*) as total FROM photos;
SELECT COUNT(*) as with_thumbnails FROM photo_assets WHERE thumbnail_medium_path IS NOT NULL;
SELECT id, file_name, thumbnail_medium_path FROM (
  SELECT p.id, p.file_name, pa.thumbnail_medium_path
  FROM photos p
  LEFT JOIN photo_assets pa ON p.id = pa.photo_id
  LIMIT 3
);
EOF
```

**预期输出**:
```
total
25

with_thumbnails
25

id|file_name|thumbnail_medium_path
xxx|IMG_0001.jpg|/Users/.../gala/thumbnails/medium/xxx.jpg
xxx|IMG_0002.jpg|/Users/.../gala/thumbnails/medium/xxx.jpg
xxx|IMG_0003.jpg|/Users/.../gala/thumbnails/medium/xxx.jpg
```

### 步骤 4: 检查缩略图文件
```bash
ls -lh ~/Library/Application\ Support/gala/thumbnails/medium/ | head -5
```

**预期输出**:
```
-rw-r--r--  1 user  staff   45K May  7 18:05 xxx.jpg
-rw-r--r--  1 user  staff   42K May  7 18:05 xxx.jpg
-rw-r--r--  1 user  staff   38K May  7 18:05 xxx.jpg
```

## 🔧 可能的修复方案

### 方案 1: 使用 Tauri Asset Protocol
Tauri 提供了 `asset://` 协议来访问本地文件。

**修改 PhotoCard.tsx**:
```typescript
// 当前
setThumbnailUrl(`file://${photo.thumbnailPath}`)

// 修改为
setThumbnailUrl(`asset://localhost/${photo.thumbnailPath}`)
```

### 方案 2: 使用 convertFileSrc
Tauri API 提供了 `convertFileSrc` 函数。

```typescript
import { convertFileSrc } from '@tauri-apps/api/core'

// 使用
const url = convertFileSrc(photo.thumbnailPath)
setThumbnailUrl(url)
```

### 方案 3: 注册自定义协议
在 Tauri 配置中注册 `thumbnail://` 协议。

**tauri.conf.json**:
```json
{
  "app": {
    "security": {
      "assetProtocol": {
        "enable": true,
        "scope": [
          "$APPDATA/thumbnails/**"
        ]
      }
    }
  }
}
```

### 方案 4: 使用 Tauri Command 返回图片数据
创建一个 Tauri command 读取图片并返回 base64。

```rust
#[tauri::command]
pub fn get_thumbnail_data(path: String) -> Result<String, String> {
    let data = std::fs::read(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(base64::encode(&data))
}
```

```typescript
const data = await invoke('get_thumbnail_data', { path: photo.thumbnailPath })
setThumbnailUrl(`data:image/jpeg;base64,${data}`)
```

## 📝 推荐方案

**使用 `convertFileSrc`** (方案 2)

优点：
- ✅ Tauri 官方推荐
- ✅ 自动处理平台差异
- ✅ 性能好（直接文件访问）
- ✅ 简单易用

缺点：
- ⚠️ 需要配置安全策略

## 🚀 立即修复

等待你添加文件夹后，我会根据日志输出确定具体问题并实施修复。

---

**创建时间**: 2026-05-07 18:05  
**状态**: 🔍 诊断中
