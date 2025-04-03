#!/usr/bin/env node

/**
 * 修复卡在processing状态的任务脚本
 * 用法: node scripts/fix-stuck-tasks.mjs
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// 加载环境变量
dotenv.config();

// 创建Supabase客户端
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // 使用服务角色密钥进行管理操作

if (!supabaseUrl || !supabaseKey) {
  console.error('错误: 环境变量NEXT_PUBLIC_SUPABASE_URL或SUPABASE_SERVICE_ROLE_KEY未设置');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 定义卡住任务的时间阈值（默认20分钟）
const STUCK_THRESHOLD_MINUTES = 20;

// 修复卡住的任务
async function fixStuckTasks() {
  console.log('开始检查卡住的任务...');
  
  // 计算时间阈值
  const thresholdTime = new Date();
  thresholdTime.setMinutes(thresholdTime.getMinutes() - STUCK_THRESHOLD_MINUTES);
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
    console.log('没有发现卡住的任务。');
    return;
  }
  
  console.log(`发现 ${stuckTasks.length} 个卡住的任务，开始修复...`);
  
  // 处理每个卡住的任务
  for (const task of stuckTasks) {
    console.log(`修复任务 ID: ${task.task_id}, 创建时间: ${task.created_at}`);
    
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
      const { data: credits, error: creditError } = await supabase
        .from('ai_images_creator_credits')
        .select('credits')
        .eq('user_id', task.user_id)
        .single();
      
      if (creditError) {
        console.error(`查询用户 ${task.user_id} 点数时出错:`, creditError);
      } else {
        // 更新点数记录
        const newCredits = (credits?.credits || 0) + 1;
        const { error: refundError } = await supabase
          .from('ai_images_creator_credits')
          .update({ credits: newCredits })
          .eq('user_id', task.user_id);
        
        if (refundError) {
          console.error(`为用户 ${task.user_id} 退还点数时出错:`, refundError);
        } else {
          console.log(`成功为用户 ${task.user_id} 退还1点积分`);
          
          // 更新任务的退款状态
          await supabase
            .from('ai_images_creator_tasks')
            .update({ refunded: true })
            .eq('task_id', task.task_id);
        }
      }
    } catch (e) {
      console.error(`处理任务 ${task.task_id} 时发生异常:`, e);
    }
  }
  
  console.log('任务修复完成!');
}

// 执行主函数
fixStuckTasks().catch(error => {
  console.error('脚本执行失败:', error);
  process.exit(1);
}).finally(() => {
  console.log('脚本执行完毕。');
}); 