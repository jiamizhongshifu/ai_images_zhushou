#!/bin/bash

# Vercel API部署脚本
# 解决"A commit author is required"问题

# 您的Vercel API Token
VERCEL_TOKEN="CcpQGFIXeJIqS4SkuQYRnYrf"

# 项目ID和名称 (在Vercel仪表盘的项目设置中找到)
PROJECT_ID="cly181818"
PROJECT_NAME="ai_images_zhushou"

# 提交作者信息
GIT_AUTHOR_NAME="jiamizhongshifu"
GIT_AUTHOR_EMAIL="zhongsam6@gmail.com"

# 构建当前目录作为部署包
echo "正在准备部署文件..."
if [ -f "deploy.zip" ]; then
  rm deploy.zip
fi

# 排除不需要的文件和目录
zip -r deploy.zip . -x "*.git*" "node_modules/*" ".next/*" "deploy.zip" "*.bundle" "*.disabled" 

echo "正在通过API部署到Vercel..."

# 使用curl调用Vercel API创建部署
curl -X POST "https://api.vercel.com/v13/deployments" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "'$PROJECT_NAME'",
    "files": [],
    "projectId": "'$PROJECT_ID'",
    "target": "production",
    "meta": {
      "githubCommitAuthorName": "'$GIT_AUTHOR_NAME'",
      "githubCommitAuthorEmail": "'$GIT_AUTHOR_EMAIL'",
      "githubCommitMessage": "API部署 - '$(date)'"
    }
  }' \
  --data-binary @deploy.zip

echo "部署请求已发送，请检查Vercel仪表盘查看部署状态"

# 清理
rm deploy.zip
echo "临时文件已清理" 