# 图片生成系统部署指南

本指南详细介绍了如何正确部署和配置图片生成系统，特别是关于任务进度显示功能的设置。

## 环境变量配置

请确保在所有环境中（开发、测试、生产）正确设置以下环境变量：

```bash
# 任务进度更新API认证密钥（必须设置）
TASK_PROCESS_SECRET_KEY=your-secret-key-here

# API基础URL（必须设置）
NEXT_PUBLIC_APP_URL=https://your-app-domain.com
```

### 关于 TASK_PROCESS_SECRET_KEY

该密钥用于在图像生成服务和主应用之间进行安全通信。建议设置一个强密钥，至少32个字符。

可以通过以下命令生成随机密钥：

```bash
# 生成随机密钥
openssl rand -hex 16
```

### 备用认证机制

如果 `TASK_PROCESS_SECRET_KEY` 未设置，系统将尝试按以下顺序使用备用密钥：

1. `INTERNAL_API_KEY`
2. `API_SECRET_KEY`
3. `OPENAI_API_KEY` 的前8位字符
4. 开发环境的 `development-key`

虽然系统提供了备用机制，但**强烈建议**在生产环境中正确设置 `TASK_PROCESS_SECRET_KEY`。

## 数据库迁移

为支持实时进度显示功能，需要在数据库中添加两个新列：`progress` 和 `stage`。

### 选项1：使用SQL脚本（推荐）

在 Supabase 控制台的 SQL 编辑器中执行以下脚本：

```sql
-- 添加任务进度和阶段列
ALTER TABLE public.image_tasks 
ADD COLUMN IF NOT EXISTS progress NUMERIC DEFAULT NULL;

ALTER TABLE public.image_tasks 
ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT NULL;

-- 创建辅助函数用于检查列是否存在
CREATE OR REPLACE FUNCTION public.check_column_exists(
  table_name_param TEXT,
  column_name_param TEXT
)
RETURNS TABLE (column_exists BOOLEAN) SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT COUNT(*) > 0 AS column_exists
  FROM information_schema.columns
  WHERE table_name = table_name_param
  AND column_name = column_name_param
  AND table_schema = 'public';
END;
$$ LANGUAGE plpgsql;

-- 创建SQL执行函数
CREATE OR REPLACE FUNCTION public.execute_sql(sql_query TEXT)
RETURNS VOID SECURITY DEFINER AS $$
BEGIN
  EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql;
```

执行完脚本后，建议重启应用以确保变更生效。

### 选项2：使用Node.js脚本

我们提供了一个Node.js脚本来执行相同的迁移，它能在检测到列不存在时自动添加：

```bash
# 确保安装了依赖
npm install

# 运行迁移脚本
node scripts/add-progress-columns.js
```

## 验证部署

部署完成后，请按以下步骤验证配置：

1. 确认环境变量已正确设置：
   ```bash
   # 检查环境变量
   echo $TASK_PROCESS_SECRET_KEY
   echo $NEXT_PUBLIC_APP_URL
   ```

2. 验证数据库列已添加：
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

3. 测试生成图片功能并观察进度更新

## 故障排查

如果遇到以下错误，请按照建议解决：

### 未授权错误 (401)

出现此错误通常是因为 `TASK_PROCESS_SECRET_KEY` 环境变量未正确设置。请确保：

1. 在所有环境中设置相同的密钥
2. 密钥没有包含额外的空格或换行符
3. 部署后环境变量已正确加载（可能需要重启服务）

### 数据库列不存在错误 (422)

此错误表示数据库中缺少必要的列。请执行上述数据库迁移步骤。

### SQL语法错误

如果在运行SQL脚本时遇到语法错误（如 `ERROR: 42601: syntax error at or near "exists"`），这是因为某些PostgreSQL版本将"exists"视为关键字。我们已修复脚本，使用`column_exists`作为返回列名。

### 权限错误

如果遇到类似 `ERROR: 42501: permission denied for function pg_reload_conf` 的错误，这是因为Supabase环境中普通用户没有执行系统管理函数的权限。这个函数不是必需的，您可以忽略此错误并继续使用系统 - 我们已从脚本中移除了这个函数调用。

只需确保在执行迁移脚本后重启您的应用，以便应用能够识别新增的列。

### 进度更新不显示但图片生成正常

这是一个非致命错误，我们的系统设计为即使进度更新失败，图片生成过程也不会中断。检查：

1. 检查控制台是否有与进度更新相关的错误
2. 验证 `TASK_PROCESS_SECRET_KEY` 环境变量是否正确设置
3. 确认数据库列已正确添加

## 联系支持

如果您在部署过程中遇到任何问题，请联系技术支持团队获取帮助。 