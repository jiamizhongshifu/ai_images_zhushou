import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { TaskStatus } from '@/types/task';
import { createClient } from '@/utils/supabase/server';

const MAX_PROMPT_LENGTH = 500;
const MAX_REQUEST_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * 图片生成任务API (简化版)
 * 创建一个异步图片生成任务ID并返回，不进行实际处理
 */
export async function POST(request: NextRequest) {
  console.log('[API] 接收到图片生成任务请求');
  
  try {
    // 1. 请求大小检查
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_REQUEST_SIZE) {
      console.error('[API] 请求体过大:', contentLength);
      return NextResponse.json(
        { error: '请求体过大，最大允许10MB' },
        { status: 413 }
      );
    }
    
    // 2. 获取并验证用户会话
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('[API] 未授权的请求');
      return NextResponse.json(
        { error: '请先登录' },
        { status: 401 }
      );
    }
    
    const userId = user.id;
    
    // 3. 解析请求体
    const body = await request.json();
    const { prompt, image, style, aspectRatio, standardAspectRatio, requestId } = body;
    
    // 4. 验证基本参数
    if (!prompt && !image) {
      console.error('[API] 缺少必要参数: prompt 或 image');
      return NextResponse.json(
        { error: '请提供提示词或图片' },
        { status: 400 }
      );
    }
    
    if (prompt && prompt.length > MAX_PROMPT_LENGTH) {
      console.error('[API] 提示词过长:', prompt.length);
      return NextResponse.json(
        { error: `提示词过长，最大允许${MAX_PROMPT_LENGTH}个字符` },
        { status: 400 }
      );
    }
    
    // 5. 创建任务ID
    const taskId = requestId || uuidv4();
    console.log(`[API] 创建任务: ${taskId}`);
    
    // 6. 记录任务到数据库 (简化版，直接使用Supabase)
    try {
      const { error } = await supabase
        .from('image_tasks')
        .insert({
          id: taskId,  // 注意：表中是id而不是task_id
          user_id: userId,
          prompt: prompt || '图片转换',
          style: style || null,
          aspect_ratio: standardAspectRatio || aspectRatio || null,
          status: 'pending', // 使用枚举值
          provider: 'openai', // 默认提供商
          model: 'dall-e-3', // 默认模型
          request_id: requestId || null
        });
      
      if (error) {
        console.error(`[API] 保存任务到数据库失败:`, error);
        throw error;
      }
    } catch (dbError) {
      console.error(`[API] 数据库操作失败:`, dbError);
      // 继续处理，不要中断流程，因为前端逻辑主要依赖taskId
    }
    
    // 7. 返回任务ID (不进行实际处理，由后台服务或其他机制处理)
    return NextResponse.json(
      { 
        taskId, 
        message: '任务已创建，请通过任务状态接口查询进度' 
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('[API] 图片生成任务请求处理失败:', error);
    return NextResponse.json(
      { error: '处理请求时出错，请稍后再试' },
      { status: 500 }
    );
  }
} 