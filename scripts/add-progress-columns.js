/**
 * 数据库迁移脚本 - 添加任务进度和阶段列
 * 
 * 该脚本向 image_tasks 表添加 progress 和 stage 列，
 * 以支持任务进度实时更新功能
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// 加载环境变量
function loadEnv() {
  try {
    const envLocalPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envLocalPath)) {
      dotenv.config({ path: envLocalPath });
      console.log('已加载 .env.local 文件');
    } else {
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        console.log('已加载 .env 文件');
      } else {
        console.warn('未找到 .env 文件，请确保环境变量已正确设置');
      }
    }
  } catch (error) {
    console.error('加载环境变量失败:', error);
  }
}

loadEnv();

// 验证必要的环境变量
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('错误: 必要的环境变量未设置。请确保设置了 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// 创建具有管理员权限的 Supabase 客户端
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addProgressColumns() {
  console.log('开始向 image_tasks 表添加进度相关列...');
  
  try {
    // 检查列是否已存在
    const { data: columns, error: checkError } = await supabase
      .rpc('check_column_exists', { 
        table_name_param: 'image_tasks', 
        column_name_param: 'progress' 
      });
    
    if (checkError) {
      console.error('检查列是否存在失败:', checkError);
      
      // 可能是自定义函数不存在，直接尝试添加列
      console.log('尝试直接添加列...');
    } else if (columns && columns.column_exists) {
      console.log('progress 列已存在，无需添加');
      return;
    }
    
    // 添加 progress 列
    const { error: progressError } = await supabase
      .from('image_tasks')
      .update({ progress: 0 })
      .eq('id', 'dummy')
      .select();
    
    if (progressError && !progressError.message.includes('does not exist')) {
      // 如果列不存在，执行 SQL 添加列
      const { error: addProgressError } = await supabase.rpc('execute_sql', {
        sql_query: `
          ALTER TABLE image_tasks 
          ADD COLUMN IF NOT EXISTS progress NUMERIC DEFAULT NULL;
        `
      });
      
      if (addProgressError) {
        console.error('添加 progress 列失败，尝试直接执行 SQL:', addProgressError);
        
        // 直接执行 SQL
        const { error: directSqlError } = await supabase.rpc('execute_sql', {
          sql_query: `
            ALTER TABLE public.image_tasks 
            ADD COLUMN IF NOT EXISTS progress NUMERIC DEFAULT NULL;
          `
        });
        
        if (directSqlError) {
          throw new Error(`添加 progress 列失败: ${directSqlError.message}`);
        }
      }
      
      console.log('成功添加 progress 列');
    } else {
      console.log('progress 列已存在或添加成功');
    }
    
    // 添加 stage 列
    const { error: stageError } = await supabase
      .from('image_tasks')
      .update({ stage: '' })
      .eq('id', 'dummy')
      .select();
    
    if (stageError && !stageError.message.includes('does not exist')) {
      // 如果列不存在，执行 SQL 添加列
      const { error: addStageError } = await supabase.rpc('execute_sql', {
        sql_query: `
          ALTER TABLE image_tasks 
          ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT NULL;
        `
      });
      
      if (addStageError) {
        console.error('添加 stage 列失败，尝试直接执行 SQL:', addStageError);
        
        // 直接执行 SQL
        const { error: directSqlError } = await supabase.rpc('execute_sql', {
          sql_query: `
            ALTER TABLE public.image_tasks 
            ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT NULL;
          `
        });
        
        if (directSqlError) {
          throw new Error(`添加 stage 列失败: ${directSqlError.message}`);
        }
      }
      
      console.log('成功添加 stage 列');
    } else {
      console.log('stage 列已存在或添加成功');
    }
    
    // 添加 RPC 函数用于检查列是否存在
    console.log('添加辅助函数以便检查列是否存在...');
    
    const { error: addFunctionError } = await supabase.rpc('execute_sql', {
      sql_query: `
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
      `
    });
    
    if (addFunctionError) {
      console.warn('添加辅助函数失败，但这不影响列的添加:', addFunctionError.message);
    } else {
      console.log('辅助函数添加成功');
    }
    
    // 添加 SQL 执行函数
    const { error: addExecuteSqlError } = await supabase.rpc('execute_sql', {
      sql_query: `
        CREATE OR REPLACE FUNCTION public.execute_sql(sql_query TEXT)
        RETURNS VOID SECURITY DEFINER AS $$
        BEGIN
          EXECUTE sql_query;
        END;
        $$ LANGUAGE plpgsql;
      `
    });
    
    if (addExecuteSqlError && !addExecuteSqlError.message.includes('already exists')) {
      console.warn('添加 SQL 执行函数失败:', addExecuteSqlError.message);
    } else {
      console.log('SQL 执行函数添加或已存在');
    }
    
    console.log('数据库迁移完成，已成功添加任务进度相关列');
    
    // 移除尝试刷新schema缓存的操作，因为它需要特殊权限
    /*
    console.log('尝试刷新 schema 缓存...');
    const { error: refreshError } = await supabase.rpc('execute_sql', {
      sql_query: 'SELECT pg_reload_conf();'
    });
    
    if (refreshError) {
      console.warn('刷新 schema 缓存时出错，可能需要手动重启应用:', refreshError.message);
    } else {
      console.log('已发送 schema 缓存刷新请求，建议重启应用以确保变更生效');
    }
    */
    
    console.log('建议重启应用以确保变更生效');
    
  } catch (error) {
    console.error('数据库迁移失败:', error);
    process.exit(1);
  }
}

// 执行迁移
addProgressColumns()
  .then(() => {
    console.log('迁移脚本执行完成');
    process.exit(0);
  })
  .catch(error => {
    console.error('迁移脚本执行出错:', error);
    process.exit(1);
  }); 