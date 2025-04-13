import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

// 日志工具函数
const logger = {
  error: (message: string) => {
    console.error(`[任务通知API] ${message}`);
  },
  warn: (message: string) => {
    console.warn(`[任务通知API] ${message}`);
  },
  info: (message: string) => {
    console.log(`[任务通知API] ${message}`);
  },
  debug: (message: string) => {
    console.log(`[任务通知API] ${message}`);
  }
};

/**
 * 任务通知API - 处理任务状态变更通知
 * 可以被后端服务调用，也可以通过Server-Sent Events被前端订阅
 */
export async function POST(request: NextRequest) {
  try {
    // 如果是内部调用，可能有认证秘钥
    const authHeader = request.headers.get('authorization');
    const isInternalCall = authHeader === `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}`;
    
    // 解析请求体
    const body = await request.json();
    const { taskId, status, imageUrl, error: errorMessage, userId } = body;
    
    if (!taskId) {
      return NextResponse.json({ 
        success: false, 
        error: '缺少任务ID'
      }, { status: 400 });
    }
    
    // 内部调用验证
    if (isInternalCall) {
      logger.info(`收到内部任务通知: 任务${taskId}, 状态=${status}`);
      
      // 获取管理员客户端
      const supabaseAdmin = await createAdminClient();
      
      // 根据状态更新任务
      if (status === 'completed' && imageUrl) {
        // 任务完成
        await supabaseAdmin
          .from('image_tasks')
          .update({
            status: 'completed',
            image_url: imageUrl,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('task_id', taskId);
        
        logger.info(`已更新任务${taskId}状态为completed，图片URL: ${imageUrl?.substring(0, 50)}...`);
        
        // 如果提供了用户ID，还可以尝试保存到历史记录
        if (userId) {
          const { data: taskData } = await supabaseAdmin
            .from('image_tasks')
            .select('*')
            .eq('task_id', taskId)
            .single();
          
          if (taskData) {
            // 尝试保存到历史记录
            await supabaseAdmin
              .from('ai_images_creator_history')
              .insert({
                user_id: userId,
                image_url: imageUrl,
                prompt: taskData.prompt,
                style: taskData.style,
                aspect_ratio: taskData.aspect_ratio,
                model_used: taskData.model || 'gpt-4o-image-vip',
                task_id: taskId,
                status: 'completed',
                created_at: new Date().toISOString()
              })
              .then(({ error: historyError }) => {
                if (historyError) {
                  logger.warn(`保存任务${taskId}到历史记录失败: ${historyError.message}`);
                } else {
                  logger.info(`已保存任务${taskId}到历史记录`);
                }
              });
          }
        }
        
        return NextResponse.json({ 
          success: true, 
          message: '任务状态已更新为完成'
        });
      } 
      else if (status === 'failed') {
        // 任务失败
        await supabaseAdmin
          .from('image_tasks')
          .update({
            status: 'failed',
            error_message: errorMessage || '未知错误',
            updated_at: new Date().toISOString()
          })
          .eq('task_id', taskId);
        
        logger.info(`已更新任务${taskId}状态为failed，错误: ${errorMessage || '未知错误'}`);
        
        return NextResponse.json({ 
          success: true, 
          message: '任务状态已更新为失败'
        });
      }
      else {
        // 其他状态更新
        await supabaseAdmin
          .from('image_tasks')
          .update({
            status: status,
            updated_at: new Date().toISOString()
          })
          .eq('task_id', taskId);
        
        logger.info(`已更新任务${taskId}状态为${status}`);
        
        return NextResponse.json({ 
          success: true, 
          message: `任务状态已更新为${status}`
        });
      }
    }
    
    // 非内部调用需要用户认证
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ 
        success: false, 
        error: '未授权访问',
        code: 'unauthorized' 
      }, { status: 401 });
    }
    
    // 只有任务创建者才能更新状态
    const { data: taskData, error: taskError } = await supabase
      .from('image_tasks')
      .select('user_id')
      .eq('task_id', taskId)
      .single();
    
    if (taskError || !taskData) {
      return NextResponse.json({ 
        success: false, 
        error: '任务不存在',
        code: 'task_not_found'
      }, { status: 404 });
    }
    
    if (taskData.user_id !== user.id) {
      return NextResponse.json({ 
        success: false, 
        error: '无权限更新此任务',
        code: 'permission_denied'
      }, { status: 403 });
    }
    
    // 获取管理员客户端
    const supabaseAdmin = await createAdminClient();
    
    // 用户只能取消任务
    if (status === 'cancelled') {
      await supabaseAdmin
        .from('image_tasks')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('task_id', taskId);
      
      logger.info(`用户${user.id}已取消任务${taskId}`);
      
      return NextResponse.json({ 
        success: true, 
        message: '任务已取消'
      });
    }
    
    return NextResponse.json({ 
      success: false, 
      error: '不支持的操作',
      code: 'operation_not_supported'
    }, { status: 400 });
    
  } catch (error: any) {
    logger.error(`处理任务通知失败: ${error.message}`);
    return NextResponse.json({ 
      success: false, 
      error: '处理通知失败',
      details: error.message
    }, { status: 500 });
  }
}

/**
 * 为前端提供任务状态变更的SSE端点
 * 允许前端订阅实时任务状态更新
 */
export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get('taskId');
  const userIdParam = request.nextUrl.searchParams.get('userId');
  
  if (!taskId) {
    return NextResponse.json({ 
      success: false, 
      error: '缺少任务ID参数' 
    }, { status: 400 });
  }
  
  // 验证用户身份
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json({ 
      success: false, 
      error: '未授权访问',
      code: 'unauthorized' 
    }, { status: 401 });
  }
  
  if (userIdParam && userIdParam !== user.id) {
    return NextResponse.json({ 
      success: false, 
      error: '用户ID不匹配',
      code: 'user_mismatch'
    }, { status: 403 });
  }
  
  // 检查任务是否属于当前用户
  const { data: taskData, error: taskError } = await supabase
    .from('image_tasks')
    .select('*')
    .eq('task_id', taskId)
    .eq('user_id', user.id)
    .single();
  
  if (taskError || !taskData) {
    return NextResponse.json({ 
      success: false, 
      error: '任务不存在或无权访问',
      code: 'task_not_found'
    }, { status: 404 });
  }
  
  // 如果任务已经完成或失败，直接返回最终状态
  if (taskData.status === 'completed') {
    return NextResponse.json({
      success: true,
      status: 'completed',
      task: {
        id: taskData.task_id,
        status: taskData.status,
        imageUrl: taskData.image_url,
        createdAt: taskData.created_at,
        completedAt: taskData.completed_at
      }
    });
  }
  
  if (taskData.status === 'failed') {
    return NextResponse.json({
      success: true,
      status: 'failed',
      task: {
        id: taskData.task_id,
        status: taskData.status,
        error: taskData.error_message,
        createdAt: taskData.created_at,
        updatedAt: taskData.updated_at
      }
    });
  }
  
  // 设置SSE响应头
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // 发送初始消息
      const message = {
        event: 'connected',
        data: {
          taskId: taskData.task_id,
          status: taskData.status,
          createdAt: taskData.created_at
        }
      };
      
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
      
      // 监听数据库变更 - 使用轮询模拟
      let interval: NodeJS.Timeout | null = null;
      
      const checkTaskStatus = async () => {
        try {
          const { data: updatedTask, error: statusError } = await supabase
            .from('image_tasks')
            .select('*')
            .eq('task_id', taskId)
            .single();
          
          if (statusError) {
            logger.error(`查询任务${taskId}状态失败: ${statusError.message}`);
            return;
          }
          
          if (!updatedTask) {
            logger.warn(`任务${taskId}不存在`);
            return;
          }
          
          // 发送状态更新
          const statusMessage = {
            event: 'status_update',
            data: {
              taskId: updatedTask.task_id,
              status: updatedTask.status,
              updatedAt: updatedTask.updated_at
            }
          };
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(statusMessage)}\n\n`));
          
          // 如果任务已完成或失败，发送最终消息并关闭连接
          if (updatedTask.status === 'completed' || updatedTask.status === 'failed') {
            const finalMessage = {
              event: 'task_finished',
              data: {
                taskId: updatedTask.task_id,
                status: updatedTask.status,
                result: updatedTask.status === 'completed' ? {
                  imageUrl: updatedTask.image_url
                } : undefined,
                error: updatedTask.status === 'failed' ? updatedTask.error_message : undefined
              }
            };
            
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalMessage)}\n\n`));
            
            // 关闭连接
            if (interval) {
              clearInterval(interval);
              interval = null;
            }
            controller.close();
          }
        } catch (err) {
          logger.error(`检查任务状态时出错: ${err}`);
        }
      };
      
      // 每2秒检查一次状态
      interval = setInterval(checkTaskStatus, 2000);
      
      // 超时处理，最多保持连接60秒
      setTimeout(() => {
        if (interval) {
          clearInterval(interval);
          interval = null;
          
          const timeoutMessage = {
            event: 'timeout',
            data: {
              message: '连接超时，请重新建立连接'
            }
          };
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(timeoutMessage)}\n\n`));
          controller.close();
        }
      }, 60000);
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
} 