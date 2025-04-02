#!/usr/bin/env node

/**
 * 数据库SQL测试脚本
 * 
 * 这个脚本会测试数据库的连接和基本功能
 */

// 加载环境变量
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

// Supabase配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('错误: 缺少必要的环境变量 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// 创建Supabase客户端
const supabase = createClient(supabaseUrl, supabaseKey);

async function runTests() {
  console.log('开始运行数据库测试...');
  console.log(`使用URL: ${supabaseUrl}`);
  
  try {
    // 测试1: 检查credits表
    console.log('\n测试1: 检查credits表结构');
    const { data: tableInfo, error: tableError } = await supabase
      .from('ai_images_creator_credits')
      .select('*')
      .limit(1);
    
    if (tableError) {
      console.error('访问credits表失败:', tableError);
    } else {
      console.log('✓ 成功访问credits表');
      console.log('表结构示例:', tableInfo);
    }
    
    // 测试2: 检查RPC函数
    console.log('\n测试2: 检查decrement RPC函数');
    try {
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('decrement', { x: 5 });
      
      if (rpcError) {
        console.error('调用decrement函数失败:', rpcError);
      } else {
        console.log('✓ 成功调用decrement函数');
        console.log('结果:', rpcData, '(应该是4)');
      }
    } catch (err) {
      console.error('调用RPC函数时发生异常:', err);
    }
    
    // 测试3: 检查safe_decrement_credits函数
    console.log('\n测试3: 检查safe_decrement_credits函数');
    try {
      // 使用一个假的用户ID进行测试
      const testUserId = '93e24e0f-d925-4f1e-9397-57ce7f353681';
      
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('safe_decrement_credits', { user_id_param: testUserId });
      
      if (rpcError) {
        console.error('调用safe_decrement_credits函数失败:', rpcError);
      } else {
        console.log('✓ 成功调用safe_decrement_credits函数');
        console.log('结果:', rpcData);
      }
    } catch (err) {
      console.error('调用safe_decrement_credits函数时发生异常:', err);
    }
    
    // 测试4: 检查任务表
    console.log('\n测试4: 检查任务表中的失败任务');
    const { data: failedTasks, error: taskError } = await supabase
      .from('ai_images_creator_tasks')
      .select('*')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (taskError) {
      console.error('查询失败任务出错:', taskError);
    } else {
      console.log(`✓ 找到 ${failedTasks.length} 个失败任务`);
      failedTasks.forEach(task => {
        console.log(`- 任务ID: ${task.task_id}`);
        console.log(`  错误信息: ${task.error_message}`);
        console.log(`  创建时间: ${task.created_at}`);
        console.log(`  用户ID: ${task.user_id}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('测试过程中出错:', error);
  }
  
  console.log('\n测试完成');
}

// 运行测试
runTests(); 