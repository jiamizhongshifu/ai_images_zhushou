import { NextRequest } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { PaymentStatus, parsePaymentNotification } from '@/utils/payment';

/**
 * 处理支付平台的异步通知
 * 1. 验证签名
 * 2. 验证金额
 * 3. 更新订单状态
 * 4. 增加用户点数
 */
export async function GET(request: NextRequest) {
  try {
    // 获取所有查询参数
    const url = new URL(request.url);
    const params: Record<string, any> = {};
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    
    console.log("收到支付回调:", params);
    
    // 验证签名和处理通知
    const { isValid, isSuccess, orderNo, amount, tradeNo } = parsePaymentNotification(params);
    
    if (!isValid) {
      console.error("支付通知签名验证失败");
      return new Response("fail", { status: 400 });
    }
    
    if (!orderNo) {
      console.error("支付通知缺少订单号");
      return new Response("fail", { status: 400 });
    }
    
    // 获取Supabase管理员客户端
    const supabase = createAdminClient();
    
    // 查询订单信息
    const { data: orderData, error: queryError } = await supabase
      .from('ai_images_creator_payments')
      .select('*')
      .eq('order_no', orderNo)
      .single();
    
    if (queryError || !orderData) {
      console.error("查询订单信息失败:", queryError);
      return new Response("fail", { status: 400 });
    }
    
    // 如果订单已处理，直接返回成功
    if (orderData.status === PaymentStatus.SUCCESS) {
      console.log("订单已处理过:", orderNo);
      return new Response("success", { status: 200 });
    }
    
    // 验证金额
    if (Math.abs(parseFloat(orderData.amount) - amount) > 0.01) {
      console.error("支付金额不匹配:", { expected: orderData.amount, actual: amount });
      
      // 更新订单状态为失败
      await supabase
        .from('ai_images_creator_payments')
        .update({
          status: PaymentStatus.FAILED,
          callback_data: params,
          updated_at: new Date().toISOString()
        })
        .eq('order_no', orderNo);
        
      return new Response("fail", { status: 400 });
    }
    
    // 处理支付结果
    if (isSuccess) {
      // 更新订单状态为成功
      await supabase
        .from('ai_images_creator_payments')
        .update({
          status: PaymentStatus.SUCCESS,
          trade_no: tradeNo,
          callback_data: params,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('order_no', orderNo);
      
      // 增加用户点数
      const { data: creditData, error: creditError } = await supabase
        .from('ai_images_creator_credits')
        .select('credits')
        .eq('user_id', orderData.user_id)
        .single();
      
      if (creditError) {
        console.error("查询用户点数失败:", creditError);
        
        // 如果是记录不存在，创建新记录
        if (creditError.code === 'PGRST116') {
          await supabase
            .from('ai_images_creator_credits')
            .insert({
              user_id: orderData.user_id,
              credits: orderData.credits,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
        } else {
          // 其他错误，返回失败
          return new Response("fail", { status: 500 });
        }
      } else if (creditData) {
        // 更新用户点数
        await supabase
          .from('ai_images_creator_credits')
          .update({
            credits: creditData.credits + orderData.credits,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', orderData.user_id);
      }
      
      console.log("支付处理成功:", {
        orderNo,
        userId: orderData.user_id,
        credits: orderData.credits
      });
      
      return new Response("success", { status: 200 });
    } else {
      // 更新订单状态为失败
      await supabase
        .from('ai_images_creator_payments')
        .update({
          status: PaymentStatus.FAILED,
          callback_data: params,
          updated_at: new Date().toISOString()
        })
        .eq('order_no', orderNo);
      
      console.log("支付失败:", { orderNo, status: params.trade_status });
      
      return new Response("success", { status: 200 });
    }
  } catch (error: any) {
    console.error("处理支付通知时出错:", error);
    return new Response("fail", { status: 500 });
  }
} 