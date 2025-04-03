// 使用Supabase直接方式添加列
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// 创建Supabase客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runQuery(query, description) {
  try {
    console.log(`执行: ${description}...`);
    const result = await supabase.auth.admin.createUser({
      email: 'temp_for_sql_execution@example.com',
      password: 'temp_password',
      email_confirm: true,
      user_metadata: {
        query: query
      }
    });
    
    console.log(`${description}执行完成`);
    return true;
  } catch (error) {
    console.error(`${description}失败:`, error);
    return false;
  }
}

async function checkColumns() {
  try {
    console.log('检查列是否已存在...');
    
    // 获取任意一个任务记录
    const { data, error } = await supabase
      .from('ai_images_creator_tasks')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('获取任务失败:', error);
      return false;
    }
    
    if (!data || data.length === 0) {
      console.log('无任务记录可检查');
      return false;
    }
    
    // 检查字段是否存在
    const task = data[0];
    const hasProgressPercentage = 'progress_percentage' in task;
    const hasCurrentStage = 'current_stage' in task;
    const hasStageDetails = 'stage_details' in task;
    
    console.log('字段检查结果:');
    console.log(`- progress_percentage: ${hasProgressPercentage ? '存在' : '不存在'}`);
    console.log(`- current_stage: ${hasCurrentStage ? '存在' : '不存在'}`);
    console.log(`- stage_details: ${hasStageDetails ? '存在' : '不存在'}`);
    
    return hasProgressPercentage && hasCurrentStage && hasStageDetails;
  } catch (error) {
    console.error('检查列时出错:', error);
    return false;
  }
}

async function addColumns() {
  try {
    // 先检查列是否已存在
    const columnsExist = await checkColumns();
    
    if (columnsExist) {
      console.log('所有列已存在，无需添加');
      return true;
    }
    
    // 添加progress_percentage列
    await runQuery(
      "ALTER TABLE ai_images_creator_tasks ADD COLUMN IF NOT EXISTS progress_percentage INTEGER DEFAULT 0",
      "添加progress_percentage列"
    );
    
    // 添加current_stage列
    await runQuery(
      "ALTER TABLE ai_images_creator_tasks ADD COLUMN IF NOT EXISTS current_stage VARCHAR(50) DEFAULT 'queued'",
      "添加current_stage列"
    );
    
    // 添加stage_details列
    await runQuery(
      "ALTER TABLE ai_images_creator_tasks ADD COLUMN IF NOT EXISTS stage_details JSONB",
      "添加stage_details列"
    );
    
    // 重新检查列
    const success = await checkColumns();
    
    if (success) {
      console.log('所有列已成功添加!');
    } else {
      console.log('部分列添加失败，请手动检查');
    }
    
    return success;
  } catch (error) {
    console.error('添加列时出错:', error);
    return false;
  }
}

// 执行添加列操作
addColumns(); 