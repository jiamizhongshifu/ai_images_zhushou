import { NextRequest, NextResponse } from 'next/server';
import { createTransactionalAdminClient } from '@/utils/supabase/admin';
import { withAuth, AuthType, getRequestInfo } from '@/utils/auth-middleware';
import { getEnv, getApiConfig } from '@/utils/env';
import { handleError, ErrorLevel } from '@/utils/error-handler';
import { withRateLimit, userIdKeyGenerator, rateLimitPresets } from '@/utils/rate-limiter';

/**
 * 检查支付状态API
 * 
 * 查询参数:
 * - order_no: 订单号 (必填)
 * 
 * 返回:
 * - success: 是否成功
 * - order: 订单信息
 */
const checkPaymentHandler = async (request: NextRequest, authResult: any) => {
  try {
    // 获取请求信息，用于日志
    const requestInfo = getRequestInfo(request);
    console.log(`检查支付状态API调用:`, requestInfo);

    // 获取订单号
    const url = new URL(request.url);
    const orderNo = url.searchParams.get('order_no');
    
    if (!orderNo) {
      return NextResponse.json({
        success: false,
        error: '缺少订单号'
      }, { status: 400 });
    }
    
    // 使用事务客户端执行查询
    const transactionClient = await createTransactionalAdminClient();
    
    // 通过事务查询，确保数据一致性
    const result = await transactionClient.executeTransaction(async (client) => {
      // 查询订单信息
      const { data: order, error: orderError } = await client
        .from('ai_images_creator_payments')
        .select('*, credits:ai_images_creator_credits(credits)')
        .eq('order_no', orderNo)
        .single();
      
      if (orderError) {
        throw new Error(`查询订单信息失败: ${orderError.message}`);
      }
      
      if (!order) {
        throw new Error(`未找到订单: ${orderNo}`);
      }
      
      // 如果订单状态是pending，尝试向支付网关查询最新状态
      if (order.status === 'pending') {
        const securityConfig = getApiConfig('security');
        const orderAgeMinutes = (Date.now() - new Date(order.created_at).getTime()) / (60 * 1000);
        
        // 只有当订单创建时间超过1分钟且小于24小时时，才主动查询支付网关
        if (orderAgeMinutes > 1 && orderAgeMinutes < 24 * 60) {
          console.log(`订单 ${orderNo} 状态为pending，尝试向支付网关查询状态`);
          
          try {
            // 实际项目中这里应该调用支付网关的查单API
            // 示例: const paymentStatus = await queryPaymentGateway(orderNo);
            
            // 模拟调用结果 - 实际项目请替换成真实的支付网关查询
            // 这里简单模拟10%的概率支付成功
            const mockSuccess = Math.random() < 0.1;
            
            if (mockSuccess) {
              // 模拟支付成功，更新订单状态
              console.log(`模拟查询结果: 订单 ${orderNo} 支付成功，更新状态`);
              
              // 更新订单状态
              const { error: updateError } = await client
                .from('ai_images_creator_payments')
                .update({
                  status: 'success',
                  paid_at: new Date().toISOString(),
                  trade_state: 'SUCCESS',
                  trade_state_desc: '主动查询',
                  updated_at: new Date().toISOString()
                })
                .eq('order_no', orderNo);
                
              if (updateError) {
                throw new Error(`更新订单状态失败: ${updateError.message}`);
              }
              
              // 更新用户点数
              // 这里只修改订单状态，实际增加点数应通过webhook/回调处理
              // 或者可以调用专门的修复API
              
              return {
                ...order,
                status: 'success',
                statusChanged: true,
                message: '订单状态已更新为成功'
              };
            }
          } catch (queryError) {
            // 记录查询错误，但不影响返回订单信息
            handleError(
              queryError,
              '支付网关查询',
              { orderNo },
              ErrorLevel.WARNING
            );
          }
        }
      }
      
      // 查询订单的点数记录
      if (order.status === 'success') {
        const { data: creditLogs } = await client
          .from('ai_images_creator_credit_logs')
          .select('*')
          .eq('order_no', orderNo)
          .eq('operation_type', 'recharge');
          
        return {
          ...order,
          creditLogs: creditLogs || []
        };
      }
      
      return order;
    });
    
    // 记录访问日志
    await logPaymentCheck(orderNo, authResult.user?.id, result.status);
    
    return NextResponse.json({
      success: true,
      order: result
    });
  } catch (error) {
    // 使用统一的错误处理
    const errorInfo = handleError(
      error,
      '检查支付状态',
      { request: getRequestInfo(request) },
      ErrorLevel.ERROR
    );
    
    return NextResponse.json({
      success: false,
      error: errorInfo.message
    }, { status: 500 });
  }
};

// 应用认证中间件和速率限制中间件
export const GET = withAuth(
  withRateLimit(
    checkPaymentHandler,
    {
      ...rateLimitPresets.payment, // 使用支付API的预设速率限制
      keyGenerator: (req, context) => {
        // 使用传递的上下文中的用户ID作为限流标识
        // context参数会从withAuth中获取authResult
        if (context && context.user && context.user.id) {
          return `user:${context.user.id}:payment:check`;
        }
        // 回退到IP限流
        const ip = req.headers.get('x-forwarded-for') || 
                  req.headers.get('x-real-ip') ||
                  'unknown';
        return `ip:${ip}:payment:check`;
      },
      message: '请求支付查询过于频繁，请稍后再试',
      // 自定义错误消息
      skip: (req) => {
        // 1. 跳过内部调用的速率限制
        const url = new URL(req.url);
        const hasAdminKey = url.searchParams.has('admin_key') && 
                          url.searchParams.get('admin_key') === process.env.INTERNAL_API_KEY;
        
        // 2. 支付页面回调调用不受速率限制
        const isPaymentCallback = url.searchParams.has('order_no') && 
                                url.searchParams.has('trade_status');
        
        return hasAdminKey || isPaymentCallback;
      }
    }
  ),
  // 修改为可选认证，允许未登录用户查询订单
  AuthType.OPTIONAL
);

/**
 * 记录支付状态查询日志
 */
async function logPaymentCheck(orderNo: string, userId?: string, status?: string) {
  try {
    const adminClient = await createTransactionalAdminClient();
    
    // 在事务中执行插入操作
    await adminClient.executeTransaction(async (client) => {
      await client.from('ai_images_creator_payment_logs').insert({
        order_no: orderNo,
        user_id: userId || 'anonymous',
        process_type: 'check',
        status: status || 'unknown',
        created_at: new Date().toISOString()
      });
      
      return true;
    });
  } catch (error) {
    // 只记录错误，不阻止主流程
    console.warn('记录支付查询日志失败:', error);
  }
} 