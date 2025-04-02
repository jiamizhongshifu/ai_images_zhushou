#!/bin/bash

# 读取.env文件
source .env

# 提取项目ID
PROJECT_ID=$(echo $NEXT_PUBLIC_SUPABASE_URL | sed -n 's/https:\/\/\([^\.]*\)\.supabase\.co.*/\1/p')

# 执行SQL文件
echo "正在执行SQL修复脚本..."
PGPASSWORD="$SUPABASE_SERVICE_ROLE_KEY" psql "postgres://postgres:$SUPABASE_SERVICE_ROLE_KEY@db.$PROJECT_ID.supabase.co:5432/postgres" -f sql/fix-credits.sql

echo "修复完成。" 