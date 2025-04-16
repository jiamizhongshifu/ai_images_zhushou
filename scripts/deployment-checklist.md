# 图片生成系统部署检查列表

使用此列表确保系统正确部署，特别是任务进度显示功能相关的配置。

## 环境变量检查

- [ ] 设置`TASK_PROCESS_SECRET_KEY`环境变量（必须在所有环境中设置）
  ```bash
  # 生成随机密钥
  RANDOM_KEY=$(openssl rand -hex 16)
  
  # 添加到环境变量或配置文件
  export TASK_PROCESS_SECRET_KEY=$RANDOM_KEY
  ```

- [ ] 确保`NEXT_PUBLIC_APP_URL`设置正确（必须指向实际应用域名）
  ```bash
  # 本地开发
  export NEXT_PUBLIC_APP_URL=http://localhost:3000
  
  # 生产环境
  export NEXT_PUBLIC_APP_URL=https://your-actual-domain.com
  ```

- [ ] 对于Vercel部署，在项目设置中添加环境变量
  - 访问Vercel项目设置 -> Environment Variables
  - 添加上述两个环境变量并保存
  - 重新部署应用以应用新设置

## 数据库迁移检查

- [ ] 执行简化版迁移脚本添加必要的数据库列
  ```sql
  -- 在Supabase SQL编辑器中执行
  ALTER TABLE public.image_tasks 
  ADD COLUMN IF NOT EXISTS progress NUMERIC DEFAULT NULL;
  
  ALTER TABLE public.image_tasks 
  ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT NULL;
  ```

- [ ] 验证列是否已添加
  ```sql
  -- 在Supabase SQL编辑器中执行
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
  ```

## 应用部署检查

- [ ] 重启应用以加载新的环境变量和数据库结构
- [ ] 使用测试脚本验证进度更新功能
  ```bash
  # 安装依赖
  npm install node-fetch@2 --save-dev
  
  # 运行测试脚本
  node scripts/test-progress-update.js
  ```

- [ ] 实际测试图片生成功能，确保进度条显示正常
- [ ] 检查服务器日志，确认没有环境变量相关的警告
  - 不应再出现`TASK_PROCESS_SECRET_KEY 为空`警告
  - 不应再出现进度更新请求超时警告

## 故障排查

如果进度更新仍然失败，请检查：

1. 网络连接：服务器是否可以访问API端点
   ```bash
   curl -v $NEXT_PUBLIC_APP_URL/api/update-task-progress
   ```

2. API路由是否正常工作
   ```bash
   # 直接向API发送测试请求
   curl -X POST \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TASK_PROCESS_SECRET_KEY" \
     -d '{"taskId":"test-123","progress":50,"stage":"testing"}' \
     $NEXT_PUBLIC_APP_URL/api/update-task-progress
   ```

3. 检查数据库权限：确保应用有权限更新`image_tasks`表

## 部署后监控

- [ ] 监控服务器日志24小时，确认没有进度更新失败的警告
- [ ] 检查数据库中`image_tasks`表的`progress`和`stage`列是否正常更新
- [ ] 确认用户界面上的进度条显示正常工作 