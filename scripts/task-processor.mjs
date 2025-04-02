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

// 处理单个任务
async function processSingleTask(taskId) {
  // 如果任务已在处理中，跳过
  if (processingTasks.has(taskId)) {
    return;
  }
  
  // 先检查任务当前状态，确保它仍然是pending状态
  const { data: taskData, error: taskError } = await supabase
    .from('ai_images_creator_tasks')
    .select('*')
    .eq('task_id', taskId)
    .single();
  
  if (taskError || !taskData) {
    console.error(`获取任务 ${taskId} 信息失败:`, taskError);
    return;
  }
  
  // 验证任务状态
  if (taskData.status !== 'pending') {
    console.log(`任务 ${taskId} 不是pending状态，当前状态: ${taskData.status}，跳过处理`);
    
    // 如果任务处于processing状态超过15分钟，标记为超时
    if (taskData.status === 'processing') {
      const processingStartedAt = new Date(taskData.processing_started_at || taskData.created_at);
      const now = new Date();
      const processingTime = now.getTime() - processingStartedAt.getTime();
      
      if (processingTime > TASK_TIMEOUT) {
        console.log(`任务 ${taskId} 处理超时，将状态更改为failed`);
        await supabase
          .from('ai_images_creator_tasks')
          .update({
            status: 'failed',
            error_message: '任务处理超时',
            updated_at: new Date().toISOString()
          })
          .eq('task_id', taskId);
        
        // 退还用户点数
        if (taskData.credits_deducted && !taskData.credits_refunded) {
          try {
            // 根据任务信息，更新用户点数
            const { data: creditsData, error: creditsError } = await supabase
              .from('ai_images_creator_credits')
              .select('credits')
              .eq('user_id', taskData.user_id)
              .single();
            
            if (!creditsError && creditsData) {
              // 增加一个点数
              const newCredits = (creditsData.credits || 0) + 1;
              
              await supabase
                .from('ai_images_creator_credits')
                .update({ 
                  credits: newCredits,
                  updated_at: new Date().toISOString()
                })
                .eq('user_id', taskData.user_id);
              
              // 标记任务点数已退还
              await supabase
                .from('ai_images_creator_tasks')
                .update({ 
                  credits_refunded: true,
                  updated_at: new Date().toISOString()
                })
                .eq('task_id', taskId);
              
              console.log(`任务 ${taskId} 超时，已退还用户 ${taskData.user_id} 点数`);
            }
          } catch (refundError) {
            console.error(`退还用户点数失败:`, refundError);
          }
        }
      }
    }
    
    return;
  }
  
  // 检查任务重试次数
  const retryCount = taskRetryCount.get(taskId) || 0;
  if (retryCount >= MAX_RETRIES) {
    console.log(`任务 ${taskId} 已达到最大重试次数 ${MAX_RETRIES}，将状态更改为failed`);
    await supabase
      .from('ai_images_creator_tasks')
      .update({
        status: 'failed',
        error_message: `已达到最大重试次数(${MAX_RETRIES})`,
        updated_at: new Date().toISOString()
      })
      .eq('task_id', taskId);
    
    // 退还用户点数
    if (taskData.credits_deducted && !taskData.credits_refunded) {
      try {
        // 类似上面的退款逻辑
        const { data: creditsData, error: creditsError } = await supabase
          .from('ai_images_creator_credits')
          .select('credits')
          .eq('user_id', taskData.user_id)
          .single();
        
        if (!creditsError && creditsData) {
          const newCredits = (creditsData.credits || 0) + 1;
          
          await supabase
            .from('ai_images_creator_credits')
            .update({ 
              credits: newCredits,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', taskData.user_id);
          
          await supabase
            .from('ai_images_creator_tasks')
            .update({ 
              credits_refunded: true,
              updated_at: new Date().toISOString()
            })
            .eq('task_id', taskId);
          
          console.log(`任务 ${taskId} 重试失败，已退还用户 ${taskData.user_id} 点数`);
        }
      } catch (refundError) {
        console.error(`退还用户点数失败:`, refundError);
      }
    }
    
    return;
  }
  
  // 添加保持图片比例的处理逻辑
  let body = {
    taskId,
    secretKey: SECRET_KEY
  };
  
  // 如果有上传图片，分析图片比例并添加size参数
  if (taskData.image_base64 && taskData.image_base64.includes('base64,')) {
    try {
      // 提取图片信息（优化：这里可以添加图片比例分析的逻辑）
      console.log(`任务 ${taskId} 包含上传图片，将保持比例生成图像`);
      body.preserveAspectRatio = true;
    } catch (error) {
      console.error(`分析图片比例失败:`, error);
    }
  }
  
  processingTasks.add(taskId);
  console.log(`开始处理任务: ${taskId} (重试次数: ${retryCount})`);
  taskRetryCount.set(taskId, retryCount + 1);
  
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/generate-image/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    
    if (!data.success) {
      console.error(`处理任务 ${taskId} 失败:`, data.error || '未知错误');
    } else {
      console.log(`任务 ${taskId} 处理请求已发送:`, data.message);
    }
  } catch (error) {
    console.error(`处理任务 ${taskId} 时出错:`, error);
  } finally {
    // 在一段时间后从处理中集合移除任务
    setTimeout(() => {
      processingTasks.delete(taskId);
    }, 30000); // 30秒后允许再次尝试处理该任务
  }
}

// 主轮询函数
async function pollTasks() {
  try {
    // 如果已达到最大并发任务数，则跳过本次轮询
    if (processingTasks.size >= MAX_CONCURRENT_TASKS) {
      console.log(`当前处理中任务数 ${processingTasks.size} 已达上限，等待下次轮询`);
      return;
    }
    
    // 查询待处理任务
    const { data: tasks, error } = await supabase
      .from('ai_images_creator_tasks')
      .select('task_id, created_at, status')
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: true })
      .limit(MAX_CONCURRENT_TASKS * 2); // 获取更多任务以便处理可能的状态变化
    
    if (error) {
      console.error('查询待处理任务失败:', error);
      return;
    }
    
    // 过滤出真正的pending任务
    const pendingTasks = tasks.filter(task => task.status === 'pending');
    console.log(`找到 ${pendingTasks.length} 个待处理任务, ${tasks.length - pendingTasks.length} 个处理中任务`);
    
    // 处理任务
    if (pendingTasks && pendingTasks.length > 0) {
      for (const task of pendingTasks) {
        // 检查是否已达到最大并发数
        if (processingTasks.size >= MAX_CONCURRENT_TASKS) {
          break;
        }
        
        // 开始处理任务
        processSingleTask(task.task_id);
      }
    }
    
    // 检查处理中但可能已超时的任务
    const tasksInProcessing = tasks.filter(task => task.status === 'processing');
    for (const task of tasksInProcessing) {
      await processSingleTask(task.task_id); // 会检查是否超时
    }
    
  } catch (error) {
    console.error('轮询任务时出错:', error);
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
pollTasks();

// 然后设置定时轮询
setInterval(pollTasks, POLL_INTERVAL);

// 优雅地处理进程终止
process.on('SIGINT', () => {
  console.log('任务处理器正在关闭...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('任务处理器正在关闭...');
  process.exit(0);
}); 