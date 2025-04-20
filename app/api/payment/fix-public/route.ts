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
export async function POST(request: Request): Promise<Response> {
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
      // 1. 先查询订单基本信息
      const { data: orders, error: orderQueryError } = await supabase
        .from('ai_images_creator_payments')
        .select('*')
        .eq('order_no', order_no);

      if (orderQueryError) {
        console.error(`查询订单信息失败:`, orderQueryError);
        return NextResponse.json({ 
          error: `查询订单信息失败: ${orderQueryError.message}` 
        }, { status: 500 });
      }

      if (!orders || orders.length === 0) {
        return NextResponse.json({ 
          error: `未找到订单: ${order_no}` 
        }, { status: 404 });
      }

      const order = orders[0];
      
      // 记录访问日志
      await logPaymentCheck(supabase, order_no, order.user_id, 'fix-public');

      // 2. 检查点数记录
      const { data: creditLogs } = await supabase
        .from('ai_images_creator_credit_logs')
        .select('*')
        .eq('order_no', order_no)
        .eq('operation_type', 'recharge')
        .order('created_at', { ascending: false })
        .limit(1);

      // 如果已经有点数记录，说明订单已处理
      if (creditLogs && creditLogs.length > 0) {
        console.log(`订单 ${order_no} 已经添加过点数，最后处理时间: ${creditLogs[0].created_at}`);
        
        // 更新订单状态确保一致性
        await supabase
          .from('ai_images_creator_payments')
          .update({
            status: 'success',
            credits_updated: true,
            paid_at: creditLogs[0].created_at,
            callback_data: {
              message: '重复处理跳过',
              last_credit_log: creditLogs[0],
              check_time: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          })
          .eq('order_no', order_no);

        return NextResponse.json({
          message: '订单已处理过',
          order_no,
          credit_log: creditLogs[0],
          status: 'success'
        });
      }

      // 3. 如果订单状态是成功但没有点数记录，需要补充点数
      if (order.status === 'success') {
        // 查询用户当前点数
        const { data: credits, error: creditsError } = await supabase
          .from('ai_images_creator_credits')
          .select('credits')
          .eq('user_id', order.user_id)
          .single();

        if (creditsError && creditsError.code !== 'PGRST116') {
          return NextResponse.json({ 
            error: `查询用户点数失败: ${creditsError.message}` 
          }, { status: 500 });
        }

        const oldCredits = credits?.credits || 0;
        const addCredits = order.credits || 0;
        const newCredits = oldCredits + addCredits;

        // 更新用户点数
        if (creditsError?.code === 'PGRST116') {
          // 创建新的点数记录
          await supabase
            .from('ai_images_creator_credits')
            .insert({
              user_id: order.user_id,
              credits: addCredits,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              last_order_no: order_no
            });
        } else {
          // 更新现有点数
          await supabase
            .from('ai_images_creator_credits')
            .update({
              credits: newCredits,
              updated_at: new Date().toISOString(),
              last_order_no: order_no
            })
            .eq('user_id', order.user_id);
        }

        // 记录点数变更
        await supabase
          .from('ai_images_creator_credit_logs')
          .insert({
            user_id: order.user_id,
            order_no: order_no,
            operation_type: 'recharge',
            old_value: oldCredits,
            change_value: addCredits,
            new_value: newCredits,
            created_at: new Date().toISOString(),
            note: `补充点数${addCredits}点`
          });

        // 记录处理历史
        await logPaymentProcessHistory(supabase, order_no, 'fix-public', 'success', {
          oldCredits,
          addCredits,
          newCredits,
          time: new Date().toISOString(),
          type: 'recovery'
        });

        return NextResponse.json({
          message: '订单已修复，补充点数成功',
          oldCredits,
          addCredits,
          newCredits,
          status: 'success'
        });
      }

      // 4. 如果订单状态不是成功，尝试验证支付状态
      const paymentVerified = await verifyPaymentStatus(order_no);
      
      if (!paymentVerified) {
        // 记录处理历史
        await logPaymentProcessHistory(supabase, order_no, 'fix-public', 'pending', {
          reason: '支付验证未通过',
          time: new Date().toISOString()
        });
        
        return NextResponse.json({ 
          message: '订单验证中，请等待支付完成', 
          order,
          status: 'pending' 
        });
      }

      // 5. 支付验证通过，更新订单状态
      await supabase
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

      // 6. 更新用户点数
      const { data: currentCredits, error: currentCreditsError } = await supabase
        .from('ai_images_creator_credits')
        .select('credits')
        .eq('user_id', order.user_id)
        .single();

      const oldCredits = currentCredits?.credits || 0;
      const addCredits = order.credits || 0;
      const newCredits = oldCredits + addCredits;

      if (currentCreditsError?.code === 'PGRST116') {
        // 创建新的点数记录
        await supabase
          .from('ai_images_creator_credits')
          .insert({
            user_id: order.user_id,
            credits: addCredits,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_order_no: order_no
          });
      } else {
        // 更新现有点数
        await supabase
          .from('ai_images_creator_credits')
          .update({
            credits: newCredits,
            updated_at: new Date().toISOString(),
            last_order_no: order_no
          })
          .eq('user_id', order.user_id);
      }

      // 7. 记录点数变更
      await supabase
        .from('ai_images_creator_credit_logs')
        .insert({
          user_id: order.user_id,
          order_no: order_no,
          operation_type: 'recharge',
          old_value: oldCredits,
          change_value: addCredits,
          new_value: newCredits,
          created_at: new Date().toISOString(),
          note: `支付成功，增加${addCredits}点`
        });

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
        newCredits,
        status: 'success'
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
    return NextResponse.json({ 
      error: '处理订单时发生错误',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// GET 处理函数
export const GET = withRateLimit(
  async (req: NextRequest) => {
    try {
      // 从 URL 参数中获取 order_no
      const url = new URL(req.url);
      const order_no = url.searchParams.get('order_no');
      
      if (!order_no) {
        return NextResponse.json({ error: 'order_no is required' }, { status: 400 });
      }

      // 创建新的 POST 请求
      const clonedRequest = new Request(req.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...req.headers
        },
        body: JSON.stringify({ order_no })
      });

      const response = await POST(clonedRequest);
      
      // 确保返回 NextResponse
      if (response instanceof NextResponse) {
        return response;
      }

      // 如果不是 NextResponse，将其转换为 NextResponse
      const data = await response.json();
      return NextResponse.json(data, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch (error) {
      console.error('处理 GET 请求时发生错误:', error);
      return NextResponse.json({ 
        error: '处理请求时发生错误',
        details: error instanceof Error ? error.message : String(error)
      }, { status: 500 });
    }
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