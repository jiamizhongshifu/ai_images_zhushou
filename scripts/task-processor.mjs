#!/usr/bin/env node

/**
 * 图像生成任务处理器 - 使用ESM格式
 * 
 * 该脚本会轮询数据库中的pending任务，并将它们发送到处理API进行处理
 * 
 * 使用方法:
 *   node scripts/task-processor.mjs
 */

// 加载环境变量
import dotenv from 'dotenv';

// 检查是否已经加载环境变量，避免重复加载
if (!process.env.__ENV_LOADED) {
  console.log('[环境变量] 首次加载环境变量');
  dotenv.config();
  process.env.__ENV_LOADED = 'true';
} else {
  console.log('[环境变量] 环境变量已加载，跳过');
}

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { EventEmitter } from 'events';

// 设置事件监听器最大数量，避免警告
EventEmitter.defaultMaxListeners = 20;

// 启用网络超时和代理请求选项
const fetchOptions = {
  timeout: 30000, // 30秒全局超时
  agent: null // 使用默认代理
};

// 创建请求超时信号的函数，兼容不同Node.js版本
function createTimeoutSignal(ms) {
  // 检查是否支持AbortSignal.timeout (Node.js >= v17.3.0)
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  } else {
    // 兼容旧版本Node.js
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  }
}

// 配置项
const POLL_INTERVAL = 5000; // 轮询间隔（毫秒）
const MAX_CONCURRENT_TASKS = 3; // 最大并发处理任务数
const SECRET_KEY = process.env.TASK_PROCESS_SECRET_KEY || 'your-secret-key-here';
const MAX_RETRIES = 3; // 任务处理最大重试次数
const TASK_TIMEOUT = 10 * 60 * 1000; // 任务超时时间（10分钟）
const TASK_PROCESSING_MAX_TIME = 15 * 60 * 1000; // 任务处理最长时间（15分钟，减少等待时间）

// 新增API调用选项，添加更多的超时保护
const API_CALL_TIMEOUT = 60000; // API调用超时时间，1分钟
const API_RETRY_DELAY = 3000; // API重试延迟，3秒
const MAX_API_RETRIES = 2; // 最大API重试次数

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

// 任务处理开始时间记录
const taskStartTimes = new Map();

// 任务超时设置
const TASK_PROCESSING_TIMEOUT = 15 * 60 * 1000; // 15分钟超时
const TASK_MAX_AGE = 30 * 60 * 1000; // 30分钟最大生命周期

// 添加检查超时任务的函数
async function checkAndHandleTimeoutTasks() {
  try {
    console.log(`[${new Date().toISOString()}] 检查超时任务...`);
    
    const now = Date.now();
    
    // 检查处理中的任务是否超时
    for (const [taskId, startTime] of taskStartTimes.entries()) {
      const processingTime = now - startTime;
      
      // 如果任务处理时间超过最大值
      if (processingTime > TASK_PROCESSING_MAX_TIME) {
        console.warn(`任务 ${taskId} 处理时间超过 ${TASK_PROCESSING_MAX_TIME / 60000} 分钟，尝试检查并取消...`);
        
        try {
          // 获取任务当前状态
          const statusResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/generate-image/status?taskId=${taskId}`, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}`,
              'X-Silent-Mode': 'true'
            },
            ...fetchOptions,
            signal: createTimeoutSignal(15000)
          });
          
          if (!statusResponse.ok) {
            console.error(`检查任务 ${taskId} 状态失败: HTTP ${statusResponse.status}`);
            continue;
          }
          
          const statusData = await statusResponse.json().catch(err => {
            console.error(`解析任务 ${taskId} 状态响应失败:`, err);
            return { success: false };
          });
          
          if (!statusData.success || !statusData.task) {
            console.error(`获取任务 ${taskId} 状态失败:`, statusData.error || '未知错误');
            continue;
          }
          
          // 如果任务仍在处理中，尝试取消
          if (statusData.task.status === 'processing' || statusData.task.status === 'pending') {
            console.warn(`任务 ${taskId} 处理超时，当前状态: ${statusData.task.status}，尝试自动取消...`);
            
            // 直接在数据库中标记为超时取消
            const supabase = createSimplifiedClient(supabaseUrl, supabaseKey);
            const { error: updateError } = await supabase
              .from('ai_images_creator_tasks')
              .update({
                status: 'failed',
                error_message: `处理超时: 任务处理时间超过 ${TASK_PROCESSING_MAX_TIME / 60000} 分钟，系统自动取消`,
                completed_at: new Date().toISOString()
              })
              .eq('task_id', taskId);
              
            if (updateError) {
              console.error(`标记超时任务 ${taskId} 为失败状态时出错:`, updateError);
            } else {
              console.log(`已将超时任务 ${taskId} 自动标记为失败`);
            }
            
            // 执行退款
            try {
              await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/generate-image/refund`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}`,
                  'X-Silent-Mode': 'true'
                },
                body: JSON.stringify({ taskId, secretKey: process.env.TASK_PROCESS_SECRET_KEY }),
                ...fetchOptions,
                signal: createTimeoutSignal(15000)
              });
              console.log(`已为超时任务 ${taskId} 执行退款`);
            } catch (refundError) {
              console.error(`为超时任务 ${taskId} 执行退款时出错:`, refundError);
            }
          } else {
            console.log(`任务 ${taskId} 已处于最终状态: ${statusData.task.status}，无需取消`);
          }
          
          // 无论结果如何，都从跟踪记录中移除
          taskStartTimes.delete(taskId);
          
        } catch (error) {
          console.error(`处理超时任务 ${taskId} 时出错:`, error);
        }
      }
    }
  } catch (error) {
    console.error('检查超时任务时出错:', error);
  }
}

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

// 修改处理任务函数，增加更多错误处理和超时保护
async function processTask(taskId) {
  // 设置整体处理超时
  const processingTimeout = setTimeout(() => {
    console.error(`处理任务 ${taskId} 超时，强制终止`);
    // 这里我们不使用await，因为这是一个超时处理函数
    updateTaskAsFailed(taskId, "任务处理超时，系统自动终止");
  }, TASK_TIMEOUT);
  
  try {
    // 防止重复处理检查
    if (!processingTaskIds.has(taskId)) {
      console.warn(`任务 ${taskId} 不在处理中集合内，可能已被其他进程处理`);
      return;
    }
    
    console.log(`开始获取任务 ${taskId} 的详细信息...`);
    // 获取任务详情 - 添加认证头部
    const detailResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/generate-image/status?taskId=${taskId}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}`, // 添加认证头部
        'X-Silent-Mode': 'true' // 添加静默模式头部
      },
      ...fetchOptions, // 使用全局超时配置
      signal: createTimeoutSignal(30000) // 使用新创建的信号
    });
    
    if (!detailResponse.ok) {
      const errorText = await detailResponse.text().catch(() => '无法获取错误详情');
      throw new Error(`获取任务详情失败: HTTP状态 ${detailResponse.status}, 响应: ${errorText}`);
    }
    
    let detailData;
    try {
      detailData = await detailResponse.json();
    } catch (jsonError) {
      throw new Error(`解析任务详情响应失败: ${jsonError.message}, 原始响应: ${await detailResponse.text().catch(() => '无法获取原始响应')}`);
    }
    
    if (!detailData.success) {
      throw new Error(`获取任务详情业务逻辑失败: ${detailData.error || '未知错误'}`);
    }
    
    if (!detailData.task) {
      throw new Error(`获取任务详情成功但缺少任务数据`);
    }
    
    // 检查任务状态，确保它仍然在pending状态
    if (detailData.task.status !== 'pending') {
      console.log(`任务 ${taskId} 状态已变为 ${detailData.task.status}，跳过处理`);
      processingTaskIds.delete(taskId);
      return;
    }
    
    // 尝试在数据库级别锁定任务
    console.log(`尝试锁定任务 ${taskId}...`);
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
    
    // 记录详细任务参数（注意不要记录敏感数据）
    console.log(`发送任务 ${taskId} 到处理API，参数: ${JSON.stringify({
      taskId,
      preserveAspectRatio,
      hasImage: !!detailData.task.image_base64,
      prompt: detailData.task.prompt ? `${detailData.task.prompt.substring(0, 20)}...` : '无',
      apiUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/api/generate-image/process`
    })}`);
    
    // 添加重试逻辑和超时保护
    let retryCount = 0;
    let success = false;
    let lastError = null;
    
    while (retryCount < MAX_API_RETRIES && !success) {
      try {
        // 使用带超时的fetch请求
        const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/generate-image/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}`
          },
          body: JSON.stringify({
            taskId,
            secretKey: process.env.TASK_PROCESS_SECRET_KEY,
            preserveAspectRatio: false
          }),
          signal: AbortSignal.timeout(API_CALL_TIMEOUT) // 使用1分钟超时
        });
        
        // 处理响应
        if (!response.ok) {
          const responseText = await response.text();
          throw new Error(`处理任务请求失败: HTTP ${response.status} ${response.statusText}, 响应: ${responseText}`);
        }
        
        const processData = await response.json();
        
        // 检查处理结果
        if (processData.success) {
          console.log(`任务 ${taskId} 处理请求成功: ${processData.message || '操作成功'}`);
          success = true;
        } else {
          // 检查是否是"任务已处于processing状态"的情况 - 同时检查error和message字段
          if (
            (processData.error && 
             (processData.error.includes('已处于processing状态') || 
              processData.error.includes('already in processing state'))) ||
            (processData.message && 
             (processData.message.includes('已处于 processing 状态') ||
              processData.message.includes('已处于processing状态') ||
              processData.message.includes('already in processing state')))
          ) {
            console.log(`任务 ${taskId} 已在处理中，继续监控其状态...`);
            // 不将其视为错误，而是视为正常情况，继续监控任务状态
            return;
          } else if (
            (processData.error && 
             (processData.error.includes('已完成') || 
              processData.error.includes('already completed'))) ||
            (processData.message && 
             (processData.message.includes('已完成') || 
              processData.message.includes('already completed')))
          ) {
            console.log(`任务 ${taskId} 已完成，无需再次处理`);
            // 不将其视为错误，而是视为正常情况
            return;
          } else {
            // 其他业务逻辑错误，作为真正的错误处理
            const errorMessage = processData.error || processData.message || '未知错误';
            console.log(`任务 ${taskId} 处理返回业务错误: ${errorMessage}`);
            throw new Error(`处理任务业务逻辑失败: ${errorMessage}`);
          }
        }
      } catch (error) {
        lastError = error;
        retryCount++;
        
        if (retryCount < MAX_API_RETRIES) {
          console.log(`处理任务 ${taskId} 失败，将在 ${API_RETRY_DELAY}ms 后重试 (${retryCount}/${MAX_API_RETRIES}): ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, API_RETRY_DELAY));
        } else {
          console.error(`处理任务 ${taskId} 失败，已达到最大重试次数: ${error.message}`);
        }
      }
    }
    
    if (!success) {
      throw lastError || new Error('任务处理失败，已达到最大重试次数');
    }
    
  } catch (error) {
    // 捕获更详细的错误信息
    console.error(`处理任务 ${taskId} 时出错:`, {
      message: error.message,
      stack: error.stack,
      cause: error.cause,
      name: error.name,
      code: error.code
    });
    
    // 将错误报告到数据库
    try {
      console.log(`尝试更新任务 ${taskId} 的状态为失败，错误信息: ${error.message}`);
      const supabase = createSimplifiedClient(supabaseUrl, supabaseKey);
      
      // 先获取任务当前状态，只有在特定状态才标记为失败
      const checkResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/generate-image/status?taskId=${taskId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}`,
          'X-Silent-Mode': 'true'
        },
        signal: createTimeoutSignal(30000)
      }).catch(e => {
        console.error(`获取任务状态失败:`, e);
        return { ok: false };
      });
      
      if (checkResponse.ok) {
        const checkData = await checkResponse.json().catch(() => ({ success: false }));
        
        if (checkData.success && checkData.task) {
          const currentStatus = checkData.task.status;
          
          // 只有处于pending或processing状态的任务才允许更新为失败状态
          if (currentStatus === 'pending' || currentStatus === 'processing') {
            console.log(`任务 ${taskId} 当前状态为 ${currentStatus}，将更新为失败状态`);
            
            // 更新数据库状态
            await supabase
              .from('ai_images_creator_tasks')
              .update({
                status: 'failed',
                error_message: `处理失败: ${error.message || '未知错误'}`,
                completed_at: new Date().toISOString()
              })
              .eq('task_id', taskId);
            
            console.log(`已将任务 ${taskId} 标记为失败，并记录错误信息`);
            
            // 尝试退还用户点数
            await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/generate-image/refund`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}`,
                'X-Silent-Mode': 'true'
              },
              body: JSON.stringify({ taskId, secretKey: process.env.TASK_PROCESS_SECRET_KEY }),
              ...fetchOptions,
              signal: createTimeoutSignal(15000)
            }).catch(refundError => {
              console.error(`为任务 ${taskId} 执行退款时出错:`, refundError);
            });
          } else {
            console.log(`任务 ${taskId} 已处于 ${currentStatus} 状态，不再将其标记为失败`);
          }
        } else {
          console.error(`获取任务 ${taskId} 状态失败，无法更新状态`);
        }
      } else {
        console.error(`获取任务 ${taskId} 状态请求失败，无法更新状态`);
      }
    } catch (dbError) {
      console.error(`无法更新任务 ${taskId} 的错误状态:`, dbError);
    }
    
    // 出错时也要从集合中移除
    processingTaskIds.delete(taskId);
    throw error; // 重新抛出错误以便调用者处理
  } finally {
    // 确保无论成功失败都会清除超时
    clearTimeout(processingTimeout);
  }
}

// 新增帮助函数来更新失败的任务
async function updateTaskAsFailed(taskId, errorMessage) {
  try {
    console.log(`尝试将任务 ${taskId} 标记为失败: ${errorMessage}`);
    
    // 获取任务当前状态
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: task, error: taskError } = await supabase
      .from('ai_images_creator_tasks')
      .select('*')
      .eq('task_id', taskId)
      .single();
    
    if (taskError) {
      console.error(`获取任务 ${taskId} 失败:`, taskError);
      return;
    }
    
    // 如果任务状态是pending或processing，才更新为失败
    if (task.status === 'pending' || task.status === 'processing') {
      // 更新任务状态
      const { error: updateError } = await supabase
        .from('ai_images_creator_tasks')
        .update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString()
        })
        .eq('task_id', taskId);
      
      if (updateError) {
        console.error(`更新任务 ${taskId} 状态失败:`, updateError);
        return;
      }
      
      console.log(`已将任务 ${taskId} 标记为失败`);
      
      // 退还用户点数
      try {
        await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/generate-image/refund`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}`
          },
          body: JSON.stringify({
            taskId,
            secretKey: process.env.TASK_PROCESS_SECRET_KEY
          }),
          signal: AbortSignal.timeout(15000)
        });
        
        console.log(`已为任务 ${taskId} 执行退款`);
      } catch (refundError) {
        console.error(`为任务 ${taskId} 执行退款失败:`, refundError);
      }
    } else {
      console.log(`任务 ${taskId} 当前状态为 ${task.status}，不需要更新为失败`);
    }
  } catch (error) {
    console.error(`更新任务 ${taskId} 为失败状态时出错:`, error);
  }
}

// 修改轮询函数，增强检查确保不重复处理
async function pollForTasks() {
  try {
    console.log(`[${new Date().toISOString()}] 查询待处理任务...`);
    
    // 获取所有待处理任务 - 添加认证头部
    let response;
    try {
      response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/generate-image/pending-tasks`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}`, // 添加认证头部
          'X-Silent-Mode': 'true' // 添加静默模式头部
        },
        ...fetchOptions, // 使用全局超时配置
        signal: createTimeoutSignal(30000) // 使用新创建的信号
      });
    } catch (fetchError) {
      console.error(`获取待处理任务请求失败:`, {
        message: fetchError.message,
        code: fetchError.code,
        type: fetchError.type,
        cause: fetchError.cause
      });
      throw new Error(`获取待处理任务请求失败: ${fetchError.message}`);
    }
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '无法获取错误详情');
      throw new Error(`获取待处理任务失败: HTTP ${response.status} ${response.statusText}, 响应: ${errorText}`);
    }
    
    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      throw new Error(`解析待处理任务响应失败: ${jsonError.message}, 原始响应: ${await response.text().catch(() => '无法获取原始响应')}`);
    }
    
    if (!data.success) {
      throw new Error(`获取待处理任务业务逻辑失败: ${data.error || '未知错误'}`);
    }
    
    // 验证任务数据的有效性
    if (!Array.isArray(data.tasks)) {
      console.warn(`获取到的任务不是数组类型: ${typeof data.tasks}`);
      data.tasks = [];
    }
    
    // 清理长时间处于处理中但可能已经完成或失败的任务
    await cleanupStaleTasks();
    
    // 过滤出未处理且不在处理中集合里的任务
    const pendingTasks = data.tasks.filter(task => {
      // 确保任务有有效的ID
      if (!task.taskId) {
        console.warn(`发现无效任务，缺少taskId: ${JSON.stringify(task)}`);
        return false;
      }
      
      // 检查处理状态
      return task.status === 'pending' && 
        !processingTaskIds.has(task.taskId) && 
        !processingTasks.has(task.taskId); // 双重检查
    });
    
    console.log(`找到 ${pendingTasks.length} 个待处理任务，当前处理中任务数: ${processingTaskIds.size}`);
    if (pendingTasks.length > 0) {
      console.log(`待处理任务:`, pendingTasks.map(t => ({
        taskId: t.taskId,
        status: t.status,
        createdAt: t.created_at,
        userId: t.user_id
      })));
    }
    
    // 控制并发任务数
    const availableSlots = MAX_CONCURRENT_TASKS - processingTaskIds.size;
    const tasksToProcess = pendingTasks.slice(0, availableSlots);
    
    if (tasksToProcess.length > 0) {
      console.log(`将处理 ${tasksToProcess.length} 个任务，可用槽位: ${availableSlots}`);
    }
    
    // 处理任务
    for (const task of tasksToProcess) {
      console.log(`准备处理任务 ${task.taskId}...`);
      
      // 再次确认任务未被处理，避免并发问题
      if (processingTaskIds.has(task.taskId) || processingTasks.has(task.taskId)) {
        console.log(`任务 ${task.taskId} 已被其他实例标记为处理中，跳过`);
        continue;
      }
      
      // 将任务添加到处理中集合
      processingTaskIds.add(task.taskId);
      processingTasks.add(task.taskId); // 双重标记
      
      // 记录任务处理的开始时间，用于超时检测
      taskStartTimes.set(task.taskId, Date.now());
      
      console.log(`开始处理任务 ${task.taskId}...`);
      
      processTask(task.taskId).catch(error => {
        console.error(`处理任务 ${task.taskId} 时出错:`, {
          message: error.message,
          stack: error.stack
        });
      }).finally(() => {
        // 处理完成后从集合中移除，无论成功失败
        setTimeout(() => {
          const removed = processingTaskIds.delete(task.taskId);
          const removedDuplicate = processingTasks.delete(task.taskId); // 双重移除
          taskStartTimes.delete(task.taskId); // 移除开始时间记录
          
          console.log(`任务 ${task.taskId} 处理完成，从跟踪集合中移除，结果: primary=${removed}, secondary=${removedDuplicate}`);
          
          // 主动获取任务最新状态并记录
          fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/generate-image/status?taskId=${task.taskId}`, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}`,
              'X-Silent-Mode': 'true' // 添加静默模式头部
            },
            ...fetchOptions, // 使用全局配置
            signal: createTimeoutSignal(15000) // 使用新创建的信号
          })
          .then(response => response.json())
          .then(data => {
            if (data.success && data.task) {
              console.log(`任务 ${task.taskId} 当前状态: ${data.task.status}`);
            }
          })
          .catch(error => {
            console.error(`获取任务 ${task.taskId} 最终状态出错:`, error);
          });
        }, 15000); // 增加延迟到15秒，确保状态已更新
      });
    }
    
  } catch (error) {
    console.error('轮询任务时出错:', {
      message: error.message,
      stack: error.stack,
      cause: error.cause,
      name: error.name
    });
  } finally {
    // 安排下一次轮询
    setTimeout(pollForTasks, POLL_INTERVAL);
  }
}

// 轮询循环
console.log('==============================================');
console.log(`任务处理器已启动，版本: 1.2.0 (优化版)`);
console.log(`启动时间: ${new Date().toISOString()}`);
console.log('==============================================');
console.log(`- 轮询间隔: ${POLL_INTERVAL}ms`);
console.log(`- 最大并发任务数: ${MAX_CONCURRENT_TASKS}`);
console.log(`- 最大重试次数: ${MAX_RETRIES}`);
console.log(`- 任务超时时间: ${TASK_TIMEOUT / 60000}分钟`);
console.log(`- 处理超时时间: ${TASK_PROCESSING_TIMEOUT / 60000}分钟`);
console.log(`- 任务最大生命周期: ${TASK_MAX_AGE / 60000}分钟`);
console.log(`- Supabase URL: ${supabaseUrl}`);
console.log(`- 当前时间: ${new Date().toISOString()}`);
console.log('==============================================');

// 周期性状态报告
setInterval(() => {
  const now = new Date().toISOString();
  console.log('==============================================');
  console.log(`系统状态报告 - ${now}`);
  console.log(`- 处理中任务数: ${processingTaskIds.size}`);
  
  // 报告处理中任务的详情
  if (processingTaskIds.size > 0) {
    console.log('- 当前处理中任务:');
    let index = 1;
    for (const [taskId, startTime] of taskStartTimes.entries()) {
      const ageInSeconds = Math.round((Date.now() - startTime) / 1000);
      console.log(`  ${index}. 任务ID: ${taskId}, 已处理: ${ageInSeconds}秒`);
      index++;
    }
  }
  
  console.log('==============================================');
}, 5 * 60 * 1000); // 每5分钟报告一次

// 首次立即执行
pollForTasks();

// 创建一个简化的Supabase客户端，用于错误处理中更新数据库
function createSimplifiedClient(url, key) {
  return {
    from: (table) => ({
      update: (data) => ({
        eq: (column, value) => {
          try {
            console.log(`将更新表 ${table} 中 ${column}=${value} 的记录，数据:`, data);
            
            // 使用已经创建的supabase客户端实例来执行实际操作
            return supabase
              .from(table)
              .update(data)
              .eq(column, value);
          } catch (error) {
            console.error(`执行数据库更新操作失败:`, error);
            return Promise.resolve({ data: null, error: error });
          }
        }
      })
    })
  };
}

// 优雅地处理进程终止
process.on('SIGINT', () => {
  console.log('任务处理器正在关闭...');
  // 清理资源
  processingTaskIds.clear();
  processingTasks.clear();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('任务处理器正在关闭...');
  // 清理资源
  processingTaskIds.clear();
  processingTasks.clear();
  process.exit(0);
});

// 添加未捕获异常处理
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  // 记录但不退出，保持服务运行
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
  // 记录但不退出，保持服务运行
});

// 清理长时间处于处理中但可能已经完成或失败的任务
async function cleanupStaleTasks() {
  const now = Date.now();
  const taskIdsToCheck = [];
  
  // 收集所有可能超时的任务
  for (const [taskId, startTime] of taskStartTimes.entries()) {
    const taskAge = now - startTime;
    
    if (taskAge > TASK_PROCESSING_TIMEOUT) {
      taskIdsToCheck.push(taskId);
      console.log(`检测到可能超时的任务: ${taskId}, 已处理 ${Math.round(taskAge / 1000)} 秒`);
    }
  }
  
  if (taskIdsToCheck.length === 0) {
    return;
  }
  
  console.log(`共有 ${taskIdsToCheck.length} 个任务需要检查超时状态`);
  
  // 逐个检查任务状态并处理
  for (const taskId of taskIdsToCheck) {
    try {
      // 获取任务当前状态
      const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/generate-image/status?taskId=${taskId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}`,
          'X-Silent-Mode': 'true'
        },
        ...fetchOptions,
        signal: createTimeoutSignal(15000)
      });
      
      if (!response.ok) {
        console.error(`获取任务 ${taskId} 状态失败: HTTP ${response.status}`);
        continue;
      }
      
      const data = await response.json().catch(() => ({ success: false }));
      
      if (!data.success || !data.task) {
        console.error(`获取任务 ${taskId} 数据失败`);
        continue;
      }
      
      const taskStatus = data.task.status;
      console.log(`超时检查 - 任务 ${taskId} 当前状态: ${taskStatus}`);
      
      // 如果任务已经是终态，直接从跟踪集合中移除
      if (taskStatus === 'completed' || taskStatus === 'failed' || taskStatus === 'cancelled') {
        processingTaskIds.delete(taskId);
        processingTasks.delete(taskId);
        taskStartTimes.delete(taskId);
        console.log(`任务 ${taskId} 已是终态(${taskStatus})，从处理集合中移除`);
        continue;
      }
      
      // 如果任务仍在处理中且已超时，尝试取消
      const taskAge = now - taskStartTimes.get(taskId);
      if ((taskStatus === 'pending' || taskStatus === 'processing') && taskAge > TASK_MAX_AGE) {
        console.log(`任务 ${taskId} 处理时间过长(${Math.round(taskAge / 1000)}秒)，尝试取消...`);
        
        // 尝试取消任务
        try {
          const cancelResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/generate-image/cancel`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}`,
              'X-Silent-Mode': 'true'
            },
            body: JSON.stringify({ 
              taskId,
              secretKey: process.env.TASK_PROCESS_SECRET_KEY,
              reason: '任务处理超时，系统自动取消'
            }),
            ...fetchOptions,
            signal: createTimeoutSignal(15000)
          });
          
          const cancelData = await cancelResponse.json().catch(() => ({ success: false }));
          
          if (cancelResponse.ok && cancelData.success) {
            console.log(`成功取消超时任务 ${taskId}`);
            
            // 从处理集合中移除
            processingTaskIds.delete(taskId);
            processingTasks.delete(taskId);
            taskStartTimes.delete(taskId);
          } else {
            console.error(`取消超时任务 ${taskId} 失败:`, cancelData.error || '未知错误');
          }
        } catch (cancelError) {
          console.error(`取消超时任务过程中出错:`, cancelError);
        }
      }
    } catch (error) {
      console.error(`检查任务 ${taskId} 超时状态时出错:`, error);
    }
  }
} 