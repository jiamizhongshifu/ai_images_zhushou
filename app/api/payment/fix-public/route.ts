import { NextRequest, NextResponse } from 'next/server';
import { createTransactionalAdminClient } from '@/utils/supabase/admin';
import { handleError, ErrorLevel } from '@/utils/error-handler';
import { withRateLimit } from '@/utils/rate-limiter';
import { verifyPaymentStatus } from '@/utils/payment-validator';
import { createClient } from '@supabase/supabase-js';

// 创建 Supabase 客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * 公开的订单修复接口，支付完成后页面自动调用
 * 
 * 查询参数:
 * - order_no: 订单号 (必填)
 * 
 * 返回:
 * - success: 是否成功
 * - result: 处理结果
 */
export async function POST(request: Request) {
  try {
    const { order_no } = await request.json();
    if (!order_no) {
      return NextResponse.json({ error: 'order_no is required' }, { status: 400 });
    }

    // 检查是否有处理锁
    const lockKey = `fix_payment_${order_no}`;
    const existingLock = await supabase
      .from('ai_images_creator_locks')
      .select('*')
      .eq('key', lockKey)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (existingLock.data) {
      return NextResponse.json({
        message: '订单正在被其他进程处理中',
        order_no,
        lock_expires_at: existingLock.data.expires_at
      });
    }

    // 创建处理锁，30秒过期
    const expiresAt = new Date(Date.now() + 30000).toISOString();
    await supabase
      .from('ai_images_creator_locks')
      .insert({
        key: lockKey,
        expires_at: expiresAt
      });

    try {
      // 检查是否已经添加过点数
      const { data: creditLogs } = await supabase
        .from('ai_images_creator_credit_logs')
        .select('*')
        .eq('order_no', order_no)
        .eq('operation_type', 'recharge')
        .order('created_at', { ascending: false })
        .limit(1);

      if (creditLogs && creditLogs.length > 0) {
        console.log(`订单 ${order_no} 已经添加过点数，最后处理时间: ${creditLogs[0].created_at}`);
        
        // 更新订单状态
        const { error: updateError } = await supabase
          .from('ai_images_creator_payments')
          .update({
            status: 'success',
            points_updated: true,
            paid_at: creditLogs[0].created_at,
            callback_data: JSON.stringify({
              message: '重复处理跳过',
              last_credit_log: creditLogs[0],
              check_time: new Date().toISOString()
            }),
            updated_at: new Date().toISOString()
          })
          .eq('order_no', order_no);

        if (updateError) {
          console.warn('更新订单状态失败:', updateError);
        }

        return NextResponse.json({
          message: '订单已处理过',
          order_no,
          credit_log: creditLogs[0]
        });
      }

      // 1. 查询订单信息
      const { data: order, error: orderError } = await supabase
        .from('ai_images_creator_payments')
        .select('*')
        .eq('order_no', order_no)
        .single();
      
      if (orderError) {
        console.error(`查询订单信息失败:`, orderError);
        throw new Error(`未找到订单: ${order_no}, 错误: ${orderError.message}`);
      }
      
      if (!order) {
        throw new Error(`未找到订单: ${order_no}`);
      }
      
      // 记录访问日志
      await logPaymentCheck(supabase, order_no, order.user_id, 'fix-public');
      
      // 如果订单已经成功，则跳过
      if (order.status === 'success') {
        return NextResponse.json({ message: '订单已处理', order });
      }
      
      // 2. 验证支付状态 - 新增验证步骤
      const paymentVerified = await verifyPaymentStatus(order_no);
      
      if (!paymentVerified) {
        // 记录处理历史，但不标记订单为成功
        await logPaymentProcessHistory(supabase, order_no, 'fix-public', 'skipped', {
          reason: '支付验证未通过',
          time: new Date().toISOString()
        });
        
        return NextResponse.json({ 
          message: '订单验证中，请等待支付完成', 
          order,
          status: 'pending' 
        });
      }
      
      // 检查是否已经有点数记录
      const { data: creditLogsExisting, error: creditLogsError } = await supabase
        .from('ai_images_creator_credit_logs')
        .select('id, created_at, change_value')
        .eq('order_no', order_no)
        .eq('operation_type', 'recharge')
        .order('created_at', { ascending: false })
        .limit(1);
      
      // 如果已经增加过点数，跳过
      if (!creditLogsError && creditLogsExisting && creditLogsExisting.length > 0) {
        console.log(`订单 ${order_no} 已经增加过点数，记录时间: ${creditLogsExisting[0].created_at}, 增加数量: ${creditLogsExisting[0].change_value}`);
        
        // 更新订单状态和标记
        const { error: updateError } = await supabase
          .from('ai_images_creator_payments')
          .update({
            status: 'success',
            credits_updated: true,
            updated_at: new Date().toISOString(),
            callback_data: {
              ...order.callback_data,
              fix_public_recheck: true,
              last_check_time: new Date().toISOString()
            }
          })
          .eq('order_no', order_no);
          
        if (updateError) {
          console.warn(`更新订单状态失败: ${updateError.message}，但不影响处理`);
        }
        
        // 记录处理历史
        await logPaymentProcessHistory(supabase, order_no, 'fix-public', 'skipped', {
          reason: '已有点数记录',
          credits: creditLogsExisting[0].change_value,
          process_time: creditLogsExisting[0].created_at,
          check_time: new Date().toISOString()
        });
        
        return { 
          message: '订单已处理过点数', 
          order: { ...order, status: 'success', credits_updated: true }, 
          creditLogs: creditLogsExisting,
          hasExistingCredits: true,
          lastProcessTime: creditLogsExisting[0].created_at
        };
      }
      
      // 如果订单已经是成功状态，再次检查点数记录
      if (order.status === 'success') {
        // 双重检查点数记录
        const { data: recentLogs } = await supabase
          .from('ai_images_creator_credit_logs')
          .select('id, created_at')
          .eq('order_no', order_no)
          .eq('operation_type', 'recharge')
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (recentLogs && recentLogs.length > 0) {
          console.log(`订单 ${order_no} 状态为成功且已有点数记录，最后处理时间: ${recentLogs[0].created_at}`);
          return NextResponse.json({
            message: '订单已成功且已处理点数',
            order: { ...order, credits_updated: true },
            lastProcessTime: recentLogs[0].created_at
          });
        }
      }
      
      // 3. 更新订单状态为成功
      const { error: updateError } = await supabase
        .from('ai_images_creator_payments')
        .update({
          status: 'success',
          paid_at: new Date().toISOString(),
          callback_data: {
            method: 'fix-public',
            time: new Date().toISOString(),
            verified: true
          },
          updated_at: new Date().toISOString()
        })
        .eq('order_no', order_no);
      
      if (updateError) {
        throw new Error(`更新订单状态失败: ${updateError.message}`);
      }
      
      // 4. 检查是否已经增加过点数
      const { data: credits, error: creditsError } = await supabase
        .from('ai_images_creator_credits')
        .select('credits')
        .eq('user_id', order.user_id)
        .single();
      
      if (creditsError) {
        throw new Error(`查询用户点数失败: ${creditsError.message}`);
      }
      
      const oldCredits = credits ? credits.credits : 0;
      const addCredits = order.credits || 0;
      const newCredits = oldCredits + addCredits;
      
      // 6. 更新用户点数
      const { error: updateCreditsError } = await supabase
        .from('ai_images_creator_credits')
        .update({
          credits: newCredits,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', order.user_id);
      
      if (updateCreditsError) {
        throw new Error(`更新用户点数失败: ${updateCreditsError.message}`);
      }
      
      // 7. 记录点数变更日志
      const { error: logError } = await supabase
        .from('ai_images_creator_credit_logs')
        .insert({
          user_id: order.user_id,
          order_no: order.order_no,
          operation_type: 'recharge',
          old_value: oldCredits,
          change_value: addCredits,
          new_value: newCredits,
          created_at: new Date().toISOString(),
          note: `支付成功，增加${addCredits}点`
        });
      
      if (logError) {
        throw new Error(`记录点数变更日志失败: ${logError.message}`);
      }
      
      // 8. 记录处理历史
      await logPaymentProcessHistory(supabase, order_no, 'fix-public', 'success', {
        oldCredits,
        addCredits,
        newCredits,
        time: new Date().toISOString()
      });
      
      return NextResponse.json({
        message: '订单已修复，状态已更新为成功，点数已增加',
        oldCredits,
        addCredits,
        newCredits
      });
    } finally {
      // 清理处理锁
      await supabase
        .from('ai_images_creator_locks')
        .delete()
        .eq('key', lockKey);
    }
  } catch (error) {
    console.error('处理订单时发生错误:', error);
    return NextResponse.json({ error: '处理订单时发生错误' }, { status: 500 });
  }
}

// 修改速率限制中间件的类型
export const GET = withRateLimit(
  async (req: NextRequest) => {
    const response = await POST(req);
    if (!(response instanceof NextResponse)) {
      return NextResponse.json(response);
    }
    return response;
  },
  {
    limit: 10,
    windowMs: 60 * 1000,
    message: '请求过于频繁，请稍后再试'
  }
);

/**
 * 记录支付操作日志
 */
async function logPaymentCheck(client: any, orderNo: string, userId?: string, processType: string = 'check') {
  try {
    await client.from('ai_images_creator_payment_logs').insert({
      order_no: orderNo,
      user_id: userId || 'anonymous',
      process_type: processType,
      status: 'pending',
      created_at: new Date().toISOString()
    });
    
    return true;
  } catch (error) {
    // 只记录错误，不阻止主流程
    console.warn('记录支付操作日志失败:', error);
    return false;
  }
}

/**
 * 记录支付处理历史
 */
async function logPaymentProcessHistory(client: any, orderNo: string, processType: string, status: string, details: any = {}) {
  try {
    await client.from('ai_images_creator_payment_process_history').insert({
      order_no: orderNo,
      process_type: processType,
      status: status,
      details: details,
      created_at: new Date().toISOString()
    });
    
    return true;
  } catch (error) {
    // 只记录错误，不阻止主流程
    console.warn('记录支付处理历史失败:', error);
    return false;
  }
} 