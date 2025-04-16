-- 向image_tasks表添加进度跟踪字段
ALTER TABLE image_tasks
ADD COLUMN IF NOT EXISTS progress_percentage INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS current_stage VARCHAR(50) DEFAULT 'queued',
ADD COLUMN IF NOT EXISTS stage_details JSONB;

-- 创建进度通知触发器函数
CREATE OR REPLACE FUNCTION notify_task_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- 当任务进度更新时
  IF OLD.progress_percentage IS DISTINCT FROM NEW.progress_percentage OR
     OLD.current_stage IS DISTINCT FROM NEW.current_stage THEN
    -- 通过Postgres通知机制发布通知
    PERFORM pg_notify(
      'task_progress',
      json_build_object(
        'task_id', NEW.task_id,
        'stage', NEW.current_stage,
        'percentage', NEW.progress_percentage,
        'details', NEW.stage_details
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器
DROP TRIGGER IF EXISTS task_progress_notify ON image_tasks;
CREATE TRIGGER task_progress_notify
AFTER UPDATE ON image_tasks
FOR EACH ROW
EXECUTE FUNCTION notify_task_progress();

-- 添加索引提高查询性能
CREATE INDEX IF NOT EXISTS idx_image_tasks_current_stage ON image_tasks(current_stage); 