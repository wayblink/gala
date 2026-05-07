#!/bin/bash
# MVP 快速测试脚本

set -e

echo "🚀 Gala MVP 测试脚本"
echo "===================="
echo ""

# 1. 检查依赖
echo "📦 检查依赖..."
if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安装"
    exit 1
fi

if ! command -v cargo &> /dev/null; then
    echo "❌ cargo 未安装"
    exit 1
fi

echo "✅ 依赖检查通过"
echo ""

# 2. 运行前端测试
echo "🧪 运行前端测试..."
npm run test
echo "✅ 前端测试通过"
echo ""

# 3. 运行后端测试
echo "🧪 运行后端测试..."
cd src-tauri
cargo test --quiet
cd ..
echo "✅ 后端测试通过"
echo ""

# 4. 检查应用数据目录
echo "📁 检查应用数据目录..."
APP_DATA_DIR="$HOME/Library/Application Support/gala"
if [ -d "$APP_DATA_DIR" ]; then
    echo "✅ 应用数据目录存在: $APP_DATA_DIR"

    if [ -f "$APP_DATA_DIR/index.sqlite" ]; then
        PHOTO_COUNT=$(sqlite3 "$APP_DATA_DIR/index.sqlite" "SELECT COUNT(*) FROM photos;" 2>/dev/null || echo "0")
        echo "📸 数据库中的照片数量: $PHOTO_COUNT"
    else
        echo "⚠️  数据库文件不存在（首次运行正常）"
    fi

    if [ -d "$APP_DATA_DIR/thumbnails" ]; then
        THUMB_COUNT=$(find "$APP_DATA_DIR/thumbnails" -name "*.jpg" 2>/dev/null | wc -l | tr -d ' ')
        echo "🖼️  缩略图数量: $THUMB_COUNT"
    else
        echo "⚠️  缩略图目录不存在（首次运行正常）"
    fi
else
    echo "⚠️  应用数据目录不存在（首次运行正常）"
fi
echo ""

# 5. 总结
echo "✅ MVP 测试完成！"
echo ""
echo "📝 下一步："
echo "1. 运行 'npm run desktop:dev' 启动应用"
echo "2. 点击 'Add Folder' 添加照片文件夹"
echo "3. 等待扫描完成"
echo "4. 浏览照片网格"
echo ""
echo "📖 详细信息请查看 MVP-STATUS.md"
