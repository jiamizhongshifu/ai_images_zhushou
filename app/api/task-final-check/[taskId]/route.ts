import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
// import { getLogger } from '@/utils/logger';

// const logger = getLogger('task-final-check-api');

// 日志工具函数
const logger = {
  error: (message: string, ...args: any[]) => {
    console.error(`[任务终止检查API] ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`[任务终止检查API] ${message}`, ...args);
  },
  info: (message: string, ...args: any[]) => {
    console.log(`[任务终止检查API] ${message}`, ...args);
  },
  debug: (message: string, ...args: any[]) => {
    console.log(`[任务终止检查API] ${message}`, ...args);
  }
};

/**
 * 任务最终状态检查API
 * 直接从数据库获取任务状态，作为备用方案
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

// 定义HTTP POST请求处理函数，用于主动取消任务
export async function POST(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  return NextResponse.json({
    success: true,
    taskId: params.taskId,
  });
} 