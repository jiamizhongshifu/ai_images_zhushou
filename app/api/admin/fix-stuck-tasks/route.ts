import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 允许长达5分钟的执行时间

// 权限检查函数
const isAuthorized = (req: NextRequest): boolean => {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  
  const token = authHeader.split(' ')[1];
  return token === process.env.ADMIN_API_SECRET_KEY;
};

// 退还用户点数
const refundCredits = async (userId: string) => {
  try {
    const supabase = createAdminClient();
    
    // 获取当前点数
    const { data: currentData, error: fetchError } = await supabase
      .from('ai_images_creator_credits')
      .select('credits')
      .eq('user_id', userId)
      .single();
    
    if (fetchError) {
      console.error(`获取用户 ${userId} 点数失败:`, fetchError);
      return false;
    }
    
    // 更新点数 (+1)
    const { error: updateError } = await supabase
      .from('ai_images_creator_credits')
      .update({ 
        credits: (currentData?.credits || 0) + 1 
      })
      .eq('user_id', userId);
    
    if (updateError) {
      console.error(`为用户 ${userId} 退还点数失败:`, updateError);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`退还点数过程中出错:`, error);
    return false;
  }
};

// 更新任务退款状态
const updateTaskRefundStatus = async (taskId: string, refunded: boolean) => {
  const supabase = createAdminClient();
  await supabase
    .from('ai_images_creator_tasks')
    .update({ 
      credits_refunded: refunded 
    })
    .eq('task_id', taskId);
};

export async function POST(req: NextRequest) {
  // 权限检查
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: '未授权访问' },
      { status: 401 }
    );
  }
  
  try {
    const { timeThresholdMinutes = 30 } = await req.json();
    
    // 计算截止时间（当前时间减去阈值分钟数）
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - timeThresholdMinutes);
    
    const supabase = createAdminClient();
    
    // 获取所有卡在processing状态超过指定时间的任务
    const { data: stuckTasks, error: fetchError } = await supabase
      .from('ai_images_creator_tasks')
      .select('*')
      .eq('status', 'processing')
      .lt('created_at', cutoffTime.toISOString());
    
    if (fetchError) {
      console.error('获取卡住任务失败:', fetchError);
      return NextResponse.json(
        { error: '获取卡住任务失败', details: fetchError },
        { status: 500 }
      );
    }
    
    if (!stuckTasks || stuckTasks.length === 0) {
      return NextResponse.json({
        success: true,
        message: '没有找到卡住的任务',
        count: 0
      });
    }
    
    console.log(`找到 ${stuckTasks.length} 个卡住的任务`);
    
    // 处理每个卡住的任务
    const results = [];
    for (const task of stuckTasks) {
      try {
        // 更新任务状态为失败
        const { error: updateError } = await supabase
          .from('ai_images_creator_tasks')
          .update({
            status: 'failed',
            error_message: `任务处理超时（超过${timeThresholdMinutes}分钟）`,
            updated_at: new Date().toISOString()
          })
          .eq('task_id', task.task_id);
        
        if (updateError) {
          console.error(`更新任务 ${task.task_id} 状态失败:`, updateError);
          results.push({
            taskId: task.task_id,
            success: false,
            error: '更新任务状态失败'
          });
          continue;
        }
        
        // 如果任务已扣除点数但未退还，则退还点数
        if (task.credits_deducted && !task.credits_refunded) {
          const refundSuccess = await refundCredits(task.user_id);
          if (refundSuccess) {
            await updateTaskRefundStatus(task.task_id, true);
            results.push({
              taskId: task.task_id,
              success: true,
              statusUpdated: true,
              creditsRefunded: true
            });
          } else {
            results.push({
              taskId: task.task_id,
              success: true,
              statusUpdated: true,
              creditsRefunded: false,
              error: '退还点数失败'
            });
          }
        } else {
          results.push({
            taskId: task.task_id,
            success: true,
            statusUpdated: true,
            creditsRefunded: task.credits_refunded || false,
            message: task.credits_deducted ? '点数已经退还' : '任务未扣除点数'
          });
        }
      } catch (error) {
        console.error(`处理任务 ${task.task_id} 时出错:`, error);
        results.push({
          taskId: task.task_id,
          success: false,
          error: '处理任务时发生内部错误'
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      count: stuckTasks.length,
      results
    });
    
  } catch (error) {
    console.error('处理卡住任务时发生错误:', error);
    return NextResponse.json(
      { error: '处理卡住任务时发生内部错误', details: error },
      { status: 500 }
    );
  }
}

// 用于获取卡住任务统计的GET方法
export async function GET(req: NextRequest) {
  // 权限检查
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: '未授权访问' },
      { status: 401 }
    );
  }
  
  try {
    // 从查询参数获取阈值分钟数
    const searchParams = req.nextUrl.searchParams;
    const timeThresholdMinutes = parseInt(searchParams.get('timeThresholdMinutes') || '30');
    
    // 计算截止时间
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - timeThresholdMinutes);
    
    const supabase = createAdminClient();
    
    // 获取卡住任务的数量
    const { count, error: countError } = await supabase
      .from('ai_images_creator_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'processing')
      .lt('created_at', cutoffTime.toISOString());
    
    if (countError) {
      console.error('获取卡住任务统计失败:', countError);
      return NextResponse.json(
        { error: '获取卡住任务统计失败', details: countError },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      stuckTaskCount: count || 0,
      cutoffTime: cutoffTime.toISOString(),
      timeThresholdMinutes
    });
    
  } catch (error) {
    console.error('获取卡住任务统计时发生错误:', error);
    return NextResponse.json(
      { error: '获取卡住任务统计时发生内部错误', details: error },
      { status: 500 }
    );
  }
} 