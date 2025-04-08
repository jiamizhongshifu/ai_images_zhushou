#!/bin/bash

# 推送代码到远程仓库脚本

echo "开始推送代码到GitHub..."

# 确保所有更改都已添加和提交
git status

# 推送到远程仓库
echo "尝试推送代码到远程仓库..."
git push origin main

# 检查推送结果
if [ $? -eq 0 ]; then
  echo "✅ 代码推送成功！"
  echo "提交哈希值: $(git rev-parse HEAD)"
  echo "提交信息: $(git log -1 --pretty=%B)"
else
  echo "❌ 代码推送失败，请检查网络连接并重试"
  echo "您可以稍后手动执行: git push origin main"
  
  # 备选方案：尝试使用SSH方式
  echo "或者尝试添加SSH远程仓库并推送:"
  echo "git remote add origin-ssh git@github.com:jiamizhongshifu/ai_images_zhushou.git"
  echo "git push origin-ssh main"
fi 