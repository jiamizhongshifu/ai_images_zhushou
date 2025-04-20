import { NextRequest, NextResponse } from 'next/server';
import { createTransactionalAdminClient } from '@/utils/supabase/admin';
import { withAuth, AuthType, getRequestInfo, authenticate } from '@/utils/auth-middleware';
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
        .select('*')
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
            // 检查环境，只在非生产环境使用模拟数据
            if (process.env.NODE_ENV !== 'production') {
              // 在开发环境中，需要显式开启模拟支付功能
              if (process.env.MOCK_PAYMENT_SUCCESS === 'true') {
                // 模拟支付成功，更新订单状态
                console.log(`[开发环境] 模拟查询结果: 订单 ${orderNo} 支付成功，更新状态`);
                
                // 更新订单状态
                const { error: updateError } = await client
                  .from('ai_images_creator_payments')
                  .update({
                    status: 'success',
                    paid_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  })
                  .eq('order_no', orderNo);
                  
                if (updateError) {
                  throw new Error(`更新订单状态失败: ${updateError.message}`);
                }
                
                return {
                  ...order,
                  status: 'success',
                  statusChanged: true,
                  message: '开发环境-模拟支付成功'
                };
              } else {
                console.log(`[开发环境] 模拟查询结果: 订单 ${orderNo} 待支付`);
              }
            } else {
              // 生产环境: 调用实际的支付网关查询API
              // 导入支付验证器
              const { verifyPaymentStatus } = await import('@/utils/payment-validator');
              
              // 查询支付状态
              const paymentStatus = await verifyPaymentStatus(orderNo);
              
              if (paymentStatus) {
                console.log(`[生产环境] 支付网关查询结果: 订单 ${orderNo} 已完成支付`);
                
                // 更新订单状态
                const { error: updateError } = await client
                  .from('ai_images_creator_payments')
                  .update({
                    status: 'success',
                    paid_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  })
                  .eq('order_no', orderNo);
                  
                if (updateError) {
                  throw new Error(`更新订单状态失败: ${updateError.message}`);
                }
                
                return {
                  ...order,
                  status: 'success',
                  statusChanged: true,
                  message: '支付已完成，订单状态已更新'
                };
              } else {
                console.log(`[生产环境] 支付网关查询结果: 订单 ${orderNo} 待支付`);
              }
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
      // 添加对已成功但未更新点数的订单处理
      else if (order.status === 'success' && order.credits_updated === false) {
        console.log(`订单 ${orderNo} 状态为success但点数未更新，检查是否已有点数记录`);
        
        // 检查是否已有点数记录
        const { count: creditLogCount, error: creditLogCountError } = await client
          .from('ai_images_creator_credit_logs')
          .select('id', { count: 'exact', head: true })
          .eq('order_no', orderNo)
          .eq('operation_type', 'recharge');
        
        if (!creditLogCountError && creditLogCount && creditLogCount > 0) {
          console.log(`检测到订单 ${orderNo} 已有 ${creditLogCount} 条点数记录`);
          
          // 确保订单状态和标记一致
          await client
            .from('ai_images_creator_payments')
            .update({
              status: 'success',
              credits_updated: true,
              updated_at: new Date().toISOString()
            })
            .eq('order_no', orderNo);
          
          return {
            success: true,
            message: '订单已有点数记录，已确保状态一致',
            order: { ...order, status: 'success', credits_updated: true },
            existingCreditLogs: creditLogCount
          };
        }
        
        // 查询用户当前点数
        const { data: creditData, error: creditQueryError } = await client
          .from('ai_images_creator_credits')
          .select('credits')
          .eq('user_id', order.user_id)
          .single();
        
        let currentCredits = 0;
        let isNewCreditRecord = false;
        
        // 处理用户可能没有点数记录的情况
        if (creditQueryError) {
          if (creditQueryError.code === 'PGRST116') { // 不存在的记录
            // 创建新的点数记录
            isNewCreditRecord = true;
            const { error: insertError } = await client
              .from('ai_images_creator_credits')
              .insert({
                user_id: order.user_id,
                credits: order.credits,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                last_order_no: orderNo
              });
              
            if (insertError) {
              throw new Error(`创建用户点数记录失败: ${insertError.message}`);
            }
            
            console.log(`已为用户 ${order.user_id} 创建新的点数记录: ${order.credits}点`);
          } else {
            throw new Error(`查询用户点数失败: ${creditQueryError.message}`);
          }
        } else {
          // 用户已有点数记录，更新点数
          currentCredits = creditData.credits;
          const newCredits = currentCredits + order.credits;
          
          const { error: updateCreditError } = await client
            .from('ai_images_creator_credits')
            .update({
              credits: newCredits,
              updated_at: new Date().toISOString(),
              last_order_no: orderNo
            })
            .eq('user_id', order.user_id);
            
          if (updateCreditError) {
            throw new Error(`更新用户点数失败: ${updateCreditError.message}`);
          }
          
          console.log(`已更新用户 ${order.user_id} 的点数: ${currentCredits} -> ${newCredits}`);
        }
        
        // 记录点数变更日志
        const { error: logInsertError } = await client
          .from('ai_images_creator_credit_logs')
          .insert({
            user_id: order.user_id,
            order_no: orderNo,
            operation_type: 'recharge',
            old_value: currentCredits,
            change_value: order.credits,
            new_value: currentCredits + order.credits,
            created_at: new Date().toISOString(),
            note: `支付成功自动增加${order.credits}点`
          });
          
        if (logInsertError) {
          throw new Error(`创建点数变更日志失败: ${logInsertError.message}`);
        }
        
        // 更新订单标记为已更新点数
        const { error: updateOrderError } = await client
          .from('ai_images_creator_payments')
          .update({
            credits_updated: true,
            updated_at: new Date().toISOString()
          })
          .eq('order_no', orderNo);
          
        if (updateOrderError) {
          throw new Error(`更新订单标记失败: ${updateOrderError.message}`);
        }
        
        return {
          success: true,
          message: '订单状态已为成功，现已更新用户点数',
          order: {
            ...order,
            credits_updated: true
          },
          creditsUpdated: true,
          oldCredits: currentCredits,
          creditsAdded: order.credits,
          newCredits: currentCredits + order.credits
        };
      }
      
      // 查询订单的点数记录
      if (order.status === 'success') {
        // 尝试获取用户的点数信息
        try {
          const { data: userCredits, error: creditsError } = await client
            .from('ai_images_creator_credits')
            .select('credits')
            .eq('user_id', order.user_id)
            .single();
            
          if (!creditsError && userCredits) {
            order.currentCredits = userCredits.credits;
          }
        } catch (error) {
          console.warn(`获取用户点数信息失败: ${error instanceof Error ? error.message : String(error)}，但不影响订单查询`);
        }
        
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

// 自定义处理函数包装器，避免类型错误
const apiHandler = async (request: NextRequest) => {
  // 1. 先进行认证检查
  const authResult = await authenticate(request, AuthType.OPTIONAL);
  
  // 2. 应用速率限制
  const url = new URL(request.url);
  const hasAdminKey = url.searchParams.has('admin_key') && 
                       url.searchParams.get('admin_key') === process.env.INTERNAL_API_KEY;
  const isPaymentCallback = url.searchParams.has('order_no') && 
                             url.searchParams.has('trade_status');
  const shouldSkip = hasAdminKey || isPaymentCallback;
  
  if (!shouldSkip) {
    // 生成用于速率限制的键
    let limitKey: string;
    if (authResult.authenticated && authResult.user && authResult.user.id) {
      console.log(`支付查询API - 用户ID速率限制: ${authResult.user.id}`);
      limitKey = `user:${authResult.user.id}:payment:check`;
    } else {
      const ip = request.headers.get('x-forwarded-for') || 
                 request.headers.get('x-real-ip') ||
                 'unknown';
      console.log(`支付查询API - IP速率限制: ${ip}`);
      limitKey = `ip:${ip}:payment:check`;
    }
    
    // 在这里可以添加速率限制逻辑
    // 简化处理，暂时跳过实际的速率限制检查
  }
  
  // 3. 调用实际的处理函数
  return checkPaymentHandler(request, authResult);
};

// 导出GET处理函数
export const GET = apiHandler;

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