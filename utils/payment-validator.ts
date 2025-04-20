import { createAdminClient } from '@/utils/supabase/admin';
import { getEnv } from '@/utils/env';
import { generateSign } from './payment';

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
      try {
        // 集成实际支付网关的查询API
        const queryUrl = `https://zpayz.cn/mapi/query.php`;
        
        // 准备查询参数
        const queryParams: Record<string, any> = {
          pid: ZPAY_PID,
          out_trade_no: orderNo,
          time: Date.now()
        };
        
        // 计算签名 (使用payment.ts中的函数)
        // 注意：这里需要 import { generateSign } from './payment'; 
        // 但为避免循环依赖，我们直接使用内部实现
        const sign = generateSignForQuery(queryParams, ZPAY_KEY);
        queryParams['sign'] = sign;
        
        // 发送查询请求
        const response = await fetch(queryUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(queryParams),
        });

        if (response.ok) {
          const result = await response.json();
          
          // 判断订单状态
          if (result.code === 1 && result.trade_status === 'TRADE_SUCCESS') {
            console.log(`订单查询成功: ${orderNo} 已支付`);
            
            // 更新订单状态为成功
            await adminClient
              .from('ai_images_creator_payments')
              .update({
                trade_no: result.trade_no || '',
                callback_data: result,
                updated_at: new Date().toISOString()
              })
              .eq('order_no', orderNo);
              
            return true;
          } else {
            console.log(`订单查询结果: ${orderNo} 未支付或状态异常`, result);
            return false;
          }
        } else {
          console.error(`订单查询失败: ${orderNo}`, await response.text());
          return false;
        }
      } catch (error) {
        console.error(`调用支付网关查询API出错:`, error);
        return false;
      }
    }
    
    // 其他状态视为验证失败
    console.log(`验证支付状态: 订单 ${orderNo} 状态为 ${order.status}，验证失败`);
    return false;
  } catch (error) {
    console.error('验证支付状态出错:', error);
    return false;
  }
}

// 内部函数：为查询生成签名
function generateSignForQuery(params: Record<string, any>, key: string): string {
  // 1. 排除sign和sign_type参数，以及空值参数
  const filteredParams: Record<string, any> = {};
  Object.keys(params).forEach(k => {
    const value = params[k];
    if (k !== 'sign' && k !== 'sign_type' && value !== null && value !== undefined && value !== '') {
      filteredParams[k] = value;
    }
  });

  // 2. 按照参数名ASCII码从小到大排序
  const sortedKeys = Object.keys(filteredParams).sort();

  // 3. 拼接成URL键值对的格式
  const stringArray = sortedKeys.map(key => `${key}=${filteredParams[key]}`);
  const stringA = stringArray.join('&');

  // 4. 拼接商户密钥并进行MD5加密
  const stringSignTemp = stringA + key;
  
  // 使用MD5加密
  const crypto = require('crypto');
  return crypto.createHash('md5').update(stringSignTemp).digest('hex').toLowerCase();
} 