import { NextRequest } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * 更新用户点数的API接口
 * 
 * 请求体参数:
 * - userId: 用户ID
 * - action: 'deduct'(扣除) 或 'add'(增加)
 * - amount: 点数变更量(默认为1)
 * 
 * 返回:
 * - success: 是否成功
 * - credits: 更新后的用户点数
 * - error: 错误信息(如果有)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, action, amount = 1 } = body;

    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: "缺少用户ID" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (action !== 'deduct' && action !== 'add') {
      return new Response(JSON.stringify({ success: false, error: "无效的操作类型" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 创建Supabase管理员客户端
    const supabase = await createAdminClient();

    // 查询用户当前点数
    const { data: currentCredits, error: fetchError } = await supabase
      .from('ai_images_creator_credits')
      .select('credits')
      .eq('user_id', userId)
      .maybeSingle();

    // 如果记录不存在，先创建一个初始记录
    if (!currentCredits) {
      console.log(`用户 ${userId} 点数记录不存在，创建初始记录`);
      
      // 设置初始点数，如果是扣除操作，则设为5-amount，如果是增加操作，则设为5+amount
      const initialCredits = action === 'deduct' ? 5 - amount : 5 + amount;
      
      // 如果是扣除操作且初始点数为负数，则返回点数不足
      if (action === 'deduct' && initialCredits < 0) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "点数不足", 
          credits: 5 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // 创建初始记录
      const { data: newCredits, error: insertError } = await supabase
        .from('ai_images_creator_credits')
        .insert({ 
          user_id: userId, 
          credits: initialCredits,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('credits')
        .single();
      
      if (insertError) {
        console.error("创建用户点数记录失败:", insertError);
        return new Response(JSON.stringify({ success: false, error: "创建用户点数记录失败" }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ 
        success: true, 
        credits: newCredits.credits
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 简化错误处理，避免类型错误
    if (fetchError) {
      console.error("获取用户点数失败:", fetchError);
      return new Response(JSON.stringify({ success: false, error: "获取用户点数失败" }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let newCredits = currentCredits ? currentCredits.credits : 5; // 默认给5点

    // 根据操作类型计算新的点数
    if (action === 'deduct') {
      if (newCredits < amount) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "点数不足", 
          credits: newCredits 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      newCredits -= amount;
    } else { // action === 'add'
      newCredits += amount;
    }

    // 更新用户点数
    const { data: updatedCredits, error: updateError } = await supabase
      .from('ai_images_creator_credits')
      .update({ 
        credits: newCredits,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select('credits')
      .single();

    if (updateError) {
      console.error("更新用户点数失败:", updateError);
      return new Response(JSON.stringify({ success: false, error: "更新用户点数失败" }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      credits: updatedCredits.credits
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("处理用户点数更新请求时出错:", error);
    return new Response(JSON.stringify({ success: false, error: error.message || "服务器内部错误" }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 