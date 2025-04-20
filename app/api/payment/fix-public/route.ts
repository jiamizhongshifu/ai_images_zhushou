import { NextRequest, NextResponse } from 'next/server';
import { createTransactionalAdminClient } from '@/utils/supabase/admin';
import { handleError, ErrorLevel } from '@/utils/error-handler';
import { withRateLimit } from '@/utils/rate-limiter';
import { verifyPaymentStatus } from '@/utils/payment-validator';

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
const handleFixPublic = async (request: NextRequest) => {
  try {
    // 获取请求IP地址，用于日志记录
    const clientIp = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';
    
    console.log(`公开订单修复API调用，IP: ${clientIp}`);
    
    // 获取订单号
    const url = new URL(request.url);
    const orderNo = url.searchParams.get('order_no');
    
    if (!orderNo) {
      return NextResponse.json({
        success: false,
        error: '缺少订单号'
      }, { status: 400 });
    }
    
    console.log(`开始处理订单: ${orderNo}`);
    
    // 使用事务客户端执行查询和更新
    const adminClient = await createTransactionalAdminClient();
    
    try {
      // 通过事务查询和更新，确保数据一致性
      const result = await adminClient.executeTransaction(async (client) => {
        // 1. 查询订单信息
        const { data: order, error: orderError } = await client
          .from('ai_images_creator_payments')
          .select('*')
          .eq('order_no', orderNo)
          .single();
        
        if (orderError) {
          console.error(`查询订单信息失败:`, orderError);
          throw new Error(`未找到订单: ${orderNo}, 错误: ${orderError.message}`);
        }
        
        if (!order) {
          throw new Error(`未找到订单: ${orderNo}`);
        }
        
        // 记录访问日志
        await logPaymentCheck(client, orderNo, order.user_id, 'fix-public');
        
        // 如果订单已经成功，则跳过
        if (order.status === 'success') {
          return { message: '订单已处理', order };
        }
        
        // 2. 验证支付状态 - 新增验证步骤
        const paymentVerified = await verifyPaymentStatus(orderNo);
        
        if (!paymentVerified) {
          // 记录处理历史，但不标记订单为成功
          await logPaymentProcessHistory(client, orderNo, 'fix-public', 'skipped', {
            reason: '支付验证未通过',
            time: new Date().toISOString()
          });
          
          // 返回订单状态，但不修改
          return { 
            message: '订单验证中，请等待支付完成', 
            order,
            status: 'pending' 
          };
        }
        
        // 3. 更新订单状态为成功
        const { error: updateError } = await client
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
          .eq('order_no', orderNo);
        
        if (updateError) {
          throw new Error(`更新订单状态失败: ${updateError.message}`);
        }
        
        // 4. 检查是否已经增加过点数
        const { data: creditLogs } = await client
          .from('ai_images_creator_credit_logs')
          .select('*')
          .eq('order_no', orderNo)
          .eq('operation_type', 'recharge');
        
        // 如果已经增加过点数，跳过
        if (creditLogs && creditLogs.length > 0) {
          return { 
            message: '订单已修复，已有点数记录', 
            order, 
            creditLogs 
          };
        }
        
        // 5. 获取用户当前点数
        const { data: credits, error: creditsError } = await client
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
        const { error: updateCreditsError } = await client
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
        const { error: logError } = await client
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
        await logPaymentProcessHistory(client, orderNo, 'fix-public', 'success', {
          oldCredits,
          addCredits,
          newCredits,
          time: new Date().toISOString()
        });
        
        return {
          message: '订单已修复，状态已更新为成功，点数已增加',
          oldCredits,
          addCredits,
          newCredits
        };
      });
      
      console.log(`订单 ${orderNo} 处理完成:`, result);
      
      return NextResponse.json({
        success: true,
        result
      });
    } catch (txError) {
      // 记录事务错误详情
      console.error(`订单 ${orderNo} 处理事务失败:`, txError);
      
      // 使用统一的错误处理
      const errorInfo = handleError(
        txError,
        '公开订单修复接口-事务执行',
        { orderNo },
        ErrorLevel.ERROR
      );
      
      return NextResponse.json({
        success: false,
        error: errorInfo.message,
        errorDetails: txError instanceof Error ? txError.message : '未知错误'
      }, { status: 500 });
    }
  } catch (error) {
    // 记录外层错误详情
    console.error(`公开订单修复API调用失败:`, error);
    
    // 使用统一的错误处理
    const errorInfo = handleError(
      error,
      '公开订单修复接口',
      { orderNo: new URL(request.url).searchParams.get('order_no') },
      ErrorLevel.ERROR
    );
    
    return NextResponse.json({
      success: false,
      error: errorInfo.message,
      errorDetails: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
};

// 添加速率限制中间件，防止滥用
export const GET = withRateLimit(
  handleFixPublic,
  {
    // 每IP每5分钟最多50次请求（进一步提高限制）
    limit: 50,
    // 窗口时间增加到10分钟，减轻集中在短时间内的请求压力
    windowMs: 10 * 60 * 1000,
    // 使用简单的IP限流函数
    keyGenerator: (req) => {
      const ip = req.headers.get('x-forwarded-for') || 
                req.headers.get('x-real-ip') || 
                'unknown';
      // 增加请求参数中的尝试次数到key中，使同一IP多次尝试的不同请求被视为不同的请求
      const url = new URL(req.url);
      const attemptCount = url.searchParams.get('attempt') || '0';
      return `ip:${ip}:payment:fix-public:${attemptCount}`;
    },
    message: '请求频率过高，请稍后再试',
    // 添加排除条件：如果请求包含admin_key则跳过限流
    skip: (req) => {
      const url = new URL(req.url);
      const adminKey = url.searchParams.get('admin_key');
      const validAdminKey = process.env.INTERNAL_API_KEY || '';
      
      return adminKey === validAdminKey;
    }
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