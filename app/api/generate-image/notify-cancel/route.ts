import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

// 可选：维护内存中的取消任务ID集合，用于快速校验
const cancelledTaskIds = new Set<string>();

/**
 * 任务取消通知API - 用于通知任务处理器任务已被取消
 * 这个端点将接收取消任务的通知并向处理器发信号
 * 
 * 请求参数:
 * - taskId: 被取消的任务ID
 * - userId: 用户ID
 * - cancelTime: 取消时间
 * 
 * 响应:
 * {
 *   success: boolean,
 *   message?: string,
 *   error?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // 验证访问权限 - 只允许通过授权的系统访问
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ 
        success: false, 
        error: '未授权访问' 
      }, { status: 401 });
    }
    
    const token = authHeader.substring(7);
    const validSecretKey = process.env.TASK_PROCESS_SECRET_KEY || '';
    
    if (!token || token !== validSecretKey) {
      return NextResponse.json({ 
        success: false, 
        error: '无效的授权令牌' 
      }, { status: 403 });
    }
    
    // 获取请求数据
    const body = await request.json();
    const { taskId, userId, cancelTime } = body;
    
    // 验证请求参数
    if (!taskId) {
      return NextResponse.json({ 
        success: false, 
        error: '缺少任务ID参数' 
      }, { status: 400 });
    }
    
    console.log(`收到任务取消通知: ${taskId}, 用户: ${userId}, 时间: ${cancelTime}`);
    
    // 添加到内存缓存
    cancelledTaskIds.add(taskId);
    
    // 使用管理员客户端查询最新任务状态
    const supabase = await createAdminClient();
    const { data: task, error } = await supabase
      .from('ai_images_creator_tasks')
      .select('status, updated_at')
      .eq('task_id', taskId)
      .single();
    
    if (error) {
      console.error(`查询任务 ${taskId} 状态失败:`, error);
      return NextResponse.json({ 
        success: false, 
        error: '查询任务状态失败' 
      }, { status: 500 });
    }
    
    console.log(`任务 ${taskId} 当前状态: ${task.status}, 最后更新时间: ${task.updated_at}`);
    
    // 如果任务状态不是cancelled，再次进行强制更新
    if (task.status !== 'cancelled') {
      console.log(`任务 ${taskId} 仍未处于cancelled状态，再次尝试强制更新`);
      
      // 使用管理员权限强制更新任务状态
      const { error: updateError } = await supabase
        .from('ai_images_creator_tasks')
        .update({
          status: 'cancelled',
          error_message: '任务已被系统通知取消',
          updated_at: new Date().toISOString()
        })
        .eq('task_id', taskId);
      
      if (updateError) {
        console.error(`强制更新任务 ${taskId} 状态失败:`, updateError);
      } else {
        console.log(`成功强制更新任务 ${taskId} 状态为cancelled`);
      }
    }
    
    // 可选：这里可以添加额外的通知逻辑，例如通过WebSocket通知客户端等
    
    return NextResponse.json({
      success: true,
      message: '任务取消通知已接收处理',
      taskId: taskId,
      currentStatus: task.status,
      inMemoryCacheSize: cancelledTaskIds.size
    });
    
  } catch (error) {
    console.error('处理任务取消通知时出错:', error);
    return NextResponse.json({ 
      success: false, 
      error: '处理任务取消通知时出错' 
    }, { status: 500 });
  }
}

// 提供一个静态API用于检查任务是否已取消
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');
    
    if (!taskId) {
      return NextResponse.json({ 
        success: false, 
        error: '缺少任务ID参数' 
      }, { status: 400 });
    }
    
    // 检查内存缓存
    const isCancelledInMemory = cancelledTaskIds.has(taskId);
    
    // 使用管理员客户端查询数据库状态
    const supabase = await createAdminClient();
    const { data: task, error } = await supabase
      .from('ai_images_creator_tasks')
      .select('status')
      .eq('task_id', taskId)
      .single();
    
    if (error) {
      // 如果任务不存在，也视为"已取消"
      if (error.code === 'PGRST116') {
        return NextResponse.json({
          success: true,
          isCancelled: true,
          inMemory: isCancelledInMemory,
          inDatabase: false,
          reason: 'task_not_exist'
        });
      }
      
      console.error(`查询任务 ${taskId} 状态失败:`, error);
      return NextResponse.json({ 
        success: false, 
        error: '查询任务状态失败' 
      }, { status: 500 });
    }
    
    const isCancelledInDb = task.status === 'cancelled';
    
    // 如果数据库中已取消但内存中没有，添加到内存缓存
    if (isCancelledInDb && !isCancelledInMemory) {
      cancelledTaskIds.add(taskId);
    }
    
    return NextResponse.json({
      success: true,
      isCancelled: isCancelledInDb || isCancelledInMemory,
      inMemory: isCancelledInMemory,
      inDatabase: isCancelledInDb,
      status: task.status
    });
    
  } catch (error) {
    console.error('检查任务取消状态时出错:', error);
    return NextResponse.json({ 
      success: false, 
      error: '检查任务取消状态时出错' 
    }, { status: 500 });
  }
} 