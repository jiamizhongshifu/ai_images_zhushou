#!/bin/bash

# 更新Next.js动态路由参数类型为Promise
# 用于Next.js 15+ 版本
# 作者: 中庆标
# 日期: 2025.04.19

echo "开始检查API路由端点参数格式..."

# 查找使用旧格式的文件
echo "查找使用旧格式的文件..."
OLD_FORMAT_FILES=$(grep -l "{ params }: { params: { " --include="*.ts" --include="*.tsx" -r app/)

# 如果找不到，则退出
if [ -z "$OLD_FORMAT_FILES" ]; then
  echo "未找到使用旧格式的文件，所有API路由已是Promise格式"
  exit 0
fi

echo "找到以下文件使用旧格式："
echo "$OLD_FORMAT_FILES"
echo

# 确认是否继续
read -p "是否更新这些文件? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "操作已取消"
  exit 1
fi

# 遍历更新文件
for file in $OLD_FORMAT_FILES; do
  echo "更新文件: $file"
  
  # 替换参数类型定义
  sed -i '' 's/{ params }: { params: { \([a-zA-Z0-9_]*\): \([a-zA-Z0-9\[\]_]*\) } }/{ params }: { params: Promise<{ \1: \2 }> }/g' "$file"
  
  # 替换参数访问方式
  sed -i '' 's/const { \([a-zA-Z0-9_]*\) } = params;/const { \1 } = await params;/g' "$file"
  
  # 检查是否需要添加async关键字
  if grep -q "export.*function.*(/.*params.*" "$file" && ! grep -q "export.*async.*function.*(/.*params.*" "$file"; then
    echo "  添加async关键字..."
    sed -i '' 's/export.*function/export async function/g' "$file"
  fi
  
  echo "  文件更新完成"
done

echo "所有文件更新完成，请检查并测试更改"
exit 0 