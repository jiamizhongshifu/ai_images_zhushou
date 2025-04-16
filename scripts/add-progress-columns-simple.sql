-- 使用原生SQL直接执行列添加脚本（不含特权函数调用）
-- 该脚本只包含基本的列添加命令，适用于所有权限级别

-- 添加进度列
ALTER TABLE public.image_tasks 
ADD COLUMN IF NOT EXISTS progress NUMERIC DEFAULT NULL;

-- 添加阶段列
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
