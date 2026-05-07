# 测试数据说明

## 📊 测试数据概览

已创建 4 个测试文件夹，共 **50 张照片**，总大小约 **21 MB**。

### 测试场景

| 文件夹 | 照片数 | 大小 | 用途 | 路径 |
|--------|--------|------|------|------|
| **test-photos** | 25 张 | ~8 MB | 基础测试 - 混合尺寸 | `/Users/jyxc-dz-0101035/gala/test-photos` |
| **test-photos-portrait** | 10 张 | ~2 MB | 竖向照片 - 模拟手机拍摄 | `/Users/jyxc-dz-0101035/gala/test-photos-portrait` |
| **test-photos-large** | 10 张 | ~10 MB | 大尺寸照片 - 模拟高分辨率相机 | `/Users/jyxc-dz-0101035/gala/test-photos-large` |
| **test-photos-mixed** | 5 张 | ~1 MB | 混合文件 - 测试过滤功能 | `/Users/jyxc-dz-0101035/gala/test-photos-mixed` |

---

## 🎯 测试场景说明

### 1. test-photos（基础测试）
**文件**: IMG_0001.jpg ~ IMG_0025.jpg  
**尺寸**: 2000-3500px（横向和纵向混合）  
**用途**: 
- ✅ 验证基本扫描功能
- ✅ 测试缩略图生成
- ✅ 测试网格布局
- ✅ 测试无限滚动

**推荐**: 首次测试使用这个文件夹

---

### 2. test-photos-portrait（竖向照片）
**文件**: PHOTO_0001.jpg ~ PHOTO_0010.jpg  
**尺寸**: 1080x1920px（竖向，9:16 比例）  
**用途**:
- ✅ 测试竖向照片显示
- ✅ 验证网格布局适配
- ✅ 模拟手机拍摄场景
- ✅ 测试不同宽高比

---

### 3. test-photos-large（大尺寸照片）
**文件**: DSC_0001.jpg ~ DSC_0010.jpg  
**尺寸**: 4000x3000px（12MP，类似单反相机）  
**用途**:
- ✅ 测试大文件处理
- ✅ 验证缩略图生成性能
- ✅ 测试内存占用
- ✅ 压力测试

**注意**: 这些照片较大，扫描和缩略图生成会慢一些

---

### 4. test-photos-mixed（混合文件）
**文件**: 
- 5 张照片: MIX_0001.jpg ~ MIX_0005.jpg
- 3 个非照片文件: readme.txt, notes.md, data.json

**用途**:
- ✅ 测试文件过滤功能
- ✅ 验证只扫描支持的格式
- ✅ 测试错误处理
- ✅ 模拟真实文件夹场景

**预期**: 应该只索引 5 张照片，忽略其他文件

---

## 🚀 快速测试指南

### 测试 1: 基础功能（5 分钟）
```bash
# 1. 启动应用
npm run desktop:dev

# 2. 在应用中点击 "Add Folder"
# 3. 选择: /Users/jyxc-dz-0101035/gala/test-photos
# 4. 等待扫描完成（约 5-10 秒）
# 5. 验证 25 张照片显示在网格中
```

**验证点**:
- ✅ 扫描进度显示
- ✅ 照片网格显示
- ✅ 缩略图清晰
- ✅ 滚动流畅

---

### 测试 2: 竖向照片（3 分钟）
```bash
# 选择: /Users/jyxc-dz-0101035/gala/test-photos-portrait
```

**验证点**:
- ✅ 竖向照片正确显示
- ✅ 网格布局适配
- ✅ 宽高比保持

---

### 测试 3: 大文件性能（5 分钟）
```bash
# 选择: /Users/jyxc-dz-0101035/gala/test-photos-large
```

**验证点**:
- ✅ 大文件扫描成功
- ✅ 缩略图生成正常
- ✅ 内存占用合理
- ✅ UI 不卡顿

---

### 测试 4: 文件过滤（3 分钟）
```bash
# 选择: /Users/jyxc-dz-0101035/gala/test-photos-mixed
```

**验证点**:
- ✅ 只索引 5 张照片
- ✅ 忽略 .txt, .md, .json 文件
- ✅ 没有错误提示

---

### 测试 5: 多文件夹（5 分钟）
```bash
# 依次添加所有 4 个文件夹
```

**验证点**:
- ✅ 支持多个源
- ✅ 照片总数正确（50 张）
- ✅ 可以区分不同源
- ✅ 重复扫描不会重复添加

---

## 📊 预期结果

### 扫描性能
| 文件夹 | 照片数 | 预计扫描时间 | 预计缩略图生成时间 |
|--------|--------|--------------|-------------------|
| test-photos | 25 | ~0.3s | ~0.5s |
| test-photos-portrait | 10 | ~0.1s | ~0.2s |
| test-photos-large | 10 | ~0.1s | ~0.5s |
| test-photos-mixed | 5 | ~0.1s | ~0.1s |

### 数据库大小
- 索引数据: ~50 KB
- 缩略图缓存: ~5-10 MB

### 内存占用
- 空闲: ~50 MB
- 扫描中: ~100-150 MB
- 浏览照片: ~80-120 MB

---

## 🔍 验证数据

### 检查数据库
```bash
sqlite3 ~/Library/Application\ Support/gala/index.sqlite << EOF
SELECT COUNT(*) as total_photos FROM photos;
SELECT source_id, COUNT(*) as count FROM photos GROUP BY source_id;
SELECT file_name FROM photos LIMIT 5;
EOF
```

### 检查缩略图
```bash
# 统计缩略图数量
find ~/Library/Application\ Support/gala/thumbnails -name "*.jpg" | wc -l

# 查看缩略图大小
du -sh ~/Library/Application\ Support/gala/thumbnails/*
```

### 检查日志
```bash
# 查看扫描日志
# 在浏览器开发者工具的 Console 中查看
```

---

## 🧹 清理测试数据

### 清理照片文件
```bash
cd /Users/jyxc-dz-0101035/gala
rm -rf test-photos test-photos-portrait test-photos-large test-photos-mixed
```

### 清理应用数据
```bash
rm -rf ~/Library/Application\ Support/gala/
```

### 重新开始
```bash
# 重新下载测试照片
./download-test-photos.sh

# 或手动下载
bash download-test-photos.sh
```

---

## 📝 测试检查清单

### 基础功能
- [ ] 点击 "Add Folder" 弹出文件夹选择对话框
- [ ] 选择文件夹后开始扫描
- [ ] 扫描进度显示（按钮显示 "Scanning..."）
- [ ] 照片显示在网格中
- [ ] 缩略图清晰可见
- [ ] 滚动加载更多照片

### 性能
- [ ] 扫描速度合理（25 张照片 < 1 秒）
- [ ] 缩略图生成速度合理（< 2 秒）
- [ ] UI 响应流畅，不卡顿
- [ ] 内存占用合理（< 200 MB）

### 边界情况
- [ ] 空文件夹处理正常
- [ ] 混合文件夹只索引照片
- [ ] 重复扫描不会重复添加
- [ ] 大文件处理正常

### 数据持久化
- [ ] 关闭应用后重新打开，照片仍然存在
- [ ] 数据库文件创建成功
- [ ] 缩略图缓存创建成功

---

## 🐛 常见问题

### Q: 照片下载失败？
**A**: 检查网络连接，或重新运行下载脚本：
```bash
./download-test-photos.sh
```

### Q: 扫描后没有照片显示？
**A**: 
1. 检查控制台日志
2. 确认文件夹路径正确
3. 验证照片文件存在
4. 检查数据库是否创建

### Q: 缩略图不显示？
**A**:
1. 检查缩略图目录是否创建
2. 查看控制台错误信息
3. 验证照片文件可读

### Q: 性能很慢？
**A**:
1. 先用小文件夹测试（test-photos）
2. 检查系统资源占用
3. 查看是否有错误日志

---

## 📞 需要更多测试数据？

### 下载更多照片
```bash
# 修改脚本中的 PHOTO_COUNT
# 然后重新运行
./download-test-photos.sh
```

### 使用自己的照片
```bash
# 复制你的照片到测试文件夹
cp ~/Pictures/my-photos/*.jpg test-photos/
```

### 创建大型测试集
```bash
# 下载 100 张照片
for i in {1..100}; do
    curl -s -L -o "test-photos/IMG_$(printf "%04d" $i).jpg" \
        "https://picsum.photos/id/$((RANDOM % 1000))/2400/1800"
    sleep 0.2
done
```

---

## ✅ 测试完成后

1. **提供反馈**: 哪些功能工作正常？哪些需要改进？
2. **报告问题**: 如果发现 bug，提供详细的复现步骤
3. **建议功能**: 你最想要的下一个功能是什么？

---

**测试数据来源**: [Picsum Photos](https://picsum.photos/) - 免费的占位图片服务  
**创建时间**: 2026-05-07  
**总照片数**: 50 张  
**总大小**: ~21 MB
