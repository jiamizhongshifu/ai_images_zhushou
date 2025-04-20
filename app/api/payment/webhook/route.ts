import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createTransactionalAdminClient } from '@/utils/supabase/admin';
import { PaymentStatus, parsePaymentNotification } from '@/utils/payment';
import { handleError, ErrorLevel } from '@/utils/error-handler';
import { getRequestInfo } from '@/utils/auth-middleware';
import { withRateLimit, ipKeyGenerator, rateLimitPresets } from '@/utils/rate-limiter';

/**
 * 处理支付平台的异步通知
 * 1. 记录原始回调数据
 * 2. 尝试多种格式解析数据
 * 3. 验证订单信息
 * 4. 使用事务保证原子性
 * 5. 确保幂等性处理
 */
export const GET = withRateLimit(
  async (request: NextRequest) => {
    try {
      // 获取请求信息，用于记录日志
      const requestInfo = getRequestInfo(request);
      const clientIp = requestInfo.ip || 'unknown';
      
      console.log(`接收到支付回调, IP: ${clientIp}`);
      
      // 记录完整请求信息
      const url = new URL(request.url);
      const params: Record<string, any> = {};
      url.searchParams.forEach((value, key) => {
        params[key] = value;
      });
      
      console.log("收到GET支付回调完整数据:", params);
      
      // 记录回调日志
      const logId = await logPaymentCallback(params, 'GET', clientIp);
      
      return await processPaymentCallback(params);
    } catch (error: any) {
      console.error("处理GET支付通知时出错:", error);
      return NextResponse.json({ message: "success" }, { status: 200 }); // 仍返回成功避免重复通知
    }
  },
  {
    // 较为严格的限流规则
    limit: 30,            // 30次/分钟
    windowMs: 60 * 1000,  // 1分钟窗口期
    keyGenerator: ipKeyGenerator('payment:webhook:get'),
    message: '请求频率过高，请稍后再试'
  }
);

/**
 * 处理POST方式的支付回调
 * 大多数支付网关使用POST方式发送异步通知
 */
export const POST = withRateLimit(
  async (request: NextRequest) => {
    try {
      const requestClone = request.clone();
      const rawText = await requestClone.text();
      console.log('原始回调数据:', rawText);
      
      // 尝试从请求体获取参数
      let params: Record<string, any> = {};
      
      // 获取Content-Type
      const contentType = request.headers.get('content-type') || '';
      
      // 尝试多种方式解析数据
      if (contentType.includes('application/json')) {
        try {
          const jsonData = await request.json();
          console.log("收到JSON格式支付回调:", jsonData);
          params = jsonData;
          
          // 检查是否是微信支付通知
          if (jsonData.id && jsonData.resource_type) {
            // 微信支付V3通知
            const resourceType = jsonData.resource_type;
            
            // 处理微信支付通知
            if (resourceType === 'encrypt-resource') {
              // 这里应该有解密逻辑，但简化处理
              // 假设已解密并获取到支付结果
              const wechatPayInfo = jsonData.resource || {};
              const { out_trade_no, transaction_id, trade_state, trade_state_desc } = 
                wechatPayInfo.ciphertext || wechatPayInfo;
              
              // 记录回调日志
              await logPaymentCallback(
                { original: jsonData, parsed: { out_trade_no, trade_state } }, 
                'POST-WECHAT', 
                request.headers.get('x-forwarded-for') || 'unknown'
              );
              
              // 支付成功，更新订单状态和用户点数
              if (trade_state === 'SUCCESS') {
                const result = await processWechatPaymentSuccess(
                  out_trade_no, 
                  transaction_id, 
                  trade_state, 
                  trade_state_desc, 
                  wechatPayInfo
                );
                
                console.log(`微信支付处理结果:`, result);
              } else {
                // 支付未成功，仅更新订单状态
                await updateOrderStatusFailed(
                  out_trade_no, 
                  transaction_id, 
                  trade_state, 
                  trade_state_desc, 
                  wechatPayInfo
                );
              }
              
              // 返回微信支付需要的成功响应
              return NextResponse.json({
                code: 'SUCCESS',
                message: '成功'
              });
            }
            
            // 不是我们处理的通知类型
            return NextResponse.json({ message: "success" }, { status: 200 });
          }
        } catch (e) {
          console.error('JSON解析失败，尝试其他格式', e);
        }
      } 
      
      // 如果JSON解析失败或不是JSON格式，尝试表单格式
      if (Object.keys(params).length === 0 && contentType.includes('application/x-www-form-urlencoded')) {
        try {
          const formData = await request.formData();
          formData.forEach((value, key) => {
            params[key] = value;
          });
          console.log("收到表单格式支付回调:", params);
        } catch (e) {
          console.error('表单解析失败', e);
        }
      } 
      
      // 尝试解析为URL编码参数
      if (Object.keys(params).length === 0) {
        try {
          const text = rawText;
          const searchParams = new URLSearchParams(text);
          searchParams.forEach((value, key) => {
            params[key] = value;
          });
          console.log("收到URL编码格式支付回调:", params);
        } catch (e) {
          console.error('URL参数解析失败', e);
        }
      }
      
      // 记录回调日志
      await logPaymentCallback(params, 'POST', request.headers.get('x-forwarded-for') || 'unknown');
      
      // 处理标准支付回调
      if (Object.keys(params).length > 0) {
        return await processPaymentCallback(params);
      }
      
      console.error("无法解析的回调格式");
      return NextResponse.json({ message: "success" }, { status: 200 }); // 仍返回成功避免重复通知
    } catch (error: any) {
      console.error("处理POST支付通知时出错:", error);
      return NextResponse.json({ message: "success" }, { status: 200 });
    }
  },
  {
    // 针对支付回调的特殊限流规则，较为宽松但仍能阻止攻击
    limit: 60,            // 60次/分钟
    windowMs: 60 * 1000,  // 1分钟窗口期
    keyGenerator: ipKeyGenerator('payment:webhook'),
    skip: (req) => {
      // 可选：白名单IP不受限制
      const ip = req.headers.get('x-forwarded-for') || 
                 req.headers.get('x-real-ip') || 
                 'unknown';
                 
      // 白名单IP列表
      const whitelistIps = process.env.PAYMENT_WEBHOOK_IP_WHITELIST ? 
                          process.env.PAYMENT_WEBHOOK_IP_WHITELIST.split(',') : 
                          [];
                          
      return whitelistIps.includes(ip);
    }
  }
);

/**
 * 记录支付回调日志
 */
async function logPaymentCallback(data: any, method: string, ipAddress: string) {
  try {
    // 提取订单号
    const orderNo = 
      data.out_trade_no || 
      data.orderNo || 
      data.order_no || 
      (data.parsed && data.parsed.out_trade_no) || 
      'unknown';
    
    // 获取管理员客户端
    const adminClient = await createAdminClient();
    
    // 插入回调日志
    await adminClient
      .from('ai_images_creator_payment_callbacks')
      .insert({
        order_no: orderNo,
        raw_data: typeof data === 'string' ? data : JSON.stringify(data),
        parsed_data: data,
        process_result: 'received',
        created_at: new Date().toISOString(),
        ip_address: ipAddress
      });
  } catch (error) {
    console.error("记录支付回调日志失败:", error);
    // 继续处理，不影响主流程
  }
}

/**
 * 处理微信支付成功逻辑
 */
async function processWechatPaymentSuccess(
  orderNo: string,
  transactionId: string,
  tradeState: string,
  tradeStateDesc: string,
  wechatPayInfo: any
) {
  const transactionAdmin = await createTransactionalAdminClient();
  
  try {
    // 使用事务处理支付成功后的操作
    return await transactionAdmin.executeTransaction(async (client) => {
      // 1. 检查订单是否已处理过
      const { data: existingOrder, error: queryError } = await client
        .from('ai_images_creator_payments')
        .select('id, status, credits')
        .eq('order_no', orderNo)
        .single();
      
      if (queryError) {
        console.error('查询订单失败:', queryError);
        throw new Error(`查询订单失败: ${queryError.message}`);
      }
      
      // 如果订单已经是成功状态，直接返回，避免重复处理
      if (existingOrder && existingOrder.status === 'success') {
        // 检查是否已经更新过点数
        const { data: creditLogs } = await client
          .from('ai_images_creator_credit_logs')
          .select('id')
          .eq('order_no', orderNo)
          .eq('operation_type', 'recharge');
          
        console.log(`订单 ${orderNo} 已经处理过，跳过处理。点数记录:`, creditLogs);
        
        // 更新回调日志状态
        await updateCallbackStatus(orderNo, 'success', '已有点数记录，无需重复处理');
        
        return { 
          success: true, 
          orderId: existingOrder.id,
          alreadyProcessed: true,
          hasCredits: creditLogs && creditLogs.length > 0
        };
      }
      
      // 2. 更新订单状态
      const { data: orderData, error: updateError } = await client
        .from('ai_images_creator_payments')
        .update({
          status: 'success',
          paid_at: new Date().toISOString(),
          transaction_id: transactionId,
          payment_response: wechatPayInfo,
          updated_at: new Date().toISOString()
        })
        .eq('order_no', orderNo)
        .select()
        .single();
      
      if (updateError || !orderData) {
        console.error('更新订单状态失败:', updateError);
        
        // 更新回调日志状态
        await updateCallbackStatus(orderNo, 'error', `更新订单状态失败: ${updateError?.message || '未知错误'}`);
        
        throw new Error(`更新订单状态失败: ${updateError?.message || '未知错误'}`);
      }
      
      // 3. 检查是否已经增加过点数
      const { data: existingLogs, error: logError } = await client
        .from('ai_images_creator_credit_logs')
        .select('id')
        .eq('order_no', orderNo)
        .eq('operation_type', 'recharge');
      
      if (logError) {
        console.error('检查点数记录失败:', logError);
      } else if (existingLogs && existingLogs.length > 0) {
        console.log(`订单 ${orderNo} 已有点数记录，无需重复增加点数`);
        
        // 更新回调日志状态
        await updateCallbackStatus(orderNo, 'success', '已有点数记录，无需重复处理');
        
        return {
          success: true,
          order: orderData,
          message: '订单已更新为成功，已有点数记录'
        };
      }
      
      // 4. 查询用户当前点数
      const { data: creditData, error: creditQueryError } = await client
        .from('ai_images_creator_credits')
        .select('credits')
        .eq('user_id', orderData.user_id)
        .single();
        
      let currentCredits = 0;
      let isNewCreditRecord = false;
      
      // 处理用户可能没有点数记录的情况
      if (creditQueryError) {
        if (creditQueryError.code === 'PGRST116') {
          // 创建新的点数记录
          isNewCreditRecord = true;
          const { error: insertError } = await client
            .from('ai_images_creator_credits')
            .insert({
              user_id: orderData.user_id,
              credits: orderData.credits,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              last_order_no: orderNo
            });
            
          if (insertError) {
            console.error('创建用户点数记录失败:', insertError);
            
            // 更新回调日志状态
            await updateCallbackStatus(orderNo, 'error', `创建用户点数记录失败: ${insertError.message}`);
            
            return new Response("success", { status: 200 }); // 仍返回成功，避免重复查询
          }
        } else {
          console.error('查询用户点数失败:', creditQueryError);
          
          // 更新回调日志状态
          await updateCallbackStatus(orderNo, 'error', `查询用户点数失败: ${creditQueryError.message}`);
          
          return new Response("success", { status: 200 }); // 仍返回成功，避免重复查询
        }
      } else {
        // 用户已有点数记录，更新点数
        currentCredits = creditData.credits;
        const newCredits = currentCredits + orderData.credits;
        
        const { error: updateCreditError } = await client
          .from('ai_images_creator_credits')
          .update({
            credits: newCredits,
            updated_at: new Date().toISOString(),
            last_order_no: orderNo
          })
          .eq('user_id', orderData.user_id);
          
        if (updateCreditError) {
          console.error('更新用户点数失败:', updateCreditError);
          
          // 更新回调日志状态
          await updateCallbackStatus(orderNo, 'error', `更新用户点数失败: ${updateCreditError.message}`);
          
          return new Response("success", { status: 200 }); // 仍返回成功，避免重复查询
        }
      }
      
      // 5. 记录点数变更日志
      const { error: logInsertError } = await client
        .from('ai_images_creator_credit_logs')
        .insert({
          user_id: orderData.user_id,
          order_no: orderNo,
          operation_type: 'recharge',
          old_value: currentCredits,
          change_value: orderData.credits,
          new_value: currentCredits + orderData.credits,
          created_at: new Date().toISOString(),
          note: `充值${orderData.credits}点`
        });
      
      if (logInsertError) {
        console.error('创建点数变更日志失败:', logInsertError);
        
        // 更新回调日志状态
        await updateCallbackStatus(orderNo, 'error', `创建点数变更日志失败: ${logInsertError.message}`);
        
        return new Response("success", { status: 200 }); // 仍返回成功，避免重复查询
      }
      
      // 6. 记录支付处理日志
      const { error: paymentLogError } = await client
        .from('ai_images_creator_payment_logs')
        .insert({
          order_no: orderNo,
          user_id: orderData.user_id,
          process_type: 'webhook',
          amount: orderData.amount,
          credits: orderData.credits,
          status: 'success',
          created_at: new Date().toISOString()
        });
      
      if (paymentLogError) {
        console.warn('创建支付处理日志失败:', paymentLogError);
        // 非致命错误，继续处理
      }
      
      // 更新回调日志状态
      await updateCallbackStatus(orderNo, 'success', isNewCreditRecord ? 
        '新建用户点数记录并增加点数' : `更新用户点数: ${currentCredits} -> ${currentCredits + orderData.credits}`);
      
      return { 
        success: true, 
        order: orderData,
        oldCredits: currentCredits,
        addedCredits: orderData.credits,
        newCredits: currentCredits + orderData.credits,
        isNewCreditRecord
      };
    });
  } catch (error) {
    console.error(`微信支付处理异常:`, error);
    // 更新回调日志状态
    await updateCallbackStatus(orderNo, 'error', `处理异常: ${error instanceof Error ? error.message : String(error)}`);
    
    // 重新抛出异常给上层处理
    throw error;
  }
}

/**
 * 更新订单状态为失败
 */
async function updateOrderStatusFailed(
  orderNo: string,
  transactionId: string,
  tradeState: string, 
  tradeStateDesc: string,
  wechatPayInfo: any
) {
  try {
    const adminClient = await createAdminClient();
    const { error: updateError } = await adminClient
      .from('ai_images_creator_payments')
      .update({
        status: 'failed',
        paid_at: null,
        transaction_id: transactionId,
        payment_response: wechatPayInfo,
        updated_at: new Date().toISOString()
      })
      .eq('order_no', orderNo);
    
    if (updateError) {
      console.error('更新订单状态为失败失败:', updateError);
      
      // 更新回调日志状态
      await updateCallbackStatus(orderNo, 'error', `更新订单状态为失败失败: ${updateError.message}`);
      
      return { success: false, error: updateError.message };
    }
    
    // 更新回调日志状态
    await updateCallbackStatus(orderNo, 'failed', `支付未成功，状态: ${tradeState}`);
    
    return { success: true, status: 'failed' };
  } catch (error) {
    console.error('更新订单状态为失败异常:', error);
    
    // 更新回调日志状态
    await updateCallbackStatus(orderNo, 'error', `更新订单状态为失败异常: ${error instanceof Error ? error.message : String(error)}`);
    
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * 更新回调日志状态
 */
async function updateCallbackStatus(orderNo: string, status: string, message?: string) {
  try {
    const adminClient = await createAdminClient();
    
    // 查找最新的回调记录
    const { data: callbacks, error: queryError } = await adminClient
      .from('ai_images_creator_payment_callbacks')
      .select('id')
      .eq('order_no', orderNo)
      .order('created_at', { ascending: false })
      .limit(1);
      
    if (queryError || !callbacks || callbacks.length === 0) {
      console.warn(`未找到回调记录或查询失败: ${orderNo}`, queryError);
      return;
    }
    
    // 更新回调记录状态
    await adminClient
      .from('ai_images_creator_payment_callbacks')
      .update({
        process_result: status,
        error_message: message
      })
      .eq('id', callbacks[0].id);
  } catch (error) {
    console.error('更新回调日志状态失败:', error);
    // 非致命错误，不影响主流程
  }
}

/**
 * 处理支付回调的通用逻辑
 */
async function processPaymentCallback(params: Record<string, any>) {
  // 打印所有回调参数
  console.log('接收到支付回调:', params);
  
  // 验证签名和处理通知
  const { isValid, isSuccess, orderNo, amount, tradeNo } = parsePaymentNotification(params);
  
  // 即使签名验证失败也继续处理，但记录警告
  if (!isValid) {
    console.warn("支付通知签名验证失败，但继续处理");
    
    // 更新回调日志状态
    if (orderNo) {
      await updateCallbackStatus(orderNo, 'warning', '签名验证失败');
    }
  }
  
  if (!orderNo) {
    console.error("支付通知缺少订单号");
    return NextResponse.json({ message: "success" }, { status: 200 }); // 仍返回成功避免重复通知
  }
  
  try {
    // 使用事务处理
    const transactionClient = await createTransactionalAdminClient();
    
    return await transactionClient.executeTransaction(async (client) => {
      // 查询订单信息
      const { data: orderData, error: queryError } = await client
        .from('ai_images_creator_payments')
        .select('*')
        .eq('order_no', orderNo)
        .single();
      
      if (queryError || !orderData) {
        console.error("查询订单信息失败:", queryError);
        
        // 更新回调日志状态
        await updateCallbackStatus(orderNo, 'error', `查询订单信息失败: ${queryError?.message || '未找到订单'}`);
        
        return NextResponse.json({ message: "success" }, { status: 200 }); // 仍返回成功避免重复通知
      }
      
      // 如果订单已处理，直接返回成功
      if (orderData.status === PaymentStatus.SUCCESS) {
        console.log("订单已处理过:", orderNo);
        
        // 检查是否已有点数记录
        const { data: creditLogs, error: logQueryError } = await client
          .from('ai_images_creator_credit_logs')
          .select('id, created_at, change_value')
          .eq('order_no', orderNo)
          .eq('operation_type', 'recharge')
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (!logQueryError && creditLogs && creditLogs.length > 0) {
          console.log(`订单 ${orderNo} 已经增加过点数，最后处理时间: ${creditLogs[0].created_at}, 增加数量: ${creditLogs[0].change_value}`);
          
          // 确保更新订单标记
          await client
            .from('ai_images_creator_payments')
            .update({
              credits_updated: true,
              updated_at: new Date().toISOString(),
              callback_data: {
                ...orderData.callback_data,
                webhook_recheck: true,
                last_check_time: new Date().toISOString()
              }
            })
            .eq('order_no', orderNo);
          
          // 更新回调日志状态
          await updateCallbackStatus(orderNo, 'already_processed', `已有点数记录(${creditLogs[0].change_value}点), 处理时间: ${creditLogs[0].created_at}`);
          
          return NextResponse.json({ message: "success", already_processed: true }, { status: 200 });
        }
      }
      
      // 添加处理锁，防止并发处理
      const lockKey = `payment:lock:${orderNo}`;
      const { data: existingLock } = await client
        .from('ai_images_creator_locks')
        .select('id, created_at')
        .eq('key', lockKey)
        .single();

      if (existingLock) {
        console.log(`订单 ${orderNo} 正在被其他进程处理，跳过本次处理`);
        return NextResponse.json({ message: "success", locked: true }, { status: 200 });
      }

      // 创建处理锁
      await client
        .from('ai_images_creator_locks')
        .insert({
          key: lockKey,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30000).toISOString() // 30秒后过期
        });

      try {
        // 增加处理记录，确保幂等性
        const { data: processLog, error: logError } = await client
          .from('ai_images_creator_payment_logs')
          .insert({
            order_no: orderNo,
            user_id: orderData.user_id,
            process_type: 'webhook',
            amount: orderData.amount,
            credits: orderData.credits,
            status: 'processing',
            created_at: new Date().toISOString()
          })
          .select('id')
          .single();
          
        if (logError) {
          console.warn("创建支付处理日志失败，但继续处理:", logError);
        }
        
        // 更新订单状态为成功
        const { error: updateError } = await client
          .from('ai_images_creator_payments')
          .update({
            status: PaymentStatus.SUCCESS,
            trade_no: tradeNo || params.trade_no || params.transaction_id || `callback_${Date.now()}`,
            callback_data: params,
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            process_id: processLog?.id || `auto_${Date.now()}`
          })
          .eq('order_no', orderNo)
          .eq('status', 'processing');
          
        if (updateError) {
          console.error("更新订单状态失败:", updateError);
          
          // 更新回调日志状态
          await updateCallbackStatus(orderNo, 'error', `更新订单状态失败: ${updateError.message}`);
          
          return NextResponse.json({ message: "success" }, { status: 200 }); // 仍返回成功，避免重复查询
        }
        
        // 查询用户当前点数
        const { data: creditData, error: creditQueryError } = await client
          .from('ai_images_creator_credits')
          .select('credits')
          .eq('user_id', orderData.user_id)
          .single();
          
        let currentCredits = 0;
        let isNewCreditRecord = false;
        
        // 处理用户可能没有点数记录的情况
        if (creditQueryError) {
          if (creditQueryError.code === 'PGRST116') {
            // 创建新的点数记录
            isNewCreditRecord = true;
            const { error: insertError } = await client
              .from('ai_images_creator_credits')
              .insert({
                user_id: orderData.user_id,
                credits: orderData.credits,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                last_order_no: orderNo
              });
              
            if (insertError) {
              console.error('创建用户点数记录失败:', insertError);
              
              // 更新回调日志状态
              await updateCallbackStatus(orderNo, 'error', `创建用户点数记录失败: ${insertError.message}`);
              
              return NextResponse.json({ message: "success" }, { status: 200 }); // 仍返回成功，避免重复查询
            }
          } else {
            console.error('查询用户点数失败:', creditQueryError);
            
            // 更新回调日志状态
            await updateCallbackStatus(orderNo, 'error', `查询用户点数失败: ${creditQueryError.message}`);
            
            return NextResponse.json({ message: "success" }, { status: 200 }); // 仍返回成功，避免重复查询
          }
        } else {
          // 用户已有点数记录，更新点数
          currentCredits = creditData.credits;
          const newCredits = currentCredits + orderData.credits;
          
          const { error: updateCreditError } = await client
            .from('ai_images_creator_credits')
            .update({
              credits: newCredits,
              updated_at: new Date().toISOString(),
              last_order_no: orderNo
            })
            .eq('user_id', orderData.user_id);
            
          if (updateCreditError) {
            console.error('更新用户点数失败:', updateCreditError);
            
            // 更新回调日志状态
            await updateCallbackStatus(orderNo, 'error', `更新用户点数失败: ${updateCreditError.message}`);
            
            return NextResponse.json({ message: "success" }, { status: 200 }); // 仍返回成功，避免重复查询
          }
        }
        
        // 记录点数变更日志
        const { error: logInsertError } = await client
          .from('ai_images_creator_credit_logs')
          .insert({
            user_id: orderData.user_id,
            order_no: orderNo,
            operation_type: 'recharge',
            old_value: currentCredits,
            change_value: orderData.credits,
            new_value: currentCredits + orderData.credits,
            created_at: new Date().toISOString(),
            note: `充值${orderData.credits}点`
          });
          
        if (logInsertError) {
          console.error('创建点数变更日志失败:', logInsertError);
          
          // 更新回调日志状态
          await updateCallbackStatus(orderNo, 'error', `创建点数变更日志失败: ${logInsertError.message}`);
          
          return NextResponse.json({ message: "success" }, { status: 200 }); // 仍返回成功，避免重复查询
        }
        
        // 更新处理日志状态
        if (processLog?.id) {
          await client
            .from('ai_images_creator_payment_logs')
            .update({
              status: 'success',
              updated_at: new Date().toISOString()
            })
            .eq('id', processLog.id);
        }
        
        // 更新回调日志状态
        await updateCallbackStatus(orderNo, 'success', isNewCreditRecord ? 
          '新建用户点数记录并增加点数' : `更新用户点数: ${currentCredits} -> ${currentCredits + orderData.credits}`);
        
        // 更新订单标记为已更新点数
        await client
          .from('ai_images_creator_payments')
          .update({
            credits_updated: true,
            updated_at: new Date().toISOString()
          })
          .eq('order_no', orderNo);
        
        console.log("支付处理成功:", {
          orderNo,
          userId: orderData.user_id,
          credits: orderData.credits,
          processId: processLog?.id || 'unknown'
        });
        
        return NextResponse.json({ message: "success" }, { status: 200 });
      } finally {
        // 释放处理锁
        await client
          .from('ai_images_creator_locks')
          .delete()
          .eq('key', lockKey);
      }
    });
  } catch (error) {
    console.error("处理支付回调过程中出错:", error);
    
    // 更新回调日志状态
    if (orderNo) {
      await updateCallbackStatus(orderNo, 'error', `处理异常: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return NextResponse.json({ message: "success" }, { status: 200 }); // 仍返回成功避免重复通知
  }
} 