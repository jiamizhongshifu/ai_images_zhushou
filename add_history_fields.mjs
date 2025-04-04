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