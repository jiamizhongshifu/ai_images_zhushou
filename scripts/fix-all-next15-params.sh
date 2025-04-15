#!/bin/bash

# 脚本：修复所有Next.js 15动态路由参数类型
# 用途：针对Next.js 15版本升级导致的API路由参数类型问题
# 作者：中庆标

# 输出颜色设置
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # 无颜色

echo -e "${YELLOW}开始修复所有Next.js 15 API路由参数类型问题...${NC}"

# 找出所有包含动态路由参数的API路由文件
ROUTE_FILES=$(find app -type f -name "route.ts" | grep "\[")

if [ -z "$ROUTE_FILES" ]; then
  echo -e "${YELLOW}未找到动态路由文件${NC}"
  exit 0
fi

FIXED_COUNT=0

for file in $ROUTE_FILES; do
  echo -e "检查文件: $file"
  
  # 检查文件是否包含需要修复的参数模式
  if grep -q "params: Promise<{" "$file" || grep -q "{ params }: { params:" "$file"; then
    echo -e "${YELLOW}修复文件: $file${NC}"
    
    # 备份原始文件
    cp "$file" "${file}.bak"
    
    # 修复 Promise<{ 格式
    sed -i.temp 's/params: Promise<{ \([^}]*\)}/params: { \1}/g' "$file"
    
    # 修复 await params 
    sed -i.temp 's/= await params/= params/g' "$file"
    
    # 修复 { params }: { params: { 格式为 context: { params: {
    sed -i.temp 's/{ params }: { params: { \([^}]*\) }/context: { params: { \1 } }/g' "$file"
    
    # 修复 params.taskId 为 context.params.taskId
    sed -i.temp 's/params\.\([a-zA-Z0-9_]*\)/context.params.\1/g' "$file"
    
    # 修复 const { taskId } = params 为 const { taskId } = context.params
    sed -i.temp 's/const { \([^}]*\) } = params/const { \1 } = context.params/g' "$file"
    
    # 删除临时文件
    rm -f "${file}.temp"
    
    echo -e "${GREEN}文件修复完成: $file${NC}"
    FIXED_COUNT=$((FIXED_COUNT + 1))
  else
    echo -e "文件不需要修复: $file"
  fi
done

echo -e "${GREEN}修复完成！共修复了 $FIXED_COUNT 个文件。${NC}"

# 清理构建缓存
if [ $FIXED_COUNT -gt 0 ]; then
  echo -e "${YELLOW}清理构建缓存...${NC}"
  rm -rf .next 2>/dev/null
  rm -f tsconfig.tsbuildinfo 2>/dev/null
  echo -e "${GREEN}缓存清理完成！${NC}"
fi

echo -e "${GREEN}现在可以尝试再次构建项目。${NC}"
exit 0 