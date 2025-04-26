-- 添加任务进度和阶段列迁移脚本
-- 在Supabase控制台的SQL编辑器中执行

-- 添加进度列
ALTER TABLE public.image_tasks 
ADD COLUMN IF NOT EXISTS progress NUMERIC DEFAULT NULL;

-- 添加阶段列
ALTER TABLE public.image_tasks 
ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT NULL;

-- 添加锁版本字段
ALTER TABLE public.image_tasks
ADD COLUMN IF NOT EXISTS lock_version INTEGER DEFAULT 0;

-- 创建改进版的锁获取函数，包含超时和更健壮的错误处理
CREATE OR REPLACE FUNCTION public.acquire_task_lock(
  p_task_id TEXT,
  p_timeout_ms INTEGER DEFAULT 5000 -- 默认超时5秒
)
RETURNS TABLE (version INTEGER) SECURITY DEFINER AS $$
DECLARE
  v_start_time TIMESTAMPTZ := clock_timestamp();
  v_timeout INTERVAL := make_interval(milliseconds => p_timeout_ms);
  v_lock_obtained BOOLEAN := FALSE;
  v_result INTEGER;
BEGIN
  -- 设置语句超时
  SET LOCAL statement_timeout = p_timeout_ms;
  
  -- 尝试获取锁，直到超时
  WHILE NOT v_lock_obtained AND (clock_timestamp() - v_start_time < v_timeout) LOOP
    BEGIN
      -- 使用FOR UPDATE NOWAIT尝试获取锁
      SELECT lock_version INTO v_result
      FROM public.image_tasks
      WHERE task_id = p_task_id
      FOR UPDATE NOWAIT;
      
      -- 如果到这里，说明成功获取了锁
      v_lock_obtained := TRUE;
      
      -- 记录锁获取事件
      INSERT INTO public.task_locks_log(
        task_id, 
        action, 
        lock_version, 
        acquired_at
      ) VALUES (
        p_task_id, 
        'acquire', 
        v_result, 
        clock_timestamp()
      )
      ON CONFLICT (task_id) DO UPDATE
      SET action = 'acquire',
          lock_version = v_result,
          acquired_at = clock_timestamp();
          
    EXCEPTION
      WHEN lock_not_available THEN
        -- 锁冲突，等待短暂时间后重试
        PERFORM pg_sleep(0.1);
      WHEN no_data_found THEN
        -- 任务不存在
        RAISE EXCEPTION 'Task not found: %', p_task_id;
    END;
  END LOOP;
  
  -- 检查是否获取到锁
  IF NOT v_lock_obtained THEN
    RAISE EXCEPTION 'Timeout while acquiring lock for task: %', p_task_id
      USING HINT = 'Consider increasing timeout value or check for deadlocks';
  END IF;
  
  -- 返回锁版本
  RETURN QUERY SELECT v_result;
END;
$$ LANGUAGE plpgsql;

-- 创建锁释放函数，确保锁总是能被释放
CREATE OR REPLACE FUNCTION public.release_task_lock(
  p_task_id TEXT,
  p_lock_version INTEGER
)
RETURNS VOID SECURITY DEFINER AS $$
BEGIN
  -- 记录锁释放事件
  INSERT INTO public.task_locks_log(
    task_id, 
    action, 
    lock_version, 
    acquired_at
  ) VALUES (
    p_task_id, 
    'release', 
    p_lock_version, 
    clock_timestamp()
  )
  ON CONFLICT (task_id) DO UPDATE
  SET action = 'release',
      lock_version = p_lock_version,
      acquired_at = clock_timestamp();

  -- 注意：我们不实际释放锁，因为PostgreSQL的锁是事务级别的
  -- 当提交或回滚事务时，锁会自动释放
  -- 这个函数主要用于记录
END;
$$ LANGUAGE plpgsql;

-- 创建锁日志表，跟踪锁的获取和释放
CREATE TABLE IF NOT EXISTS public.task_locks_log (
  task_id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  lock_version INTEGER NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 创建清理过期锁的函数
CREATE OR REPLACE FUNCTION public.cleanup_expired_locks(
  p_timeout_minutes INTEGER DEFAULT 30
)
RETURNS INTEGER SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- 删除超时的锁记录
  DELETE FROM public.task_locks_log
  WHERE action = 'acquire'
    AND acquired_at < (now() - (p_timeout_minutes * interval '1 minute'))
    AND task_id NOT IN (
      SELECT task_id FROM public.task_locks_log WHERE action = 'release'
    );
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- 创建定期清理过期锁的触发器
CREATE OR REPLACE FUNCTION public.trigger_cleanup_expired_locks()
RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
  -- 每隔一定数量的操作，执行一次清理
  IF (NEW.id % 100) = 0 THEN
    PERFORM public.cleanup_expired_locks();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
  WHERE table_schema = 'public'
  AND table_name = table_name_param
  AND column_name = column_name_param;
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
  AND column_name IN ('progress', 'stage', 'lock_version')
ORDER BY 
  column_name; 