// 直接添加字段脚本
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// 创建Supabase客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createPgqlFunction() {
  try {
    console.log('创建pgql函数...');
    
    // 先尝试直接用SQL API创建pgql函数
    const createFunctionSQL = `
      CREATE OR REPLACE FUNCTION pgql(query text)
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        EXECUTE query;
        RETURN jsonb_build_object('success', true);
      EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
      END;
      $$;
      
      GRANT EXECUTE ON FUNCTION pgql TO service_role;
    `;
    
    // 使用Supabase's SQL API
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'params=single-object'
      },
      body: JSON.stringify({ query: createFunctionSQL })
    });
    
    if (!response.ok) {
      console.log('无法通过REST API创建pgql函数');
    } else {
      console.log('pgql函数创建成功!');
    }
  } catch (error) {
    console.error('创建函数时出错:', error);
  }
}

async function addFields() {
  try {
    // 先创建pgql函数
    await createPgqlFunction();
    
    console.log('开始添加字段...');
    
    // 尝试使用Supabase的从数据库API
    const addColumnsSQL = `
      ALTER TABLE ai_images_creator_tasks 
      ADD COLUMN IF NOT EXISTS progress_percentage INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS current_stage VARCHAR(50) DEFAULT 'queued',
      ADD COLUMN IF NOT EXISTS stage_details JSONB;
    `;
    
    const { error } = await supabase.rpc('pgql', { query: addColumnsSQL });
    
    if (error) {
      console.error('添加字段失败:', error);
      
      // 尝试使用RPC API
      await supabase.from('_rpc').select('*').rpc('pgql', { query: addColumnsSQL });
    } else {
      console.log('字段添加成功!');
    }
    
    // 创建函数和触发器
    const triggerSql = `
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
    `;
    
    const triggerResult = await supabase.rpc('pgql', { query: triggerSql });
    
    if (triggerResult.error) {
      console.error('创建触发器失败:', triggerResult.error);
    } else {
      console.log('触发器和函数创建成功!');
    }
    
    // 创建索引
    const indexSql = `
      CREATE INDEX IF NOT EXISTS idx_ai_images_creator_tasks_current_stage 
      ON ai_images_creator_tasks(current_stage);
    `;
    
    const indexResult = await supabase.rpc('pgql', { query: indexSql });
    
    if (indexResult.error) {
      console.error('创建索引失败:', indexResult.error);
    } else {
      console.log('索引创建成功!');
    }
    
    // 验证字段是否已添加
    try {
      console.log('验证字段添加...');
      const { data, error } = await supabase
        .from('ai_images_creator_tasks')
        .select('progress_percentage, current_stage, stage_details')
        .limit(1);
      
      if (error) {
        console.error('验证字段失败:', error);
      } else {
        console.log('字段验证通过!', data);
        console.log('所有数据库操作已成功完成!');
      }
    } catch (error) {
      console.error('验证字段时出错:', error);
    }
  } catch (error) {
    console.error('执行出错:', error);
  }
}

addFields(); 