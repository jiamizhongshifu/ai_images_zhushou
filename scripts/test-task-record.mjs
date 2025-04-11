#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { v4 as uuid } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 验证环境变量
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('错误: 环境变量缺失。请确保设置了 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// 创建 Supabase 客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testCreateTaskRecord() {
  try {
    console.log('测试创建任务记录');
    console.log('------------');
    
    // 获取现有用户
    console.log('正在查询用户...');
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers({});
    
    if (usersError) {
      console.error('查询用户失败:', usersError.message);
      return;
    }
    
    if (!users || users.users.length === 0) {
      console.error('没有找到任何用户');
      return;
    }
    
    // 获取第一个用户
    const user = users.users[0];
    console.log(`使用用户: ${user.email} (${user.id})`);
    
    // 生成ID和任务ID
    const recordId = uuid();
    const taskId = uuid();
    
    console.log('正在创建任务记录...');
    console.log(`记录ID: ${recordId}`);
    console.log(`任务ID: ${taskId}`);
    
    // 创建测试任务
    const { data, error } = await supabase
      .from('image_tasks')
      .insert({
        id: recordId, 
        user_id: user.id,
        task_id: taskId,
        status: 'pending',
        prompt: '测试任务 - ' + new Date().toISOString(),
        provider: 'dall-e-3',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select();
    
    if (error) {
      console.error('创建任务记录失败:', error.message);
      
      // 检查表结构
      console.log('\n正在检查表结构...');
      const { data: tableInfo, error: tableError } = await supabase
        .rpc('table_info', { table_name: 'image_tasks' });
      
      if (tableError) {
        console.error('获取表结构失败:', tableError.message);
      } else {
        console.log('\n表结构信息:');
        console.log(JSON.stringify(tableInfo, null, 2));
      }
      
      return;
    }
    
    console.log('\n✅ 任务记录创建成功!');
    console.log('返回数据:', JSON.stringify(data, null, 2));
    
    // 查询验证
    console.log('\n正在验证任务记录...');
    const { data: taskData, error: taskError } = await supabase
      .from('image_tasks')
      .select('*')
      .eq('id', recordId)
      .single();
    
    if (taskError) {
      console.error('查询任务记录失败:', taskError.message);
      return;
    }
    
    console.log('\n任务记录详情:');
    console.log(JSON.stringify(taskData, null, 2));
    
  } catch (error) {
    console.error('执行脚本过程中发生错误:', error.message);
  }
}

testCreateTaskRecord(); 