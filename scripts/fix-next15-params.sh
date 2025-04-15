#!/bin/bash

# 脚本：修复Next.js 15动态路由参数类型
# 用途：针对Vercel构建失败的特定修复
# 作者：中庆标

# 输出颜色设置
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # 无颜色

echo -e "${YELLOW}开始修复Next.js 15 API路由参数类型问题...${NC}"

# 指定需要修复的文件
TARGET_FILE="app/api/image-task-status/[taskId]/route.ts"

if [ ! -f "$TARGET_FILE" ]; then
  echo -e "${RED}错误：目标文件不存在 - $TARGET_FILE${NC}"
  exit 1
fi

echo -e "正在修复文件: $TARGET_FILE"

# 备份原始文件
cp "$TARGET_FILE" "${TARGET_FILE}.bak"

# 方法1：直接修改文件内容，使用临时文件避免流重定向问题
cat > temp_fix.ts << EOF
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { logger } from '@/utils/logger';

const STATUS_TIMEOUT_SEC = 360; // 6分钟超时

/**
 * 任务状态API
 * 获取指定任务ID的状态信息
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  
  // 文件其余内容不变...
EOF

# 从原始文件的第15行开始追加剩余内容
tail -n +15 "${TARGET_FILE}.bak" >> temp_fix.ts

# 替换原始文件
mv temp_fix.ts "$TARGET_FILE"

echo -e "${GREEN}文件修复完成${NC}"

# 清理构建缓存
echo -e "${YELLOW}清理构建缓存...${NC}"
rm -rf .next 2>/dev/null
rm -f tsconfig.tsbuildinfo 2>/dev/null

echo -e "${GREEN}完成！${NC}现在可以尝试再次构建项目。"
exit 0 