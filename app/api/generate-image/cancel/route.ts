import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * 取消图像生成任务API
 * 
 * 请求参数:
 * - taskId: 要取消的任务ID
 * 
 * 返回内容:
 * - success: 是否成功
 * - message: 消息
 * - error: 错误信息(如果有)
 * - creditsRefunded: 是否退还点数
 */
export async function POST(request: NextRequest) {
  try {
    // 获取请求数据
    const body = await request.json();
    const { taskId } = body;
    
    // 验证请求参数
    if (!taskId) {
      return NextResponse.json({ 
        success: false, 
        error: '缺少任务ID参数' 
      }, { status: 400 });
    }
    
    // 获取Supabase客户端
    const supabase = await createClient();
    
    // 验证用户身份
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ 
        success: false, 
        error: '未授权访问' 
      }, { status: 401 });
    }
    
    // 查询任务信息，确认任务存在且属于当前用户
    const { data: task, error: queryError } = await supabase
      .from('ai_images_creator_tasks')
      .select('*')
      .eq('task_id', taskId)
      .eq('user_id', user.id)
      .single();
    
    if (queryError) {
      console.error('查询任务失败:', queryError);
      
      // 如果是记录不存在的错误
      if (queryError.code === 'PGRST116') {
        return NextResponse.json({ 
          success: false, 
          error: '任务不存在或无权限操作' 
        }, { status: 404 });
      }
      
      return NextResponse.json({ 
        success: false, 
        error: '查询任务信息失败' 
      }, { status: 500 });
    }
    
    // 检查任务是否可以取消
    // 只有pending或processing状态的任务可以取消
    if (task.status !== 'pending' && task.status !== 'processing') {
      return NextResponse.json({ 
        success: false, 
        error: `无法取消${task.status}状态的任务` 
      }, { status: 400 });
    }
    
    // 尝试使用RPC函数取消任务
    const { data: cancelResult, error: rpcError } = await supabase
      .rpc('cancel_task', {
        task_id_param: taskId,
        user_id_param: user.id
      });

    // 如果RPC函数不存在或出错，尝试直接更新状态
    if (rpcError) {
      console.log(`RPC函数调用失败，回退到直接更新:`, rpcError);
      
      // 直接更新任务状态为已取消
      const { error: updateError } = await supabase
        .from("ai_images_creator_tasks")
        .update({
          status: "cancelled",
          error_message: "用户主动取消任务",
          updated_at: new Date().toISOString(),
        })
        .eq("task_id", taskId)
        .eq("user_id", user.id); // 确保只更新用户自己的任务

      if (updateError) {
        console.error("取消任务时出错:", updateError);
        return NextResponse.json(
          {
            success: false,
            error: "取消任务失败",
            details: updateError.message,
          },
          { status: 500 }
        );
      }
    } else {
      console.log(`成功通过RPC函数取消任务:`, cancelResult);
    }
    
    // 检查是否需要退还点数
    let creditsRefunded = false;
    
    if (task.credits_deducted && !task.credits_refunded) {
      // 退还点数
      const { error: creditError } = await supabase.rpc('increment_user_credits', {
        user_id_param: user.id,
        credits_to_add: 1  // 假设每个任务扣除1点
      });
      
      if (creditError) {
        console.error('退还点数失败:', creditError);
        
        // 即使退还点数失败，任务取消操作已经成功，返回成功但带警告
        return NextResponse.json({ 
          success: true, 
          warning: '任务已取消，但点数退还失败，请联系客服' 
        });
      }
      
      // 更新任务的退款状态
      const { error: refundError } = await supabase
        .from('ai_images_creator_tasks')
        .update({ credits_refunded: true })
        .eq('task_id', taskId);
      
      if (refundError) {
        console.error('更新任务退款状态失败:', refundError);
        // 退款已经成功，但标记失败，不影响主流程
      } else {
        creditsRefunded = true;
      }
    }
    
    // 返回成功消息
    return NextResponse.json({ 
      success: true, 
      message: '任务已成功取消',
      creditsRefunded: creditsRefunded
    });

  } catch (error) {
    console.error('取消任务时发生错误:', error);
    return NextResponse.json({ 
      success: false, 
      error: '取消任务时发生内部错误' 
    }, { status: 500 });
  }
} 