#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
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

async function listUsers() {
  try {
    console.log('正在获取用户列表...');
    
    // 获取用户信息 - 直接从auth.users表获取
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers({});
    
    if (authError) {
      console.error('获取用户列表失败:', authError.message);
      return;
    }
    
    const users = authUsers.users || [];
    
    if (!users || users.length === 0) {
      console.log('没有找到任何用户');
      return;
    }
    
    console.log(`找到 ${users.length} 个用户:\n`);
    
    // 输出用户信息
    users.forEach((user, index) => {
      console.log(`[${index + 1}] ID: ${user.id}`);
      console.log(`    邮箱: ${user.email || '未设置'}`);
      console.log(`    电话: ${user.phone || '未设置'}`);
      console.log(`    创建时间: ${new Date(user.created_at).toLocaleString()}`);
      console.log('    --------------------------');
    });
    
    // 获取用户点数
    console.log('\n正在获取用户点数信息...');
    const { data: credits, error: creditsError } = await supabase
      .from('ai_images_creator_credits')
      .select('*');
    
    if (creditsError) {
      console.error('获取用户点数失败:', creditsError.message);
      return;
    }
    
    if (credits && credits.length > 0) {
      console.log(`\n用户点数信息 (共 ${credits.length} 条记录):`);
      credits.forEach(credit => {
        const user = users.find(u => u.id === credit.user_id);
        console.log(`用户: ${user ? user.email || user.id : credit.user_id}`);
        console.log(`点数: ${credit.credits}`);
        console.log(`更新时间: ${new Date(credit.updated_at).toLocaleString()}`);
        console.log('-------------------');
      });
    } else {
      console.log('没有找到任何用户点数记录');
    }
    
    // 获取任务信息
    console.log('\n正在获取任务信息...');
    const { data: tasks, error: tasksError } = await supabase
      .from('image_tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (tasksError) {
      console.error('获取任务失败:', tasksError.message);
      return;
    }
    
    if (tasks && tasks.length > 0) {
      console.log(`\n最近的任务 (共 ${tasks.length} 条记录):`);
      tasks.forEach(task => {
        const user = users.find(u => u.id === task.user_id);
        console.log(`任务ID: ${task.task_id}`);
        console.log(`用户: ${user ? user.email || user.id : task.user_id}`);
        console.log(`状态: ${task.status}`);
        console.log(`创建时间: ${new Date(task.created_at).toLocaleString()}`);
        console.log('-------------------');
      });
    } else {
      console.log('没有找到任何任务记录');
    }
    
  } catch (error) {
    console.error('操作失败:', error.message);
  }
}

listUsers(); 