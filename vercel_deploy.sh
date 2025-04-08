#!/bin/bash

# 设置Git作者信息
git config --global user.name "jiamizhongshifu"
git config --global user.email "zhongsam6@gmail.com"

# 确保所有文件已添加
git add .

# 创建新的提交
git commit -m "准备部署到Vercel: $(date)"

# 推送到GitHub
git push

# 如果已安装Vercel CLI，可以直接部署
if command -v vercel &> /dev/null; then
    echo "使用Vercel CLI部署..."
    vercel --prod
else
    echo "Vercel CLI未安装，请手动在Vercel仪表盘触发部署"
    echo "您可以通过运行 'npm install -g vercel' 安装Vercel CLI"
fi

echo "部署脚本执行完成" 