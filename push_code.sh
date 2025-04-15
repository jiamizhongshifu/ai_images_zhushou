#!/bin/bash
# 用于推送代码到GitHub的脚本

# 从.env文件中提取代理设置
if [ -f .env ]; then
  HTTP_PROXY_VALUE=$(grep -E "^HTTP_PROXY=" .env | cut -d'=' -f2)
  if [ ! -z "$HTTP_PROXY_VALUE" ]; then
    echo "使用.env中的HTTP代理: $HTTP_PROXY_VALUE"
    export http_proxy="$HTTP_PROXY_VALUE"
    export https_proxy="$HTTP_PROXY_VALUE"
  fi
fi

# 尝试不同的Git推送选项
echo "尝试推送代码到GitHub...(方法1: 标准推送)"
git push origin main

if [ $? -ne 0 ]; then
  echo "标准推送失败，尝试方法2: 使用git协议"
  # 尝试更改remote URL为git协议
  CURRENT_URL=$(git remote get-url origin)
  if [[ "$CURRENT_URL" == https://* ]]; then
    NEW_URL=$(echo "$CURRENT_URL" | sed 's|https://github.com/|git@github.com:|')
    echo "临时更改远程URL为: $NEW_URL"
    git remote set-url origin "$NEW_URL"
    git push origin main
    # 恢复原始URL
    git remote set-url origin "$CURRENT_URL"
  else
    echo "当前远程URL不是https格式，跳过方法2"
  fi
fi

if [ $? -ne 0 ]; then
  echo "方法2也失败，尝试方法3: 增加超时"
  GIT_SSH_COMMAND="ssh -o ConnectTimeout=30" git push origin main
fi

if [ $? -eq 0 ]; then
  echo "推送成功！"
else
  echo "所有推送尝试均失败。"
  echo "网络连接可能存在问题，请稍后再尝试。"
  echo "或者考虑："
  echo "1. 使用不同的网络连接"
  echo "2. 检查防火墙设置"
  echo "3. 使用VPN或其他代理服务"
fi

# 图片生成任务优化部署脚本

# 显示执行的命令
set -x

# 确保git状态干净
git status

# 添加修改的文件
git add app/api/last-task-for-user/route.ts
git add app/api/task-final-check/\[taskId\]/route.ts
git add utils/taskRecovery.ts
git add utils/taskPoller.ts
git add hooks/useImageGeneration.ts
git add app/components/TaskRecoveryDialog.tsx

# 添加配置文件和部署指南
mkdir -p deployment
cp tmp/nginx.conf deployment/
cp tmp/README.md deployment/
git add deployment/

# 提交修改
git commit -m "修复：增强前端图片生成任务可靠性，添加网络故障恢复，减少本地存储大小，实现临时ID映射"

# 推送到远程仓库
git push origin main

# 提示下一步操作
echo "代码已推送至远程仓库，请登录Vercel检查部署状态"
echo "如果部署继续失败，请手动运行以下命令修复类型错误:"
echo "pnpm type-check" 