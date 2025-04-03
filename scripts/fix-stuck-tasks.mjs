#!/usr/bin/env node

/**
 * 修复卡住的任务脚本
 * 识别长时间卡在processing状态的任务并修复
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import path from 'path';

// 设置相对路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 加载环境变量
dotenv.config({ path: path.join(rootDir, '.env') });

// 获取代理配置
const HTTP_PROXY = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || '';
if (HTTP_PROXY) {
  console.log(`使用代理配置: ${HTTP_PROXY}`);
} else {
  console.log('未检测到代理配置，将直接连接');
}

// Supabase配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('错误: 环境变量未设置。请确保已设置NEXT_PUBLIC_SUPABASE_URL和SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 任务超时阈值（分钟）
const TASK_STUCK_THRESHOLD = 15;

// 主函数
async function main() {
  try {
    console.log('开始修复卡住的任务...');
    
    // 计算时间阈值
    const thresholdTime = new Date();
    thresholdTime.setMinutes(thresholdTime.getMinutes() - TASK_STUCK_THRESHOLD);
    
    // 查询卡住的任务
    const { data: stuckTasks, error } = await supabase
      .from('ai_images_creator_tasks')
      .select('*')
      .eq('status', 'processing')
      .lt('created_at', thresholdTime.toISOString());
    
    if (error) {
      console.error('查询卡住任务时出错:', error);
      process.exit(1);
    }
    
    if (!stuckTasks || stuckTasks.length === 0) {
      console.log('没有找到卡住的任务。');
      process.exit(0);
    }
    
    console.log(`找到 ${stuckTasks.length} 个卡住的任务，开始修复...`);
    
    // 处理每个卡住的任务
    for (const task of stuckTasks) {
      await fixTask(task);
    }
    
    console.log('所有任务修复完成!');
  } catch (error) {
    console.error('执行过程中发生错误:', error);
    process.exit(1);
  }
}

// 修复单个任务
async function fixTask(task) {
  console.log(`正在修复任务: ${task.task_id}，创建时间: ${task.created_at}`);
  
  try {
    // 1. 将任务状态更新为失败
    const { error: updateError } = await supabase
      .from('ai_images_creator_tasks')
      .update({
        status: 'failed',
        error_message: '任务处理超时，系统自动终止',
        completed_at: new Date().toISOString()
      })
      .eq('task_id', task.task_id);
    
    if (updateError) {
      console.error(`更新任务 ${task.task_id} 状态失败:`, updateError);
      return;
    }
    
    console.log(`成功将任务 ${task.task_id} 标记为失败`);
    
    // 2. 退还用户的积分
    const { error: refundError } = await refundCredit(task);
    if (refundError) {
      console.error(`退还用户 ${task.user_id} 积分失败:`, refundError);
    } else {
      console.log(`成功退还用户 ${task.user_id} 的积分`);
    }
    
  } catch (error) {
    console.error(`处理任务 ${task.task_id} 时出错:`, error);
  }
}

// 退还用户积分
async function refundCredit(task) {
  try {
    // 获取用户当前积分
    const { data: credits, error: creditError } = await supabase
      .from('ai_images_creator_credits')
      .select('credits')
      .eq('user_id', task.user_id)
      .single();
    
    if (creditError) {
      return { error: creditError };
    }
    
    // 更新用户积分
    const newCredits = (credits?.credits || 0) + 1;
    const { error: updateError } = await supabase
      .from('ai_images_creator_credits')
      .update({ credits: newCredits })
      .eq('user_id', task.user_id);
    
    if (updateError) {
      return { error: updateError };
    }
    
    // 检查表中是否有refunded字段
    try {
      // 更新任务退款状态
      const { error: taskUpdateError } = await supabase
        .from('ai_images_creator_tasks')
        .update({ refunded: true })
        .eq('task_id', task.task_id);
      
      if (taskUpdateError) {
        // 如果更新失败但不是因为字段不存在
        if (!taskUpdateError.message || !taskUpdateError.message.includes("'refunded' column")) {
          console.warn(`更新任务退款状态失败，但将继续处理: ${taskUpdateError.message}`);
        }
      }
    } catch (err) {
      // 忽略refunded字段不存在的错误
      console.log('注意: 表中可能没有refunded字段，已跳过标记退款状态');
    }
    
    return { success: true };
  } catch (error) {
    return { error };
  }
}

// 尝试使用API退款（备用方案）
async function refundViaAPI(task) {
  try {
    // 创建fetch选项
    const fetchOptions = {};
    
    // 使用代理（如果有）
    if (HTTP_PROXY) {
      try {
        const { Agent } = await import('undici');
        const proxyAgent = new Agent({
          connect: {
            proxy: {
              uri: HTTP_PROXY
            }
          }
        });
        fetchOptions.dispatcher = proxyAgent;
      } catch (proxyError) {
        console.warn(`配置代理失败: ${proxyError.message}，将尝试直接连接`);
      }
    }
    
    // 设置超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    fetchOptions.signal = controller.signal;
    
    // 调用退款API
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/generate-image/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}`
      },
      body: JSON.stringify({
        taskId: task.task_id,
        secretKey: process.env.TASK_PROCESS_SECRET_KEY
      }),
      ...fetchOptions
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`退款API调用失败: ${response.status}, 响应: ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(`退款API调用返回错误: ${data.error || '未知错误'}`);
    }
    
    return { success: true };
  } catch (error) {
    return { error };
  }
}

// 执行主函数
main(); 