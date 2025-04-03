#!/usr/bin/env node

/**
 * 任务监控脚本 - 定期检查任务状态并修复卡住的任务
 * 
 * 该脚本可以：
 * 1. 定期检查数据库中的任务状态
 * 2. 识别长时间处于processing状态的任务
 * 3. 自动执行修复操作
 * 
 * 使用方法：
 *   - 直接运行：node scripts/monitor-tasks.mjs
 *   - 后台运行：nohup node scripts/monitor-tasks.mjs > monitor.log 2>&1 &
 *   - 设置cron作业：编辑crontab添加 "cd /path/to/project && node scripts/monitor-tasks.mjs"
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

// 加载环境变量
dotenv.config();

// 创建Supabase客户端
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('错误: 环境变量NEXT_PUBLIC_SUPABASE_URL或SUPABASE_SERVICE_ROLE_KEY未设置');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 配置
const CHECK_INTERVAL = 5 * 60 * 1000; // 检查间隔(毫秒): 5分钟
const STUCK_TASK_THRESHOLD = 20; // 任务卡住阈值(分钟)
const SYSTEM_HEALTH_CHECK_INTERVAL = 30 * 60 * 1000; // 系统健康检查间隔(毫秒): 30分钟
const MAX_TASK_COUNT_THRESHOLD = 10; // 最大积压任务数阈值，超过此值会触发系统健康检查
const MONITOR_LOGFILE = 'task-monitor.log'; // 监控日志文件

// 获取代理配置
const HTTP_PROXY = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || '';
if (HTTP_PROXY) {
  console.log(`使用代理配置: ${HTTP_PROXY}`);
} else {
  console.log('未检测到代理配置，将直接连接');
}

// 工作记录
const lastFixAttempts = new Map(); // 记录上次修复尝试时间
const healthCheckHistory = []; // 系统健康检查历史

/**
 * 检查卡住的任务
 */
async function checkStuckTasks() {
  try {
    const now = new Date();
    console.log(`[${now.toISOString()}] 开始检查卡住的任务...`);
    
    // 计算时间阈值
    const thresholdTime = new Date();
    thresholdTime.setMinutes(thresholdTime.getMinutes() - STUCK_TASK_THRESHOLD);
    const thresholdTimeStr = thresholdTime.toISOString();
    
    // 查询卡在processing状态超过阈值时间的任务
    const { data: stuckTasks, error } = await supabase
      .from('ai_images_creator_tasks')
      .select('*')
      .eq('status', 'processing')
      .lt('created_at', thresholdTimeStr);
    
    if (error) {
      console.error('查询卡住任务时出错:', error);
      return;
    }
    
    if (!stuckTasks || stuckTasks.length === 0) {
      console.log('没有发现卡住的任务');
      return;
    }
    
    console.log(`发现 ${stuckTasks.length} 个卡住的任务，准备修复`);
    
    // 检查是否有积压的任务数量过多，如果有则触发系统健康检查
    if (stuckTasks.length >= MAX_TASK_COUNT_THRESHOLD) {
      console.warn(`警告: 积压任务数(${stuckTasks.length})超过阈值(${MAX_TASK_COUNT_THRESHOLD})，触发系统健康检查`);
      await checkSystemHealth(true); // 强制立即执行系统健康检查
    }
    
    // 修复卡住的任务
    await fixStuckTasks(stuckTasks);
    
  } catch (error) {
    console.error('检查卡住任务时发生错误:', error);
    await logToFile(`检查卡住任务时发生错误: ${error.message}`);
  }
}

/**
 * 修复卡住的任务
 */
async function fixStuckTasks(stuckTasks) {
  console.log(`开始修复 ${stuckTasks.length} 个卡住的任务`);
  
  // 使用现成的修复脚本
  try {
    // 直接在当前进程中修复
    for (const task of stuckTasks) {
      // 检查上次修复尝试时间，避免频繁修复同一个任务
      const lastAttempt = lastFixAttempts.get(task.task_id);
      const now = Date.now();
      
      // 如果上次尝试修复在30分钟内，则跳过
      if (lastAttempt && (now - lastAttempt) < 30 * 60 * 1000) {
        console.log(`任务 ${task.task_id} 在过去30分钟内已尝试修复，跳过`);
        continue;
      }
      
      console.log(`修复任务: ${task.task_id}, 创建时间: ${task.created_at}`);
      
      try {
        // 更新任务状态为失败
        const { error: updateError } = await supabase
          .from('ai_images_creator_tasks')
          .update({
            status: 'failed',
            error_message: '任务处理超时，已自动标记为失败',
            completed_at: new Date().toISOString()
          })
          .eq('task_id', task.task_id);
        
        if (updateError) {
          console.error(`更新任务 ${task.task_id} 状态时出错:`, updateError);
          continue;
        }
        
        console.log(`成功将任务 ${task.task_id} 标记为失败`);
        
        // 尝试退还用户点数
        try {
          // 创建fetch选项
          const fetchOptions = {};
          
          // 使用代理（如果有）
          if (HTTP_PROXY) {
            try {
              // 先尝试直接导入
              let Agent;
              try {
                const undici = await import('undici');
                Agent = undici.Agent;
                console.log('从全局 undici 包成功导入 Agent');
              } catch (importErr) {
                console.log(`全局导入失败: ${importErr.message}, 尝试从本地路径导入`);
                // 如果全局导入失败，尝试从本地路径导入
                const undiciPath = path.join(process.cwd(), 'node_modules', 'undici');
                const undici = await import(/* webpackIgnore: true */ `file://${undiciPath}/index.js`);
                Agent = undici.Agent;
                console.log('从本地路径成功导入 Agent');
              }
              
              const proxyAgent = new Agent({
                connect: {
                  proxy: {
                    uri: HTTP_PROXY
                  }
                }
              });
              fetchOptions.dispatcher = proxyAgent;
              console.log(`为任务 ${task.task_id} 退款使用代理: ${HTTP_PROXY}`);
            } catch (proxyError) {
              console.warn(`配置代理失败: ${proxyError.message}，将尝试直接连接`);
              // 添加详细错误信息以便调试
              console.error('详细错误信息:', proxyError);
            }
          }
          
          // 设置请求超时
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);
          fetchOptions.signal = controller.signal;
          
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
          
          if (data.success) {
            console.log(`成功为任务 ${task.task_id} 执行退款`);
          } else {
            console.error(`退款API返回错误: ${data.error || '未知错误'}`);
          }
        } catch (refundError) {
          console.error(`为任务 ${task.task_id} 执行退款失败:`, refundError.message);
          
          // 直接尝试更新数据库
          try {
            // 获取用户当前积分
            const { data: credits, error: creditError } = await supabase
              .from('ai_images_creator_credits')
              .select('credits')
              .eq('user_id', task.user_id)
              .single();
            
            if (creditError) {
              console.error(`查询用户 ${task.user_id} 积分时出错:`, creditError);
            } else {
              // 更新积分
              const newCredits = (credits?.credits || 0) + 1;
              const { error: updateError } = await supabase
                .from('ai_images_creator_credits')
                .update({ credits: newCredits })
                .eq('user_id', task.user_id);
              
              if (updateError) {
                console.error(`为用户 ${task.user_id} 退还积分时出错:`, updateError);
              } else {
                console.log(`成功为用户 ${task.user_id} 退还1点积分`);
                
                // 尝试更新任务退款状态
                try {
                  await supabase
                    .from('ai_images_creator_tasks')
                    .update({ refunded: true })
                    .eq('task_id', task.task_id);
                } catch (err) {
                  // 忽略refunded字段不存在的错误
                  console.log('注意: 表中可能没有refunded字段，已跳过标记退款状态');
                }
              }
            }
          } catch (dbError) {
            console.error(`直接退还积分失败:`, dbError);
          }
        }
        
        // 记录修复尝试时间
        lastFixAttempts.set(task.task_id, now);
        
      } catch (e) {
        console.error(`处理任务 ${task.task_id} 时发生异常:`, e);
        await logToFile(`处理任务 ${task.task_id} 时发生异常: ${e.message}`);
      }
    }
    
    console.log('任务修复完成!');
    await logToFile(`成功修复了 ${stuckTasks.length} 个卡住的任务`);
  } catch (error) {
    console.error('执行修复脚本时发生错误:', error);
    await logToFile(`执行修复脚本时发生错误: ${error.message}`);
  }
}

/**
 * 检查任务处理器是否在线 
 */
async function isTaskProcessorRunning() {
  return new Promise((resolve) => {
    exec('ps aux | grep task-processor.mjs | grep -v grep', (error, stdout, stderr) => {
      // 如果没有错误且有输出，说明进程在运行中
      resolve(!error && stdout.trim() !== '');
    });
  });
}

/**
 * 启动任务处理器
 */
async function startTaskProcessor() {
  return new Promise((resolve, reject) => {
    console.log('尝试启动任务处理器...');
    
    // 获取当前工作目录
    const currentDir = process.cwd();
    const scriptPath = path.join(currentDir, 'scripts/task-processor.mjs');
    
    // 使用nohup在后台运行任务处理器
    exec(`nohup node ${scriptPath} > task-processor.log 2>&1 &`, (error, stdout, stderr) => {
      if (error) {
        console.error('启动任务处理器失败:', error);
        reject(error);
        return;
      }
      console.log('任务处理器已成功启动');
      resolve(true);
    });
  });
}

/**
 * 检查系统健康状态并进行必要的恢复操作
 */
async function checkSystemHealth(forceCheck = false) {
  try {
    // 检查上次健康检查时间，避免频繁检查
    const lastCheck = healthCheckHistory[healthCheckHistory.length - 1];
    const now = Date.now();
    
    if (!forceCheck && lastCheck && (now - lastCheck.timestamp) < SYSTEM_HEALTH_CHECK_INTERVAL) {
      // 如果不是强制检查，且上次检查在间隔时间内，则跳过
      return;
    }
    
    console.log(`[${new Date().toISOString()}] 执行系统健康检查...`);
    
    // 记录当前健康检查
    const healthCheck = {
      timestamp: now,
      date: new Date().toISOString(),
      actions: []
    };
    
    // 检查任务处理器是否运行
    const processorRunning = await isTaskProcessorRunning();
    if (!processorRunning) {
      console.warn('任务处理器未运行，尝试重新启动...');
      await logToFile('检测到任务处理器未运行，尝试重新启动');
      
      try {
        await startTaskProcessor();
        console.log('任务处理器已重新启动');
        healthCheck.actions.push('重启任务处理器');
        await logToFile('成功重启任务处理器');
      } catch (error) {
        console.error('重启任务处理器失败:', error);
        healthCheck.actions.push(`重启任务处理器失败: ${error.message}`);
        await logToFile(`重启任务处理器失败: ${error.message}`);
      }
    } else {
      console.log('任务处理器运行正常');
      healthCheck.actions.push('任务处理器运行正常');
    }
    
    // 记录健康检查结果
    healthCheckHistory.push(healthCheck);
    
    // 只保留最近10条健康检查记录
    if (healthCheckHistory.length > 10) {
      healthCheckHistory.shift();
    }
    
  } catch (error) {
    console.error('系统健康检查时发生错误:', error);
    await logToFile(`系统健康检查时发生错误: ${error.message}`);
  }
}

/**
 * 将日志写入文件
 */
async function logToFile(message) {
  try {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    
    // 追加写入日志文件
    await fs.appendFile(MONITOR_LOGFILE, logMessage);
  } catch (error) {
    console.error('写入日志文件失败:', error);
  }
}

/**
 * 显示监控器启动信息
 */
function showStartupInfo() {
  console.log('==============================================');
  console.log('任务监控器已启动');
  console.log(`启动时间: ${new Date().toISOString()}`);
  console.log('==============================================');
  console.log(`- 检查间隔: ${CHECK_INTERVAL / 1000}秒`);
  console.log(`- 任务卡住阈值: ${STUCK_TASK_THRESHOLD}分钟`);
  console.log(`- 系统健康检查间隔: ${SYSTEM_HEALTH_CHECK_INTERVAL / 60000}分钟`);
  console.log(`- 监控日志文件: ${MONITOR_LOGFILE}`);
  console.log('==============================================');
}

/**
 * 主函数
 */
async function main() {
  showStartupInfo();
  await logToFile('任务监控器已启动');
  
  // 立即执行一次检查
  await checkStuckTasks();
  await checkSystemHealth(true);
  
  // 设置定期检查
  setInterval(checkStuckTasks, CHECK_INTERVAL);
  setInterval(checkSystemHealth, SYSTEM_HEALTH_CHECK_INTERVAL);
  
  console.log(`监控器已设置定期检查: 任务状态每${CHECK_INTERVAL/60000}分钟, 系统健康每${SYSTEM_HEALTH_CHECK_INTERVAL/60000}分钟`);
}

// 启动监控器
main().catch(error => {
  console.error('监控器启动失败:', error);
}); 