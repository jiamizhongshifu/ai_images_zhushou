import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { sql } from '@vercel/postgres';

// 添加进度字段的迁移SQL
const MIGRATION_SQL = `
-- 添加任务进度跟踪字段
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS progress_percentage INTEGER DEFAULT 0;
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS current_stage VARCHAR(50) DEFAULT 'queued';
ALTER TABLE image_tasks ADD COLUMN IF NOT EXISTS stage_details JSONB;

-- 创建任务进度通知函数
CREATE OR REPLACE FUNCTION notify_task_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- 仅当进度百分比或当前阶段发生变化时发送通知
  IF NEW.progress_percentage != OLD.progress_percentage OR NEW.current_stage != OLD.current_stage THEN
    PERFORM pg_notify(
      'task_progress',
      json_build_object(
        'task_id', NEW.task_id,
        'user_id', NEW.user_id,
        'progress_percentage', NEW.progress_percentage,
        'current_stage', NEW.current_stage,
        'stage_details', NEW.stage_details
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建任务进度更新触发器
DROP TRIGGER IF EXISTS task_progress_notify ON image_tasks;
CREATE TRIGGER task_progress_notify
AFTER UPDATE ON image_tasks
FOR EACH ROW
WHEN (NEW.status = 'processing' OR NEW.status = 'pending')
EXECUTE FUNCTION notify_task_progress();

-- 创建索引以加速查询
CREATE INDEX IF NOT EXISTS idx_image_tasks_current_stage ON image_tasks(current_stage);

-- 更新所有现有的已完成任务
UPDATE image_tasks SET progress_percentage = 100, current_stage = 'completed' WHERE status = 'completed';
`;

/**
 * 执行数据库迁移的API端点
 */
export async function POST(request: NextRequest) {
  try {
    // 安全检查 - 仅允许内部调用
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.ADMIN_API_SECRET;
    
    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    // 执行迁移
    const startTime = Date.now();
    console.log('开始执行数据库迁移...');
    
    // 使用Vercel Postgres执行迁移
    await sql.query(MIGRATION_SQL);
    
    const endTime = Date.now();
    console.log(`数据库迁移完成，耗时: ${endTime - startTime}ms`);
    
    return NextResponse.json({
      success: true,
      message: '数据库迁移成功',
      executionTime: endTime - startTime
    });
  } catch (error) {
    console.error('执行数据库迁移失败:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    }, { status: 500 });
  }
} 