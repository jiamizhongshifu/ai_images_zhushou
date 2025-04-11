import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSecureClient, getCurrentUser } from '@/app/api/auth-middleware';
import { taskClients, TaskClient, registerClient, removeClient } from './taskClients';

// 记录日志
const logger = {
  info: (message: string) => console.log(`[TaskNotify] ${message}`),
  error: (message: string) => console.error(`[TaskNotify Error] ${message}`)
};

// 发送任务状态更新通知
export async function POST(request: NextRequest) {
  try {
    // 验证请求权限
    const { supabase } = await createSecureClient();
    const currentUser = await getCurrentUser(supabase);
    
    if (!currentUser) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    // 解析请求数据
    const data = await request.json();
    const { taskId, status, imageUrl } = data;
    
    if (!taskId || !status) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }
    
    logger.info(`接收到任务更新通知: ${taskId}, 状态: ${status}`);
    
    // 创建事件数据 - 简化数据结构，只包含必要字段
    const eventData = {
      taskId,
      status,
      imageUrl: imageUrl || null,
      timestamp: new Date().toISOString()
    };
    
    // 广播事件到所有监听该任务的客户端
    if (taskClients.has(taskId)) {
      const clients = taskClients.get(taskId)!;
      const eventMessage = `data: ${JSON.stringify(eventData)}\n\n`;
      
      // 转换Set为数组以解决循环问题
      Array.from(clients).forEach((client: TaskClient) => {
        try {
          client.enqueue(new TextEncoder().encode(eventMessage));
          logger.info(`已向客户端发送任务${taskId}的更新通知`);
        } catch (e) {
          logger.error(`向客户端发送通知失败: ${e instanceof Error ? e.message : String(e)}`);
          // 出错的客户端可能已断开连接，移除它
          clients.delete(client);
        }
      });
      
      // 如果任务完成或失败，移除所有客户端
      if (status === 'completed' || status === 'failed') {
        // 转换Set为数组以解决循环问题
        Array.from(clients).forEach((client: TaskClient) => {
          try {
            // 发送关闭事件
            client.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({...eventData, type: 'close'})}\n\n`));
            client.close();
          } catch (e) {
            // 忽略关闭时的错误
          }
        });
        taskClients.delete(taskId);
        logger.info(`任务${taskId}已${status}，移除所有监听客户端`);
      }
    } else {
      logger.info(`没有客户端正在监听任务${taskId}的更新`);
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(`处理任务通知请求失败: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: '处理请求失败' }, { status: 500 });
  }
}

// 订阅任务状态更新
export async function GET(request: NextRequest) {
  try {
    // 获取任务ID
    const taskId = request.nextUrl.searchParams.get('taskId');
    if (!taskId) {
      return NextResponse.json({ error: '缺少任务ID参数' }, { status: 400 });
    }
    
    // 验证用户权限
    const { supabase } = await createSecureClient();
    const currentUser = await getCurrentUser(supabase);
    
    if (!currentUser) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }
    
    // 验证任务归属
    const { data: task, error } = await supabase
      .from('image_tasks')
      .select('user_id')
      .eq('task_id', taskId)
      .single();
      
    if (error || !task || task.user_id !== currentUser.id) {
      return NextResponse.json({ error: '无权访问此任务' }, { status: 403 });
    }
    
    logger.info(`用户${currentUser.id}开始监听任务${taskId}的状态更新`);
    
    // 检查是否有任务完成通知
    const { data: notification } = await supabase
      .from('task_notifications')
      .select('*')
      .eq('task_id', taskId)
      .eq('user_id', currentUser.id)
      .eq('status', 'completed')
      .single();
      
    // 如果已有完成通知，立即返回
    if (notification && notification.image_url) {
      logger.info(`发现任务${taskId}已完成的通知记录，立即返回`);
      
      // 使用特殊格式返回通知，前端可以直接处理
      const completeResponse = new Response(
        `data: ${JSON.stringify({
          taskId,
          status: 'completed',
          imageUrl: notification.image_url,
          timestamp: notification.created_at,
          type: 'immediate'
        })}\n\n`, 
        {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          }
        }
      );
      
      return completeResponse;
    }
    
    // 创建流
    const stream = new ReadableStream({
      start(controller) {
        // 创建客户端对象
        const client: TaskClient = {
          enqueue: (chunk: Uint8Array) => controller.enqueue(chunk),
          close: () => controller.close()
        };
        
        // 发送连接成功消息
        controller.enqueue(new TextEncoder().encode('data: {"type":"connected","taskId":"' + taskId + '"}\n\n'));
        
        // 添加客户端到任务监听列表
        registerClient(taskId, client);
        
        // 每30秒发送保活消息
        const keepAliveInterval = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));
          } catch (e) {
            // 如果发送失败，清理资源
            clearInterval(keepAliveInterval);
            removeClient(taskId, client);
          }
        }, 30000);
      }
    });
    
    // 返回SSE响应
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    logger.error(`创建SSE连接失败: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: '创建事件流失败' }, { status: 500 });
  }
} 