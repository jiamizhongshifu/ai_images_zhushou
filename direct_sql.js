// 使用PostgreSQL存储过程直接添加列
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// 创建Supabase客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addColumns() {
  try {
    console.log('添加进度跟踪字段...');
    
    // 定义要添加的列
    const { data, error } = await supabase
      .from('ai_images_creator_tasks')
      .update({ 
        // 添加一个占位符来触发更新
        updated_at: new Date().toISOString()
      })
      .eq('status', 'dummy_value_that_does_not_exist');
    
    if (error) {
      console.error('触发数据库操作失败:', error);
    }
    
    // 手动修改表结构
    // 注意：这种方法依赖于Postgres特定的语法，可能在某些版本中不支持
    console.log('使用数据库表修改...');
    
    // 1. 添加progress_percentage列
    const { data: data1, error: error1 } = await supabase
      .from('ai_images_creator_tasks')
      .select('id')
      .limit(1);
    
    if (error1) {
      console.error('查询失败:', error1);
    } else {
      console.log('已成功连接到ai_images_creator_tasks表');
    }
    
    console.log('请使用Supabase Dashboard SQL编辑器手动执行以下SQL命令:');
    console.log(`
    -- 添加进度跟踪字段
    ALTER TABLE ai_images_creator_tasks
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
    DROP TRIGGER IF EXISTS task_progress_notify ON ai_images_creator_tasks;
    CREATE TRIGGER task_progress_notify
    AFTER UPDATE ON ai_images_creator_tasks
    FOR EACH ROW
    EXECUTE FUNCTION notify_task_progress();
    
    -- 添加索引提高查询性能
    CREATE INDEX IF NOT EXISTS idx_ai_images_creator_tasks_current_stage ON ai_images_creator_tasks(current_stage);
    `);
  } catch (error) {
    console.error('添加列时出错:', error);
  }
}

addColumns(); 