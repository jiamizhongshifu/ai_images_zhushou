-- 添加任务进度和阶段列迁移脚本
-- 在Supabase控制台的SQL编辑器中执行

-- 添加进度列
ALTER TABLE public.image_tasks 
ADD COLUMN IF NOT EXISTS progress NUMERIC DEFAULT NULL;

-- 添加阶段列
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

-- 注释掉需要超级用户权限的刷新配置命令
-- SELECT pg_reload_conf();

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