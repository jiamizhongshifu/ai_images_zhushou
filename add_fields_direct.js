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

// 为ai_images_creator_history表添加style、aspect_ratio和standard_aspect_ratio字段
// 使用Node.js和Supabase服务端客户端执行

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 检查必要的环境变量
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('错误: 缺少必要的环境变量。请确保已设置 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// 创建Supabase管理员客户端
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 执行数据库迁移
async function runMigration() {
  try {
    console.log('开始执行数据库迁移...');
    
    // 检查表是否存在
    const { data: tableExists, error: tableError } = await supabaseAdmin.rpc('pgql', {
      query: `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public'
          AND table_name = 'ai_images_creator_history'
        );
      `
    });
    
    if (tableError) {
      console.error('检查表是否存在时出错:', tableError);
      return;
    }
    
    if (!tableExists || !tableExists.length) {
      console.error('错误: ai_images_creator_history 表不存在');
      return;
    }
    
    // 检查字段是否已存在
    const { data: existingColumns, error: columnsError } = await supabaseAdmin.rpc('pgql', {
      query: `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'ai_images_creator_history'
        AND column_name IN ('style', 'aspect_ratio', 'standard_aspect_ratio');
      `
    });
    
    if (columnsError) {
      console.error('检查字段是否存在时出错:', columnsError);
      return;
    }
    
    const existingColumnsMap = {};
    if (existingColumns && existingColumns.length) {
      existingColumns.forEach(col => {
        existingColumnsMap[col.column_name] = true;
      });
    }
    
    // 添加不存在的字段
    const columnsToAdd = [];
    
    if (!existingColumnsMap['style']) {
      columnsToAdd.push(`ADD COLUMN IF NOT EXISTS style TEXT`);
    }
    
    if (!existingColumnsMap['aspect_ratio']) {
      columnsToAdd.push(`ADD COLUMN IF NOT EXISTS aspect_ratio TEXT`);
    }
    
    if (!existingColumnsMap['standard_aspect_ratio']) {
      columnsToAdd.push(`ADD COLUMN IF NOT EXISTS standard_aspect_ratio TEXT`);
    }
    
    if (columnsToAdd.length === 0) {
      console.log('所有字段已存在，无需迁移');
      return;
    }
    
    // 执行迁移 - 添加新字段
    const alterTableQuery = `
      ALTER TABLE ai_images_creator_history
      ${columnsToAdd.join(',\n      ')};
    `;
    
    console.log('执行SQL:', alterTableQuery);
    
    const { error: alterError } = await supabaseAdmin.rpc('pgql', {
      query: alterTableQuery
    });
    
    if (alterError) {
      console.error('添加字段失败:', alterError);
      return;
    }
    
    console.log('字段添加成功!');
    
    // 验证字段是否已添加
    const { data: newColumns, error: verifyError } = await supabaseAdmin.rpc('pgql', {
      query: `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'ai_images_creator_history'
        AND column_name IN ('style', 'aspect_ratio', 'standard_aspect_ratio');
      `
    });
    
    if (verifyError) {
      console.error('验证字段失败:', verifyError);
      return;
    }
    
    console.log('迁移验证结果:', newColumns);
    console.log('数据库迁移成功完成!');
    
  } catch (err) {
    console.error('执行迁移过程中出错:', err);
  }
}

// 运行迁移
runMigration();

addFields(); 