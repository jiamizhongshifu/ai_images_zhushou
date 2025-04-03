import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量
dotenv.config();

// 创建Supabase客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function executeSQLMigration() {
  try {
    console.log('开始执行数据库迁移...');
    
    // 读取SQL文件
    const sqlFilePath = path.join(process.cwd(), 'add_progress_fields.sql');
    const sqlContent = readFileSync(sqlFilePath, 'utf8');
    
    // 执行SQL语句
    const { data, error } = await supabase.rpc('pgql', {
      query: sqlContent
    });
    
    if (error) {
      console.error('执行SQL迁移失败:', error);
      return;
    }
    
    console.log('数据库迁移执行成功!');
    
    // 验证字段是否已添加
    const { data: columns, error: columnsError } = await supabase.rpc('pgql', {
      query: `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'ai_images_creator_tasks'
        AND column_name IN ('progress_percentage', 'current_stage', 'stage_details')
      `
    });
    
    if (columnsError) {
      console.error('验证字段失败:', columnsError);
      return;
    }
    
    console.log('验证结果:', columns);
  } catch (err) {
    console.error('执行过程中出错:', err);
  }
}

// 创建pgql函数（如果需要）
async function createPgqlFunction() {
  try {
    console.log('创建pgql函数...');
    
    const { error } = await supabase.rpc('pgql', {
      query: `
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
      `
    });
    
    if (error) {
      console.log('pgql函数可能不存在，尝试直接创建...');
      
      const { error: directError } = await supabase.from('_rpc').select().rpc('createpgql', {});
      
      if (directError) {
        // 最后的尝试：使用SQL API
        console.log('尝试使用SQL API创建函数...');
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({
            query: `
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
            `
          })
        });
      }
    }
    
    console.log('pgql函数创建/验证完成');
  } catch (err) {
    console.error('创建pgql函数时出错:', err);
  }
}

// 执行迁移
async function run() {
  try {
    await createPgqlFunction();
    await executeSQLMigration();
    console.log('迁移完成!');
  } catch (err) {
    console.error('迁移过程中出错:', err);
  }
}

run(); 