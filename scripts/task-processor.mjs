#!/usr/bin/env node

/**
 * 图像生成任务处理器 - 使用ESM格式
 * 
 * 该脚本会轮询数据库中的pending任务，并将它们发送到处理API进行处理
 * 
 * 使用方法:
 * node task-processor.mjs
 */

// 加载环境变量
import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

// 配置项
const POLL_INTERVAL = 5000; // 轮询间隔（毫秒）
const MAX_CONCURRENT_TASKS = 3; // 最大并发处理任务数
const SECRET_KEY = process.env.TASK_PROCESS_SECRET_KEY || 'your-secret-key-here';
const MAX_RETRIES = 3; // 任务处理最大重试次数
const TASK_TIMEOUT = 15 * 60 * 1000; // 任务超时时间（15分钟）

// Supabase配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('错误: 缺少必要的环境变量 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// 创建Supabase客户端
const supabase = createClient(supabaseUrl, supabaseKey);

// 当前正在处理的任务ID集合
const processingTasks = new Set();

// 任务处理次数记录
const taskRetryCount = new Map();

// 添加处理中任务的跟踪集合
const processingTaskIds = new Set();

// 添加数据库级别的任务锁定
async function lockTask(taskId) {
  console.log(`尝试对任务 ${taskId} 加锁...`);
  try {
    // 首先检查任务是否已经处于processing状态
    const { data: taskData, error: checkError } = await supabase
      .from('ai_images_creator_tasks')
      .select('status')
      .eq('task_id', taskId)
      .single();
      
    if (checkError) {
      console.error(`检查任务状态失败:`, checkError);
      return false;
    }
    
    // 如果任务不是pending状态，不处理
    if (taskData.status !== 'pending') {
      console.log(`任务 ${taskId} 已不是pending状态，当前状态: ${taskData.status}`);
      return false;
    }
    
    // 尝试将任务状态更新为processing
    const { data, error } = await supabase
      .from('ai_images_creator_tasks')
      .update({ 
        status: 'processing',
        processing_started_at: new Date().toISOString()
      })
      .eq('task_id', taskId)
      .eq('status', 'pending') // 乐观锁：确保只更新pending状态的任务
      .select('task_id');
    
    if (error) {
      console.error(`锁定任务失败:`, error);
      return false;
    }
    
    // 检查是否成功更新了记录
    return data && data.length > 0;
  } catch (error) {
    console.error(`锁定任务 ${taskId} 时出错:`, error);
    return false;
  }
}

// 修改process任务函数，增加锁定检查
async function processTask(taskId) {
  try {
    // 防止重复处理检查
    if (!processingTaskIds.has(taskId)) {
      console.warn(`任务 ${taskId} 不在处理中集合内，可能已被其他进程处理`);
      return;
    }
    
    // 获取任务详情 - 添加认证头部
    const detailResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/generate-image/status?taskId=${taskId}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}` // 添加认证头部
      }
    });
    if (!detailResponse.ok) {
      throw new Error(`获取任务详情失败: ${detailResponse.status}`);
    }
    
    const detailData = await detailResponse.json();
    if (!detailData.success) {
      throw new Error(`获取任务详情失败: ${detailData.error}`);
    }
    
    // 检查任务状态，确保它仍然在pending状态
    if (detailData.task && detailData.task.status !== 'pending') {
      console.log(`任务 ${taskId} 状态已变为 ${detailData.task.status}，跳过处理`);
      processingTaskIds.delete(taskId);
      return;
    }
    
    // 尝试在数据库级别锁定任务
    const locked = await lockTask(taskId);
    if (!locked) {
      console.log(`无法锁定任务 ${taskId}，可能已被其他处理器处理，跳过`);
      processingTaskIds.delete(taskId);
      return;
    }
    
    console.log(`成功锁定任务 ${taskId}，开始处理`);
    
    // 确定是否需要保持图片比例 - 只要有图片就保持比例
    const preserveAspectRatio = detailData.task && detailData.task.image_base64 ? true : false;
    
    // 准备请求体
    const requestBody = {
      taskId,
      secretKey: process.env.TASK_PROCESS_SECRET_KEY,
      preserveAspectRatio
    };
    
    // 发送请求处理任务 - 保留已有的请求头并添加认证
    console.log(`发送任务 ${taskId} 到处理API，保持比例: ${preserveAspectRatio}`);
    const processResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/generate-image/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}` // 添加认证头部
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!processResponse.ok) {
      throw new Error(`处理任务请求失败: ${processResponse.status}`);
    }
    
    const processData = await processResponse.json();
    
    if (!processData.success) {
      throw new Error(`处理任务失败: ${processData.error}`);
    }
    
    console.log(`任务 ${taskId} 处理请求已发送: ${processData.message}`);
    
  } catch (error) {
    console.error(`处理任务 ${taskId} 时出错:`, error);
    // 出错时也要从集合中移除
    processingTaskIds.delete(taskId);
    throw error; // 重新抛出错误以便调用者处理
  }
}

// 修改轮询函数，增强检查确保不重复处理
async function pollForTasks() {
  try {
    console.log(`[${new Date().toISOString()}] 查询待处理任务...`);
    
    // 获取所有待处理任务 - 添加认证头部
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/generate-image/pending-tasks`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}` // 添加认证头部
      }
    });
    
    if (!response.ok) {
      throw new Error(`获取待处理任务失败: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(`获取待处理任务失败: ${data.error}`);
    }
    
    // 过滤出未处理且不在处理中集合里的任务
    const pendingTasks = data.tasks.filter(task => 
      task.status === 'pending' && 
      !processingTaskIds.has(task.taskId) && 
      !processingTasks.has(task.taskId) // 双重检查
    );
    
    console.log(`找到 ${pendingTasks.length} 个待处理任务，当前处理中任务数: ${processingTaskIds.size}`);
    
    // 控制并发任务数
    const availableSlots = MAX_CONCURRENT_TASKS - processingTaskIds.size;
    const tasksToProcess = pendingTasks.slice(0, availableSlots);
    
    // 处理任务
    for (const task of tasksToProcess) {
      // 将任务添加到处理中集合
      processingTaskIds.add(task.taskId);
      processingTasks.add(task.taskId); // 双重标记
      
      console.log(`开始处理任务 ${task.taskId}...`);
      processTask(task.taskId).catch(error => {
        console.error(`处理任务 ${task.taskId} 时出错:`, error);
      }).finally(() => {
        // 处理完成后从集合中移除，无论成功失败
        setTimeout(() => {
          processingTaskIds.delete(task.taskId);
          processingTasks.delete(task.taskId); // 双重移除
          console.log(`任务 ${task.taskId} 处理完成，从跟踪集合中移除`);
        }, 10000); // 增加延迟到10秒，确保状态已更新
      });
    }
    
  } catch (error) {
    console.error('轮询任务时出错:', error);
  } finally {
    // 安排下一次轮询
    setTimeout(pollForTasks, POLL_INTERVAL);
  }
}

// 启动轮询循环
console.log('任务处理器已启动，开始轮询任务...');
console.log(`- 轮询间隔: ${POLL_INTERVAL}ms`);
console.log(`- 最大并发任务数: ${MAX_CONCURRENT_TASKS}`);
console.log(`- 最大重试次数: ${MAX_RETRIES}`);
console.log(`- 任务超时时间: ${TASK_TIMEOUT / 60000}分钟`);
console.log(`- Supabase URL: ${supabaseUrl}`);
console.log(`- 当前时间: ${new Date().toISOString()}`);

// 首次立即执行
pollForTasks();

// 优雅地处理进程终止
process.on('SIGINT', () => {
  console.log('任务处理器正在关闭...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('任务处理器正在关闭...');
  process.exit(0);
}); 