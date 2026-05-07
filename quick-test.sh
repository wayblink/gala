#!/bin/bash
echo "🧪 Gala 快速测试"
echo "================"
echo ""
echo "📊 测试数据:"
for dir in test-photos*; do
    if [ -d "$dir" ]; then
        COUNT=$(find "$dir" -name "*.jpg" 2>/dev/null | wc -l | tr -d ' ')
        SIZE=$(du -sh "$dir" | cut -f1)
        echo "  • $dir: $COUNT 张照片, $SIZE"
    fi
done
echo ""
echo "📁 测试路径:"
echo "  $(pwd)/test-photos"
echo ""
echo "🚀 在应用中点击 'Add Folder' 并选择上面的路径"
