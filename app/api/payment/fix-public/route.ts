import { NextRequest, NextResponse } from 'next/server';
import { createTransactionalAdminClient } from '@/utils/supabase/admin';
import { handleError, ErrorLevel } from '@/utils/error-handler';
import { withRateLimit } from '@/utils/rate-limiter';

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
        
        // 2. 更新订单状态为成功
        const { error: updateError } = await client
          .from('ai_images_creator_payments')
          .update({
            status: 'success',
            paid_at: new Date().toISOString(),
            callback_data: {
              method: 'fix-public',
              time: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          })
          .eq('order_no', orderNo);
        
        if (updateError) {
          throw new Error(`更新订单状态失败: ${updateError.message}`);
        }
        
        // 3. 检查是否已经增加过点数
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
        
        // 4. 获取用户当前点数
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
        
        // 5. 更新用户点数
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
        
        // 6. 记录点数变更日志
        const { error: logError } = await client
          .from('ai_images_creator_credit_logs')
          .insert({
            user_id: order.user_id,
            operation_type: 'recharge',
            credits: addCredits,
            old_credits: oldCredits,
            new_credits: newCredits,
            order_no: order.order_no,
            note: `支付成功，增加${addCredits}点`,
            created_at: new Date().toISOString()
          });
        
        if (logError) {
          throw new Error(`记录点数变更日志失败: ${logError.message}`);
        }
        
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
    // 每IP每5分钟最多10次请求
    limit: 10,
    windowMs: 5 * 60 * 1000,
    // 使用简单的IP限流函数
    keyGenerator: (req) => {
      const ip = req.headers.get('x-forwarded-for') || 
                req.headers.get('x-real-ip') || 
                'unknown';
      return `ip:${ip}:payment:fix-public`;
    },
    message: '请求频率过高，请稍后再试'
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