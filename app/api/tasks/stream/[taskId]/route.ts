import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { TaskStatus } from '@/types/task';

const encoder = new TextEncoder();

/**
 * 任务状态流API端点
 * 使用Server-Sent Events (SSE)实时推送任务状态更新
 */
export async function GET(
  request: NextRequest,
  context: { params: { taskId: string } }
) {
  const { taskId } = context.params;
  console.log(`[任务状态流] 建立连接: ${taskId}`);

  // 创建Supabase客户端
  const supabase = await createClient();

  // 验证用户身份
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) {
    console.error('[任务状态流] 用户未认证');
    return NextResponse.json(
      { error: '未授权访问' },
      { status: 401 }
    );
  }

  // 创建一个ReadableStream用于SSE
  const stream = new ReadableStream({
    async start(controller) {
      // 发送连接建立消息
      const initialMessage = {
        event: 'connected',
        data: { taskId, message: '已连接到任务状态流' }
      };
      
      // 格式化SSE消息
      const formatSSE = (event: string, data: any) => {
        return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      };
      
      // 发送初始消息
      controller.enqueue(encoder.encode(formatSSE('message', initialMessage)));
      
      // 定义轮询间隔（毫秒）
      const pollInterval = 2000;
      let isClosed = false;
      
      // 定义任务检查函数
      const checkTaskStatus = async () => {
        if (isClosed) return;
        
        try {
          // 查询任务状态
          const { data, error } = await supabase
            .from('image_tasks')
            .select('*')
            .eq('id', taskId)  // 使用id而不是task_id
            .eq('user_id', user.id)
            .single();
          
          if (error) {
            console.error(`[任务状态流] 查询任务状态失败: ${error.message}`);
            controller.enqueue(encoder.encode(formatSSE('message', {
              event: 'error',
              data: { error: '查询任务状态失败' }
            })));
            return;
          }
          
          if (!data) {
            console.warn(`[任务状态流] 任务不存在: ${taskId}`);
            controller.enqueue(encoder.encode(formatSSE('message', {
              status: 'cancelled',
              error: '任务不存在'
            })));
            return;
          }
          
          // 构建状态消息
          const statusMessage = {
            status: data.status,
            taskId: data.id,  // 返回id作为taskId
            created_at: data.created_at,
            updated_at: data.updated_at
          };
          
          // 根据任务状态添加额外信息
          if (data.status === 'completed') {
            Object.assign(statusMessage, {
              imageUrl: data.image_url,
              completed_at: data.completed_at
            });
          } else if (data.status === 'failed' || data.status === 'cancelled') {
            Object.assign(statusMessage, {
              error: data.error_message
            });
          } else {
            // 任务仍在处理中，计算等待时间和估计进度
            const waitTime = Math.floor((Date.now() - new Date(data.created_at).getTime()) / 1000);
            const estimatedProgress = calculateProgress(waitTime);
            const processingStage = determineProcessingStage(waitTime);
            
            Object.assign(statusMessage, {
              progress: estimatedProgress,
              stage: processingStage,
              waitTime
            });
          }
          
          // 发送状态消息
          controller.enqueue(encoder.encode(formatSSE('message', statusMessage)));
          
          // 如果任务已完成或失败，停止轮询
          if (['completed', 'failed', 'cancelled'].includes(data.status)) {
            console.log(`[任务状态流] 任务${taskId}已${data.status}，关闭连接`);
            isClosed = true;
            controller.close();
            return;
          }
          
          // 继续轮询
          setTimeout(checkTaskStatus, pollInterval);
        } catch (error) {
          console.error(`[任务状态流] 处理错误: ${error instanceof Error ? error.message : String(error)}`);
          controller.enqueue(encoder.encode(formatSSE('message', {
            event: 'error',
            data: { error: '检查任务状态出错' }
          })));
          
          // 出错后也继续轮询
          setTimeout(checkTaskStatus, pollInterval);
        }
      };
      
      // 启动第一次检查
      checkTaskStatus();
      
      // 监听请求中断
      request.signal.addEventListener('abort', () => {
        console.log(`[任务状态流] 客户端断开连接: ${taskId}`);
        isClosed = true;
        controller.close();
      });
    }
  });
  
  // 返回事件流响应
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    }
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