import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { isOpenAIUrl, isTemporaryUrl } from '@/utils/image/persistImage';
import { getCurrentUser } from '@/app/api/auth-middleware';

// 日志工具函数
const logger = {
  error: (message: string) => {
    console.error(`[TaskStatus API] ${message}`);
  },
  warn: (message: string) => {
    console.warn(`[TaskStatus API] ${message}`);
  },
  info: (message: string) => {
    console.log(`[TaskStatus API] ${message}`);
  },
  debug: (message: string) => {
    console.log(`[TaskStatus API] ${message}`);
  }
};

/**
 * 获取任务状态和进度信息API端点
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  return NextResponse.json({
    success: true,
    taskId: params.taskId,
  });
}

/**
 * 根据等待时间计算估计进度
 * @param waitTime 等待时间（秒）
 * @returns 估计进度（0-100）
 */
function calculateProgress(waitTime: number): number {
  if (waitTime < 5) return 5;
  if (waitTime < 10) return 10;
  if (waitTime < 20) return 20;
  if (waitTime < 30) return 30;
  if (waitTime < 60) return 30 + Math.min(30, waitTime / 2);
  if (waitTime < 120) return Math.min(80, 60 + waitTime / 6);
  
  // 超过120秒后进度缓慢增加
  return Math.min(95, 80 + (waitTime - 120) / 12);
}

/**
 * 根据等待时间确定处理阶段
 * @param waitTime 等待时间（秒）
 * @returns 处理阶段描述
 */
function determineProcessingStage(waitTime: number): string {
  if (waitTime < 5) return 'preparing';
  if (waitTime < 10) return 'configuring';
  if (waitTime < 15) return 'sending_request';
  if (waitTime < 60) return 'processing';
  if (waitTime < 120) return 'processing';
  if (waitTime < 150) return 'extracting_image';
  return 'finalizing';
} 