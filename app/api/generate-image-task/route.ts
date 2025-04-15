import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { processImage } from '@/utils/image/imageProcessor';
import { generateImageWithAI } from '@/utils/ai/imageGenerator';
import { handleTask, validatePrompt } from '@/utils/taskManager';
import { getUserAccountInfo, updateUserUsage } from '@/utils/userManager';
import { createTask, updateTaskStatus } from '@/utils/database/taskDb';
import { rateLimiter } from '@/utils/rateLimiter';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/utils/authOptions';
import { TaskStatus } from '@/types/task';
import { getSupabase } from '@/utils/supabase/server';

const MAX_PROMPT_LENGTH = 500;
const MAX_REQUEST_SIZE = 10 * 1024 * 1024; // 10MB
const RESPONSE_TIMEOUT = 300000; // 5分钟

/**
 * 图片生成任务API
 * 创建并排队一个异步图片生成任务
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
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      console.error('[API] 未授权的请求');
      return NextResponse.json(
        { error: '请先登录' },
        { status: 401 }
      );
    }
    
    const userId = session.user.id;
    
    // 3. 解析请求体
    const body = await request.json();
    const { prompt, image, style, aspectRatio, standardAspectRatio, requestId } = body;
    
    // 4. 验证参数
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
    
    // 5. 验证提示词内容
    const promptValidation = await validatePrompt(prompt);
    if (!promptValidation.valid) {
      console.error('[API] 提示词内容不合规:', promptValidation.reason);
      return NextResponse.json(
        { error: `提示词不合规: ${promptValidation.reason}` },
        { status: 400 }
      );
    }
    
    // 6. 频率限制检查
    const rateLimiterResult = await rateLimiter(userId, 'image_generation', 10); // 每分钟最多10次请求
    if (!rateLimiterResult.success) {
      console.error('[API] 请求频率超限:', rateLimiterResult.message);
      return NextResponse.json(
        { error: rateLimiterResult.message },
        { status: 429 }
      );
    }
    
    // 7. 检查用户积分
    const userInfo = await getUserAccountInfo(userId);
    if (!userInfo || userInfo.credits < 1) {
      console.error('[API] 用户积分不足:', userInfo?.credits);
      return NextResponse.json(
        { error: '积分不足，请充值后再试' },
        { status: 402 }
      );
    }
    
    // 8. 创建任务
    const taskId = requestId || uuidv4();
    console.log(`[API] 创建任务: ${taskId}`);
    
    // 9. 记录任务到数据库
    await createTask({
      id: taskId,
      user_id: userId,
      prompt: prompt || '图片转换',
      status: TaskStatus.PENDING,
      parameters: {
        prompt,
        style,
        aspectRatio,
        standardAspectRatio,
        hasImage: !!image
      }
    });
    
    // 10. 后台处理任务
    handleTask(taskId, async () => {
      try {
        console.log(`[任务处理] 开始处理任务: ${taskId}`);
        await updateTaskStatus(taskId, TaskStatus.PROCESSING);
        
        // 处理图片生成
        let processedImage = image;
        if (image) {
          processedImage = await processImage(image);
        }
        
        // 生成图片
        const result = await generateImageWithAI({
          prompt,
          image: processedImage,
          style,
          aspectRatio: standardAspectRatio || aspectRatio
        });
        
        if (!result.success) {
          throw new Error(result.error || '图片生成失败');
        }
        
        // 扣除用户积分
        await updateUserUsage(userId, 1);
        
        // 更新任务状态为完成
        await updateTaskStatus(taskId, TaskStatus.COMPLETED, {
          result_url: result.imageUrl
        });
        
        console.log(`[任务处理] 任务成功完成: ${taskId}`);
      } catch (error) {
        console.error(`[任务处理] 任务处理失败: ${taskId}`, error);
        await updateTaskStatus(taskId, TaskStatus.FAILED, {
          error_message: error instanceof Error ? error.message : '未知错误'
        });
      }
    });
    
    // 11. 返回任务ID
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