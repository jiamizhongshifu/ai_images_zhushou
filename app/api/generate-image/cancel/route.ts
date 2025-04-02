import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { TaskStatus } from "@/types/task";

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
    const requestData = await request.json();
    const { taskId } = requestData;
    
    // 参数验证
    if (!taskId) {
      return NextResponse.json(
        { success: false, error: "缺少任务ID" },
        { status: 400 }
      );
    }
    
    // 创建Supabase客户端并验证用户身份
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "未授权访问" },
        { status: 401 }
      );
    }
    
    // 获取任务信息
    const { data: taskData, error: taskError } = await supabase
      .from("ai_images_creator_tasks")
      .select("*")
      .eq("id", taskId)
      .eq("user_id", user.id)
      .single();
    
    if (taskError || !taskData) {
      return NextResponse.json(
        { success: false, error: "任务不存在或无权限取消" },
        { status: 404 }
      );
    }
    
    // 检查任务状态，只有pending和processing状态的任务才能取消
    if (taskData.status !== TaskStatus.PENDING && taskData.status !== TaskStatus.PROCESSING) {
      return NextResponse.json(
        { success: false, error: `任务已${taskData.status === TaskStatus.COMPLETED ? '完成' : taskData.status === TaskStatus.FAILED ? '失败' : '取消'}，无法取消` },
        { status: 400 }
      );
    }
    
    // 更新任务状态为已取消
    const { error: updateError } = await supabase
      .from("ai_images_creator_tasks")
      .update({
        status: TaskStatus.CANCELLED,
        updated_at: new Date().toISOString(),
        error_message: "用户主动取消任务"
      })
      .eq("id", taskId);
    
    if (updateError) {
      return NextResponse.json(
        { success: false, error: "取消任务失败" },
        { status: 500 }
      );
    }
    
    // 退还用户点数
    let creditsRefunded = false;
    
    // 查询用户点数记录
    const { data: creditData, error: creditError } = await supabase
      .from("ai_images_creator_credits")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    
    if (!creditError && creditData) {
      // 更新用户点数
      const { error: updateCreditError } = await supabase
        .from("ai_images_creator_credits")
        .insert({
          user_id: user.id,
          credits: creditData.credits + 1, // 假设生成一张图片消耗1点
          operation: "refund",
          reason: `取消任务 ${taskId}`
        });
      
      if (!updateCreditError) {
        creditsRefunded = true;
      }
    }
    
    return NextResponse.json({
      success: true,
      message: "任务已成功取消",
      creditsRefunded
    });
  } catch (error) {
    console.error("取消任务时出错:", error);
    return NextResponse.json(
      { success: false, error: "取消任务时发生内部错误" },
      { status: 500 }
    );
  }
} 