#!/bin/bash

# 解决"A commit author is required"问题的简单脚本

# 设置Git作者信息
export GIT_COMMITTER_NAME="jiamizhongshifu"
export GIT_COMMITTER_EMAIL="zhongsam6@gmail.com"
export GIT_AUTHOR_NAME="jiamizhongshifu"
export GIT_AUTHOR_EMAIL="zhongsam6@gmail.com"

# 可选：如果需要也可以设置到Git配置
# git config --global user.name "$GIT_AUTHOR_NAME"
# git config --global user.email "$GIT_AUTHOR_EMAIL"

echo "已设置Git作者信息:"
echo "作者: $GIT_AUTHOR_NAME <$GIT_AUTHOR_EMAIL>"

if command -v vercel &> /dev/null; then
    echo "正在使用Vercel CLI部署..."
    vercel --prod
else
    echo "Vercel CLI未安装"
    echo "您可以通过运行以下命令安装 Vercel CLI:"
    echo "npm install -g vercel"
    echo ""
    echo "或者手动到Vercel仪表盘触发部署"
fi 