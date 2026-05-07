#!/bin/bash
# 下载测试照片脚本

set -e

PHOTO_DIR="/Users/jyxc-dz-0101035/gala/test-photos"
PHOTO_COUNT=20

echo "📸 下载测试照片"
echo "================"
echo ""
echo "目标文件夹: $PHOTO_DIR"
echo "照片数量: $PHOTO_COUNT"
echo ""

# 创建文件夹
mkdir -p "$PHOTO_DIR"

# 使用 Picsum Photos API 下载随机照片
# https://picsum.photos/ - 免费的占位图片服务

echo "⬇️  开始下载..."
echo ""

for i in $(seq 1 $PHOTO_COUNT); do
    # 生成随机尺寸（模拟真实照片）
    WIDTH=$((2000 + RANDOM % 2000))  # 2000-4000px
    HEIGHT=$((1500 + RANDOM % 1500)) # 1500-3000px

    # 随机选择横向或纵向
    if [ $((RANDOM % 2)) -eq 0 ]; then
        TEMP=$WIDTH
        WIDTH=$HEIGHT
        HEIGHT=$TEMP
    fi

    # 文件名（模拟相机命名）
    FILENAME=$(printf "IMG_%04d.jpg" $i)
    FILEPATH="$PHOTO_DIR/$FILENAME"

    # 下载照片（使用随机 ID 确保不同的图片）
    PHOTO_ID=$((RANDOM % 1000))
    URL="https://picsum.photos/id/$PHOTO_ID/$WIDTH/$HEIGHT"

    echo "[$i/$PHOTO_COUNT] 下载 $FILENAME (${WIDTH}x${HEIGHT}px)..."

    if curl -s -L -o "$FILEPATH" "$URL"; then
        # 验证文件大小
        SIZE=$(stat -f%z "$FILEPATH" 2>/dev/null || stat -c%s "$FILEPATH" 2>/dev/null)
        if [ "$SIZE" -gt 10000 ]; then
            echo "  ✅ 成功 ($(numfmt --to=iec-i --suffix=B $SIZE 2>/dev/null || echo "${SIZE} bytes"))"
        else
            echo "  ⚠️  文件太小，重试..."
            rm -f "$FILEPATH"
            curl -s -L -o "$FILEPATH" "https://picsum.photos/$WIDTH/$HEIGHT"
        fi
    else
        echo "  ❌ 下载失败"
    fi

    # 避免请求过快
    sleep 0.5
done

echo ""
echo "✅ 下载完成！"
echo ""
echo "📊 统计信息："
TOTAL_SIZE=$(du -sh "$PHOTO_DIR" | cut -f1)
FILE_COUNT=$(ls -1 "$PHOTO_DIR" | wc -l | tr -d ' ')
echo "  文件夹: $PHOTO_DIR"
echo "  文件数: $FILE_COUNT"
echo "  总大小: $TOTAL_SIZE"
echo ""
echo "🎯 下一步："
echo "1. 打开 Gala 应用"
echo "2. 点击 'Add Folder'"
echo "3. 选择: $PHOTO_DIR"
echo "4. 等待扫描完成"
echo ""
