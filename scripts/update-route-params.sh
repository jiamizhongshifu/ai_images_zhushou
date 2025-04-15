#!/bin/bash

# 脚本：更新Next.js API路由参数类型
# 用途：将Next.js路由参数从非Promise类型更新为Promise类型
# 作者：AI助手

# 设置颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # 无颜色

echo -e "${YELLOW}开始更新Next.js API路由参数类型...${NC}"

# 查找app目录下的所有路由文件
ROUTE_FILES=$(find app -name "route.ts" -o -name "route.js" -o -name "route.tsx")

# 计数器
UPDATED=0
ALREADY_CORRECT=0
FAILED=0

# 遍历所有路由文件
for file in $ROUTE_FILES; do
  echo -e "检查文件: ${file}"
  
  # 检查文件是否存在非Promise参数定义
  if grep -q "{ params }: { params: { [a-zA-Z0-9_]*: [a-zA-Z0-9\[\]_]* } }" "$file"; then
    echo -e "  ${YELLOW}找到非Promise参数定义，正在更新...${NC}"
    
    # 创建文件备份
    cp "$file" "${file}.bak"
    
    # 替换参数类型并添加await
    sed -i '' 's/{ params }: { params: { \([a-zA-Z0-9_]*\): \([a-zA-Z0-9\[\]_]*\) } }/{ params }: { params: Promise<{ \1: \2 }> }/g' "$file"
    sed -i '' 's/const { \([a-zA-Z0-9_]*\) } = params;/const { \1 } = await params;/g' "$file"
    
    # 验证更新
    if grep -q "{ params }: { params: Promise<{ [a-zA-Z0-9_]*: [a-zA-Z0-9\[\]_]* }> }" "$file" && grep -q "await params" "$file"; then
      echo -e "  ${GREEN}更新成功${NC}"
      UPDATED=$((UPDATED+1))
    else
      echo -e "  ${RED}更新失败，恢复原文件${NC}"
      mv "${file}.bak" "$file"
      FAILED=$((FAILED+1))
    fi
  elif grep -q "{ params }: { params: Promise<{ [a-zA-Z0-9_]*: [a-zA-Z0-9\[\]_]* }> }" "$file"; then
    echo -e "  ${GREEN}文件已经使用正确的Promise参数类型${NC}"
    ALREADY_CORRECT=$((ALREADY_CORRECT+1))
  else
    echo -e "  ${YELLOW}未找到参数定义或使用了不同的格式${NC}"
  fi
  
  # 删除备份文件
  rm -f "${file}.bak" 2>/dev/null
done

echo -e "\n${GREEN}更新完成:${NC}"
echo -e "- 已更新: ${UPDATED} 个文件"
echo -e "- 已正确: ${ALREADY_CORRECT} 个文件"
echo -e "- 更新失败: ${FAILED} 个文件"
echo -e "\n${YELLOW}注意: 请检查更新后的文件是否正确，并考虑运行类型检查或构建来验证.${NC}"

# 添加执行权限
chmod +x "$0"

# 退出
exit 0 