import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

interface ErrorWithMessage {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

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
    
    console.log(`收到取消任务请求: ${taskId}`);
    
    // 获取Supabase客户端
    const supabase = await createClient();
    // 同时创建管理员客户端用于备用和验证
    const adminSupabase = createAdminClient();
    
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
    
    console.log(`查询到任务信息:`, {
      taskId: task.task_id,
      status: task.status,
      userId: task.user_id,
      creditsDeducted: task.credits_deducted,
      creditsRefunded: task.credits_refunded,
      createdAt: task.created_at,
      updatedAt: task.updated_at
    });
    
    // 检查任务是否可以取消
    // 只有pending或processing状态的任务可以取消
    if (task.status !== 'pending' && task.status !== 'processing') {
      return NextResponse.json({ 
        success: false, 
        error: `无法取消${task.status}状态的任务` 
      }, { status: 400 });
    }
    
    // 使用多种方法尝试取消任务
    let cancelSuccess = false;
    let cancelResult = null;
    let rpcError: ErrorWithMessage | null = null;
    let updateError: ErrorWithMessage | null = null;
    let adminUpdateError: ErrorWithMessage | null = null;
    
    // 1. 首先尝试使用RPC函数取消任务
    try {
      const { data: result, error } = await supabase
        .rpc('cancel_task', {
          task_id_param: taskId,
          user_id_param: user.id
        });
      
      cancelResult = result;
      rpcError = error as ErrorWithMessage;
      
      if (!error && result === true) {
        console.log(`成功通过RPC函数取消任务: ${taskId}, 结果: ${result}`);
        cancelSuccess = true;
      } else if (error) {
        console.error(`RPC函数调用失败:`, error);
      } else {
        console.warn(`RPC函数返回非预期结果: ${result}`);
      }
    } catch (error) {
      console.error(`RPC函数执行异常:`, error);
      rpcError = error as ErrorWithMessage;
    }
    
    // 2. 如果RPC函数失败，尝试直接更新状态
    if (!cancelSuccess) {
      try {
        console.log(`RPC函数调用失败，回退到直接更新:`, rpcError);
        
        // 直接更新任务状态为已取消
        const { error } = await supabase
          .from("ai_images_creator_tasks")
          .update({
            status: "cancelled",
            error_message: "用户主动取消任务",
            updated_at: new Date().toISOString(),
          })
          .eq("task_id", taskId)
          .eq("user_id", user.id); // 确保只更新用户自己的任务
    
        updateError = error as ErrorWithMessage;
        
        if (!error) {
          console.log(`成功通过直接更新取消任务: ${taskId}`);
          cancelSuccess = true;
        } else {
          console.error("取消任务时出错:", error);
        }
      } catch (error) {
        console.error(`直接更新任务状态异常:`, error);
        updateError = error as ErrorWithMessage;
      }
    }
    
    // 3. 如果前两种方法都失败，使用管理员权限强制更新
    if (!cancelSuccess) {
      try {
        console.log(`普通权限更新失败，尝试使用管理员权限强制更新...`);
        
        // 使用管理员客户端直接更新状态，绕过权限问题
        const { error } = await adminSupabase
          .from("ai_images_creator_tasks")
          .update({
            status: "cancelled",
            error_message: "用户主动取消任务（管理员权限）",
            updated_at: new Date().toISOString(),
          })
          .eq("task_id", taskId)
          .eq("user_id", user.id); // 仍然验证用户ID
        
        adminUpdateError = error as ErrorWithMessage;
        
        if (!error) {
          console.log(`成功通过管理员权限更新取消任务: ${taskId}`);
          cancelSuccess = true;
        } else {
          console.error("管理员权限取消任务失败:", error);
        }
      } catch (error) {
        console.error(`管理员更新任务状态异常:`, error);
        adminUpdateError = error as ErrorWithMessage;
      }
    }
    
    // 4. 验证任务是否真的被取消了 - 使用多次重试
    let verificationAttempts = 0;
    const MAX_VERIFY_ATTEMPTS = 3;
    let verifySuccess = false;
    
    while (!verifySuccess && verificationAttempts < MAX_VERIFY_ATTEMPTS) {
      verificationAttempts++;
      try {
        // 强制等待一小段时间，让数据库操作完成
        await new Promise(resolve => setTimeout(resolve, 500 * verificationAttempts));
        
        // 使用管理员客户端获取最新状态，避免权限问题
        const { data: verifyTask, error: verifyError } = await adminSupabase
          .from('ai_images_creator_tasks')
          .select('status')
          .eq('task_id', taskId)
          .single();
        
        if (!verifyError && verifyTask) {
          console.log(`验证尝试 ${verificationAttempts}: 任务 ${taskId} 当前状态为 ${verifyTask.status}`);
          
          if (verifyTask.status === 'cancelled') {
            console.log(`确认任务 ${taskId} 已成功取消，状态已变更为: ${verifyTask.status}`);
            verifySuccess = true;
            cancelSuccess = true;
            break;
          } else if (verifyTask.status !== 'pending' && verifyTask.status !== 'processing') {
            // 如果状态不是pending或processing，那么我们认为已经不需要再取消
            console.log(`任务 ${taskId} 当前状态为 ${verifyTask.status}，已不需要取消`);
            verifySuccess = true;
            cancelSuccess = true;
            break;
          } else if (verificationAttempts < MAX_VERIFY_ATTEMPTS) {
            // 如果状态仍为pending或processing，且还有重试次数，则尝试再次强制更新
            console.log(`任务 ${taskId} 仍处于 ${verifyTask.status} 状态，尝试再次强制更新...`);
            
            // 再次尝试强制更新状态
            await adminSupabase
              .from("ai_images_creator_tasks")
              .update({
                status: "cancelled",
                error_message: `用户主动取消任务（强制更新尝试 ${verificationAttempts}）`,
                updated_at: new Date().toISOString(),
              })
              .eq("task_id", taskId);
          }
        }
      } catch (error) {
        console.error(`验证任务取消状态异常 (尝试 ${verificationAttempts}):`, error);
      }
    }
    
    // 5. 如果所有方法都失败，返回错误
    if (!cancelSuccess) {
      return NextResponse.json(
        {
          success: false,
          error: "无法取消任务，请稍后重试",
          details: {
            rpcError: rpcError?.message || null,
            updateError: updateError?.message || null,
            adminUpdateError: adminUpdateError?.message || null,
            verificationAttempts
          }
        },
        { status: 500 }
      );
    }
    
    // 6. 通知任务处理器任务已取消（异步进行，不影响响应）
    try {
      const TASK_PROCESS_SECRET_KEY = process.env.TASK_PROCESS_SECRET_KEY || '';
      // 异步发送通知，不等待响应
      fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/generate-image/notify-cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TASK_PROCESS_SECRET_KEY}`
        },
        body: JSON.stringify({ 
          taskId,
          userId: user.id,
          cancelTime: new Date().toISOString()
        })
      }).catch(error => {
        console.warn('发送取消通知失败，但这不影响主要流程:', error);
      });
    } catch (notifyError) {
      console.warn('准备取消通知失败，但这不影响主要流程:', notifyError);
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
      creditsRefunded: creditsRefunded,
      taskId: taskId,
      cancelMethod: cancelResult ? 'rpc' : adminUpdateError ? 'admin_update' : 'direct_update',
      finalStatus: 'cancelled',
      verificationAttempts
    });

  } catch (error) {
    console.error('取消任务时发生错误:', error);
    return NextResponse.json({ 
      success: false, 
      error: '取消任务时发生内部错误' 
    }, { status: 500 });
  }
} 