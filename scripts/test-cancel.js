#!/usr/bin/env node

// 加载.env文件中的环境变量
require('dotenv').config();

/**
 * 任务取消测试脚本
 * 
 * 这个脚本会尝试使用不同的方法取消指定的任务，以帮助诊断问题
 * 
 * 使用方法：
 * node scripts/test-cancel.js <task_id>
 */

const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

// 设置Supabase客户端
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 调试输出环境变量状态
console.log('环境变量状态:');
console.log(`- NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? '已设置' : '未设置'}`);
console.log(`- SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '已设置' : '未设置'}`);
console.log(`- NEXT_PUBLIC_SUPABASE_ANON_KEY: ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '已设置' : '未设置'}`);

if (!supabaseUrl || !supabaseKey) {
  console.error('缺少SUPABASE环境变量。请设置以下环境变量:');
  console.error('NEXT_PUBLIC_SUPABASE_URL');
  console.error('SUPABASE_SERVICE_ROLE_KEY 或 NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

// 创建Supabase客户端 - 确保URL不以斜杠结尾
const cleanUrl = supabaseUrl.endsWith('/') ? supabaseUrl.slice(0, -1) : supabaseUrl;
console.log(`使用URL: ${cleanUrl}`);
console.log(`使用密钥: ${supabaseKey.substring(0, 5)}...${supabaseKey.substring(supabaseKey.length - 5)}`);

// 创建Supabase客户端
const supabase = createClient(cleanUrl, supabaseKey);

// 从命令行参数获取任务ID
const taskId = process.argv[2];

if (!taskId) {
  console.error('请提供任务ID作为命令行参数');
  console.error('例如: node scripts/test-cancel.js task_12345');
  process.exit(1);
}

// 创建命令行界面
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 主函数
async function main() {
  try {
    console.log(`正在测试取消任务: ${taskId}`);
    
    // 获取任务信息
    const { data: task, error: queryError } = await supabase
      .from('ai_images_creator_tasks')
      .select('*')
      .eq('task_id', taskId)
      .single();
    
    if (queryError) {
      console.error('查询任务失败:', queryError);
      if (queryError.code === 'PGRST116') {
        console.error('任务不存在');
      }
      process.exit(1);
    }
    
    console.log('当前任务信息:');
    console.log(`- ID: ${task.id}`);
    console.log(`- 任务ID: ${task.task_id}`);
    console.log(`- 用户ID: ${task.user_id}`);
    console.log(`- 状态: ${task.status}`);
    console.log(`- 创建时间: ${task.created_at}`);
    console.log(`- 更新时间: ${task.updated_at}`);
    console.log(`- 点数已扣除: ${task.credits_deducted ? '是' : '否'}`);
    console.log(`- 点数已退还: ${task.credits_refunded ? '是' : '否'}`);
    
    // 显示菜单
    console.log('\n请选择取消方法:');
    console.log('1. 直接更新表状态 (UPDATE语句)');
    console.log('2. 使用RPC函数 (cancel_task)');
    console.log('3. 退出');
    
    rl.question('请输入选项 (1/2/3): ', async (answer) => {
      switch (answer) {
        case '1':
          await testDirectUpdate(task);
          break;
        case '2':
          await testRpcFunction(task);
          break;
        case '3':
          console.log('退出测试');
          rl.close();
          process.exit(0);
          break;
        default:
          console.log('无效选项');
          rl.close();
          process.exit(1);
      }
    });
  } catch (error) {
    console.error('测试过程中发生错误:', error);
    rl.close();
    process.exit(1);
  }
}

// 测试直接更新表
async function testDirectUpdate(task) {
  console.log('\n正在尝试直接更新表...');
  
  const { data, error } = await supabase
    .from('ai_images_creator_tasks')
    .update({ 
      status: 'cancelled',
      updated_at: new Date().toISOString(),
      error_message: '测试脚本取消任务'
    })
    .eq('task_id', task.task_id);
  
  if (error) {
    console.error('更新失败:', error);
    console.log('\nDEBUG信息:');
    console.log('- 错误代码:', error.code);
    console.log('- 错误信息:', error.message);
    console.log('- 错误详情:', error.details);
    console.log('- 错误提示:', error.hint);
    
    // 提供解决方案建议
    if (error.code === '42501') {
      console.log('\n解决方案建议: 您需要为表添加更新策略');
      console.log('请在Supabase控制台SQL编辑器中执行以下命令:');
      console.log(`
CREATE POLICY "Users can update their own tasks"
  ON ai_images_creator_tasks
  FOR UPDATE
  USING (auth.uid() = user_id);
      `);
    }
  } else {
    console.log('更新成功!');
    console.log('任务状态已更改为: cancelled');
  }
  
  rl.close();
}

// 测试RPC函数
async function testRpcFunction(task) {
  console.log('\n正在尝试使用RPC函数...');
  
  try {
    const { data, error } = await supabase.rpc('cancel_task', {
      task_id_param: task.task_id,
      user_id_param: task.user_id
    });
    
    if (error) {
      console.error('RPC调用失败:', error);
      console.log('\nDEBUG信息:');
      console.log('- 错误代码:', error.code);
      console.log('- 错误信息:', error.message);
      console.log('- 错误详情:', error.details);
      
      // 提供解决方案建议
      if (error.code === '42883') {
        console.log('\n解决方案建议: RPC函数不存在');
        console.log('请在Supabase控制台SQL编辑器中执行以下命令:');
        console.log(`
CREATE OR REPLACE FUNCTION cancel_task(task_id_param TEXT, user_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
    task_exists BOOLEAN;
    task_updatable BOOLEAN;
BEGIN
    -- 检查任务是否存在且属于该用户
    SELECT EXISTS (
        SELECT 1 FROM ai_images_creator_tasks 
        WHERE task_id = task_id_param AND user_id = user_id_param
    ) INTO task_exists;
    
    IF NOT task_exists THEN
        RETURN FALSE;
    END IF;
    
    -- 检查任务是否可以取消（只有pending和processing状态可以取消）
    SELECT EXISTS (
        SELECT 1 FROM ai_images_creator_tasks 
        WHERE task_id = task_id_param 
        AND user_id = user_id_param
        AND status IN ('pending', 'processing')
    ) INTO task_updatable;
    
    IF NOT task_updatable THEN
        RETURN FALSE;
    END IF;
    
    -- 更新任务状态为已取消
    UPDATE ai_images_creator_tasks
    SET status = 'cancelled',
        updated_at = TIMEZONE('utc'::text, NOW()),
        error_message = '用户主动取消任务'
    WHERE task_id = task_id_param
    AND user_id = user_id_param;
    
    RETURN TRUE;
END;
$$ language 'plpgsql';

-- 为任务取消函数设置安全策略
REVOKE ALL ON FUNCTION cancel_task FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_task TO authenticated;
        `);
      }
    } else {
      console.log('RPC调用成功!');
      console.log('函数返回:', data);
      if (data === true) {
        console.log('任务状态已更改为: cancelled');
      } else {
        console.log('函数返回false，可能无法取消任务');
      }
    }
  } catch (error) {
    console.error('测试RPC函数时发生错误:', error);
  }
  
  rl.close();
}

// 执行主函数
main(); 