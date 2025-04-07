import { createAdminClient } from '@/utils/supabase/admin';
import { getEnv } from '@/utils/env';

/**
 * 验证支付状态
 * 
 * 此函数对接支付网关API，验证订单是否真实支付
 * 由于我们不能直接在客户端验证支付结果，需要在服务端调用第三方接口验证
 * 
 * @param orderNo 订单号
 * @returns 是否验证通过
 */
export async function verifyPaymentStatus(orderNo: string): Promise<boolean> {
  try {
    if (!orderNo) {
      console.warn('验证支付状态: 未提供订单号');
      return false;
    }
    
    console.log(`开始验证订单 ${orderNo} 支付状态`);
    
    // 1. 首先查询数据库中订单的状态
    const adminClient = await createAdminClient();
    
    const { data: order, error } = await adminClient
      .from('ai_images_creator_payments')
      .select('*')
      .eq('order_no', orderNo)
      .single();
    
    if (error || !order) {
      console.error(`验证支付状态: 订单不存在`, error);
      return false;
    }
    
    // 如果订单已经成功，直接返回true
    if (order.status === 'success') {
      console.log(`验证支付状态: 订单 ${orderNo} 已标记为成功`);
      return true;
    }
    
    // 如果订单是pending，需要调用第三方接口验证
    if (order.status === 'pending') {
      // 2. 获取支付网关的配置信息
      const ZPAY_PID = process.env.ZPAY_PID || '';
      const ZPAY_KEY = process.env.ZPAY_KEY || '';
      
      if (!ZPAY_PID || !ZPAY_KEY) {
        console.error('验证支付状态: 支付网关配置缺失');
        return false;
      }

      // 3. 调用您的支付网关的查询API
      // 此处为了安全起见，暂时关闭自动验证，需要实际支付回调才能成功
      // 实际项目中，应该对接支付网关的订单查询API，示例代码:
      /*
      const response = await fetch('https://api.payment-gateway.com/order/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pid: ZPAY_PID,
          order_no: orderNo,
          sign: generateSign({ pid: ZPAY_PID, order_no: orderNo }, ZPAY_KEY)
        }),
      });

      if (response.ok) {
        const result = await response.json();
        return result.status === 'success';
      }
      */
      
      // 在实际集成支付网关查询API之前，我们返回false，表示需要等待支付回调
      console.log(`验证支付状态: 订单 ${orderNo} 需要等待支付回调确认`);
      return false;
    }
    
    // 其他状态视为验证失败
    console.log(`验证支付状态: 订单 ${orderNo} 状态为 ${order.status}，验证失败`);
    return false;
  } catch (error) {
    console.error('验证支付状态出错:', error);
    return false;
  }
} 