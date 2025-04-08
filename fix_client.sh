#!/bin/bash

# 脚本用于修复所有使用createClient()但没有await的文件

echo "开始修复createClient()函数使用问题..."

# 查找所有包含createClient()但没有await的文件
FILES=$(grep -l "const .* = createClient()" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" -r app/ components/ utils/ --exclude-dir=node_modules)

# 显示找到的文件数量
if [ -z "$FILES" ]; then
  echo "没有找到需要修复的文件"
  exit 0
fi

# 统计文件数量
FILE_COUNT=$(echo "$FILES" | wc -l)
echo "找到 $FILE_COUNT 个文件需要修复"

# 对每个文件进行修复
for file in $FILES; do
  echo "处理文件: $file"
  # 使用sed替换文本
  sed -i '' 's/const \(.*\) = createClient()/const \1 = await createClient()/g' "$file"
done

echo "修复完成"
echo "提示: 请检查修改后的文件，确保语法正确，然后再提交代码" 