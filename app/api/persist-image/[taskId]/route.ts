import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { persistImageUrl } from '@/utils/image/persistImage'; 
import { createAdminClient } from '@/utils/supabase/admin';

// 日志工具
const logger = {
  info: (message: string) => console.log(`[图片持久化API] ${message}`),
  error: (message: string) => console.error(`[图片持久化API] ${message}`),
  warn: (message: string) => console.warn(`[图片持久化API] ${message}`),
  debug: (message: string) => console.log(`[图片持久化API] ${message}`)
};

/**
 * 图片持久化API端点
 * 用于将任务中的临时图片URL转存为持久化URL
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