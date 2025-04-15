import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

// 可选：维护内存中的取消任务ID集合，用于快速校验
const cancelledTaskIds = new Set<string>();

/**
 * 任务取消API - 用于用户主动取消正在进行的图片生成任务
 * 
 * URL参数:
 * - taskId: 要取消的任务ID
 * 
 * 响应:
 * {
 *   success: boolean,
 *   message?: string,
 *   error?: string
 * }
 */
export async function POST(
  request: NextRequest,
  context: { params: { taskId: string } }
) {
  try {
    // 获取任务ID
    const { taskId } = context.params;
    
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
        error: '请先登录' 
      }, { status: 401 });
    }
    
    console.log(`收到任务取消请求: ${taskId}, 用户: ${user.id}, 时间: ${new Date().toISOString()}`);
    
    // 添加到内存缓存
    cancelledTaskIds.add(taskId);
    
    // 使用管理员客户端查询最新任务状态
    const adminClient = await createAdminClient();
    
    // 检查任务是否存在
    const { data: task, error: taskError } = await adminClient
      .from('image_tasks')
      .select('*')
      .eq('id', taskId)
      .single();
    
    if (taskError) {
      console.error('查询任务失败:', taskError);
      return NextResponse.json({ 
        success: false, 
        error: '查询任务失败' 
      }, { status: 500 });
    }
    
    if (!task) {
      return NextResponse.json({ 
        success: false, 
        error: '任务不存在' 
      }, { status: 404 });
    }
    
    // 验证任务归属权
    if (task.user_id !== user.id) {
      return NextResponse.json({ 
        success: false, 
        error: '无权操作此任务' 
      }, { status: 403 });
    }
    
    // 更新任务状态为已取消
    const { error: updateError } = await adminClient
      .from('image_tasks')
      .update({
        status: 'cancelled',
        error_message: '任务已被用户取消',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId);
    
    if (updateError) {
      console.error('更新任务状态失败:', updateError);
      return NextResponse.json({ 
        success: false, 
        error: '更新任务状态失败' 
      }, { status: 500 });
    }
    
    // 尝试给用户退还积分
    try {
      const { data: creditData, error: creditError } = await adminClient
        .from('ai_images_creator_credits')
        .select('credits')
        .eq('user_id', user.id)
        .single();
        
      if (!creditError && creditData) {
        // 增加1点积分作为退款
        await adminClient
          .from('ai_images_creator_credits')
          .update({ 
            credits: creditData.credits + 1,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);
          
        console.log(`已退还用户积分: ${user.id}`);
      }
    } catch (creditError) {
      console.error('退还积分失败:', creditError);
      // 不影响主流程，继续返回成功
    }
    
    return NextResponse.json({
      success: true,
      message: '任务取消成功',
      taskId: taskId
    });
    
  } catch (error) {
    console.error('处理任务取消请求时出错:', error);
    return NextResponse.json({ 
      success: false, 
      error: '处理任务取消请求时出错' 
    }, { status: 500 });
  }
}

/**
 * 检查任务是否已被取消
 */
export async function GET(
  request: NextRequest,
  context: { params: { taskId: string } }
) {
  try {
    const { taskId } = context.params;
    
    if (!taskId) {
      return NextResponse.json({ 
        success: false, 
        error: '缺少任务ID参数' 
      }, { status: 400 });
    }
    
    // 检查内存缓存
    const isCancelledInMemory = cancelledTaskIds.has(taskId);
    
    // 使用管理员客户端查询数据库状态
    const adminClient = await createAdminClient();
    const { data: task, error } = await adminClient
      .from('image_tasks')
      .select('status')
      .eq('id', taskId)
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