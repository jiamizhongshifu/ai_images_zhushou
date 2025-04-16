#!/bin/bash
# 图片生成任务进度功能修复脚本
# 此脚本用于在生产环境中应用所有必要的修复

# 显示彩色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}开始应用图片生成任务进度功能修复...${NC}"

# 步骤1：生成并设置环境变量
echo -e "${YELLOW}步骤1: 设置环境变量${NC}"
if [ -z "$TASK_PROCESS_SECRET_KEY" ]; then
  RANDOM_KEY=$(openssl rand -hex 16)
  echo -e "生成随机密钥: ${GREEN}$RANDOM_KEY${NC}"
  export TASK_PROCESS_SECRET_KEY=$RANDOM_KEY
  echo "export TASK_PROCESS_SECRET_KEY=$RANDOM_KEY" >> ~/.bashrc
  echo "export TASK_PROCESS_SECRET_KEY=$RANDOM_KEY" >> ~/.profile
  echo -e "${GREEN}已将密钥添加到 ~/.bashrc 和 ~/.profile${NC}"
  
  # 如果使用PM2，添加到PM2环境
  if command -v pm2 &> /dev/null; then
    pm2 set TASK_PROCESS_SECRET_KEY $RANDOM_KEY
    echo -e "${GREEN}已将密钥添加到PM2环境变量${NC}"
  fi
  
  # 如果使用Vercel，显示添加环境变量的说明
  echo -e "${YELLOW}如果使用Vercel部署，请手动在Vercel项目设置中添加此环境变量${NC}"
else
  echo -e "${GREEN}TASK_PROCESS_SECRET_KEY已存在，值为: ${TASK_PROCESS_SECRET_KEY:0:6}...${NC}"
fi

# 步骤2：检查和设置应用URL
echo -e "${YELLOW}步骤2: 设置应用URL${NC}"
if [ -z "$NEXT_PUBLIC_APP_URL" ]; then
  read -p "请输入应用URL (例如 https://your-domain.com): " APP_URL
  export NEXT_PUBLIC_APP_URL=$APP_URL
  echo "export NEXT_PUBLIC_APP_URL=$APP_URL" >> ~/.bashrc
  echo "export NEXT_PUBLIC_APP_URL=$APP_URL" >> ~/.profile
  echo -e "${GREEN}已将应用URL添加到环境变量${NC}"
  
  # 如果使用PM2，添加到PM2环境
  if command -v pm2 &> /dev/null; then
    pm2 set NEXT_PUBLIC_APP_URL $APP_URL
    echo -e "${GREEN}已将应用URL添加到PM2环境变量${NC}"
  fi
  
  # 如果使用Vercel，显示添加环境变量的说明
  echo -e "${YELLOW}如果使用Vercel部署，请手动在Vercel项目设置中添加此环境变量${NC}"
else
  echo -e "${GREEN}NEXT_PUBLIC_APP_URL已存在，值为: $NEXT_PUBLIC_APP_URL${NC}"
fi

# 步骤3：准备数据库迁移
echo -e "${YELLOW}步骤3: 准备数据库迁移${NC}"
echo -e "以下SQL脚本需要在Supabase SQL编辑器中执行:"
echo -e "${GREEN}"
cat <<EOF
-- 添加任务进度和阶段列
ALTER TABLE public.image_tasks 
ADD COLUMN IF NOT EXISTS progress NUMERIC DEFAULT NULL;

ALTER TABLE public.image_tasks 
ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT NULL;

-- 验证列是否已添加
SELECT 
  table_name, 
  column_name, 
  data_type 
FROM 
  information_schema.columns 
WHERE 
  table_schema = 'public' 
  AND table_name = 'image_tasks'
  AND column_name IN ('progress', 'stage')
ORDER BY 
  column_name;
EOF
echo -e "${NC}"

# 步骤4：安装依赖并测试
echo -e "${YELLOW}步骤4: 安装依赖并测试${NC}"
if [ -f "package.json" ]; then
  echo -e "安装node-fetch依赖..."
  npm install node-fetch@2 --save-dev
  
  echo -e "${GREEN}请运行以下命令测试进度更新功能:${NC}"
  echo -e "node scripts/test-progress-update.js"
else
  echo -e "${RED}未找到package.json文件，可能不在正确的目录${NC}"
fi

# 步骤5：重启应用
echo -e "${YELLOW}步骤5: 重启应用${NC}"
if command -v pm2 &> /dev/null; then
  echo -e "检测到PM2，是否重启应用? [y/N]"
  read restart
  if [[ $restart == "y" || $restart == "Y" ]]; then
    echo -e "重启所有PM2应用..."
    pm2 restart all
    echo -e "${GREEN}应用已重启${NC}"
  else
    echo -e "跳过重启，请稍后手动重启应用"
  fi
else
  echo -e "${YELLOW}请手动重启您的应用，以使环境变量更改生效${NC}"
fi

echo -e "${GREEN}修复脚本执行完成!${NC}"
echo -e "${YELLOW}请查看scripts/deployment-checklist.md文件，确保所有步骤都已完成${NC}" 