import { NextRequest } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * 重新计算并同步用户点数的API
 * 通过检查充值记录和消费记录，确保点数准确
 * 
 * 请求参数:
 * - user_id: 用户ID (可选，如果不提供则同步所有用户)
 * 
 * 返回:
 * - success: 是否成功
 * - data: 更新结果
 * - error: 错误信息(如果有)
 */
export async function POST(request: NextRequest) {
  try {
    const { user_id } = await request.json();
    
    // 创建管理员客户端
    const adminClient = await createAdminClient();
    
    // 准备查询条件
    const userCondition = user_id ? { user_id } : {};
    
    // 1. 获取所有需要同步的用户
    const { data: users, error: usersError } = user_id 
      ? await adminClient.from('ai_images_creator_credits').select('user_id, credits').eq('user_id', user_id)
      : await adminClient.from('ai_images_creator_credits').select('user_id, credits');
    
    if (usersError) {
      console.error("获取用户列表失败:", usersError);
      return new Response(JSON.stringify({ success: false, error: "获取用户列表失败" }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 同步结果记录
    const results = [];
    
    // 2. 对每个用户进行同步
    for (const user of users || []) {
      try {
        // 2.1 获取所有充值记录
        const { data: rechargeRecords, error: rechargeError } = await adminClient
          .from('ai_images_creator_payments')
          .select('order_no, credits')
          .eq('user_id', user.user_id)
          .eq('status', 'success');
        
        if (rechargeError) {
          console.error(`获取用户 ${user.user_id} 的充值记录失败:`, rechargeError);
          results.push({
            user_id: user.user_id,
            success: false,
            error: "获取充值记录失败"
          });
          continue;
        }
        
        // 2.2 获取所有消费记录
        const { data: consumptionLogs, error: consumptionError } = await adminClient
          .from('ai_images_creator_credit_logs')
          .select('order_no, operation_type, change_value')
          .eq('user_id', user.user_id)
          .eq('operation_type', 'consume');
        
        if (consumptionError) {
          console.error(`获取用户 ${user.user_id} 的消费记录失败:`, consumptionError);
          results.push({
            user_id: user.user_id,
            success: false,
            error: "获取消费记录失败"
          });
          continue;
        }
        
        // 2.3 计算正确的点数
        // 默认初始点数
        let calculatedCredits = 5;
        
        // 添加所有充值
        if (rechargeRecords) {
          const totalRecharge = rechargeRecords.reduce((sum, record) => sum + (record.credits || 0), 0);
          calculatedCredits += totalRecharge;
        }
        
        // 减去所有消费
        if (consumptionLogs) {
          const totalConsumption = consumptionLogs.reduce((sum, log) => sum + Math.abs(log.change_value || 0), 0);
          calculatedCredits -= totalConsumption;
        }
        
        // 2.4 更新用户点数
        if (calculatedCredits !== user.credits) {
          console.log(`用户 ${user.user_id} 点数需要同步: 当前=${user.credits}, 计算值=${calculatedCredits}`);
          
          const { error: updateError } = await adminClient
            .from('ai_images_creator_credits')
            .update({
              credits: calculatedCredits,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', user.user_id);
          
          if (updateError) {
            console.error(`更新用户 ${user.user_id} 点数失败:`, updateError);
            results.push({
              user_id: user.user_id,
              success: false,
              error: "更新点数失败"
            });
            continue;
          }
          
          // 2.5 记录同步日志
          await adminClient
            .from('ai_images_creator_credit_logs')
            .insert({
              user_id: user.user_id,
              operation_type: 'sync',
              old_value: user.credits,
              change_value: calculatedCredits - user.credits,
              new_value: calculatedCredits,
              created_at: new Date().toISOString(),
              note: '系统自动同步点数'
            });
          
          results.push({
            user_id: user.user_id,
            success: true,
            old_credits: user.credits,
            new_credits: calculatedCredits,
            diff: calculatedCredits - user.credits
          });
        } else {
          results.push({
            user_id: user.user_id,
            success: true,
            message: "点数已同步，无需更新"
          });
        }
      } catch (userError) {
        console.error(`处理用户 ${user.user_id} 时出错:`, userError);
        results.push({
          user_id: user.user_id,
          success: false,
          error: `处理异常: ${userError instanceof Error ? userError.message : String(userError)}`
        });
      }
    }
    
    // 返回同步结果
    return new Response(JSON.stringify({ 
      success: true, 
      data: {
        total: users?.length || 0,
        updated: results.filter(r => r.success && r.diff !== undefined).length,
        results
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error("同步点数过程中出错:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : "同步点数失败" 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 