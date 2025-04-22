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
      // 检查订单是否已经超过3天未处理，自动标记为失败
      const createdAt = new Date(order.created_at);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - createdAt.getTime());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays >= 3) {
        console.log(`订单 ${orderNo} 已超过3天未处理，自动标记为失败`);
        
        try {
          await adminClient
            .from('ai_images_creator_payments')
            .update({
              status: 'failed',
              callback_data: {
                auto_failed: true,
                reason: '订单超过3天未处理',
                time: new Date().toISOString()
              },
              updated_at: new Date().toISOString()
            })
            .eq('order_no', orderNo);
        } catch (updateError) {
          console.error(`更新过期订单状态失败:`, updateError);
        }
        
        return false;
      }
      
      // 2. 获取支付网关的配置信息
      const ZPAY_PID = process.env.ZPAY_PID || '';
      const ZPAY_KEY = process.env.ZPAY_KEY || '';
      
      if (!ZPAY_PID || !ZPAY_KEY) {
        console.error('验证支付状态: 支付网关配置缺失');
        return false;
      }

      // 构建多个可能的API URL，按优先级尝试
      const queryUrls = [
        'https://z-pay.cn/mapi/query.php',
        'https://z-pay.cn/api/query',
        'https://zpayz.cn/mapi/query.php',
        'https://zpayz.cn/api/query'
      ];
      
      // 依次尝试多个API
      for (const queryUrl of queryUrls) {
        try {
          console.log(`尝试使用API: ${queryUrl} 查询订单 ${orderNo}`);
          
          // 准备查询参数
          const queryParams: Record<string, any> = {
            pid: ZPAY_PID,
            out_trade_no: orderNo,
            time: Date.now()
          };
          
          // 计算签名
          const sign = generateSignForQuery(queryParams, ZPAY_KEY);
          queryParams['sign'] = sign;
          queryParams['sign_type'] = 'MD5';
          
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
            console.log(`支付查询API响应:`, result);
            
            // 判断订单状态
            if (result.code === 1 && result.trade_status === 'TRADE_SUCCESS') {
              console.log(`订单查询成功: ${orderNo} 已支付`);
              
              // 更新订单状态为成功
              await adminClient
                .from('ai_images_creator_payments')
                .update({
                  status: 'success',
                  trade_no: result.trade_no || '',
                  callback_data: result,
                  paid_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })
                .eq('order_no', orderNo);
                
              return true;
            } else {
              console.log(`订单查询结果: ${orderNo} 未支付或状态异常`, result);
              // 继续尝试下一个API
            }
          } else {
            const responseText = await response.text();
            console.error(`API ${queryUrl} 查询失败: ${orderNo}`, responseText);
            // 继续尝试下一个API
          }
        } catch (error) {
          console.error(`调用API ${queryUrl} 出错:`, error);
          // 继续尝试下一个API
        }
      }
      
      // 所有API都尝试失败，可以尝试备用方法
      console.log(`所有API尝试失败，尝试备用方法查询订单 ${orderNo}`);
      return await tryBackupQueryMethod(orderNo, ZPAY_PID, ZPAY_KEY, adminClient);
    }
    
    // 其他状态视为验证失败
    console.log(`验证支付状态: 订单 ${orderNo} 状态为 ${order.status}，验证失败`);
    return false;
  } catch (error) {
    console.error('验证支付状态出错:', error);
    return false;
  }
}

// 尝试备用查询方法
async function tryBackupQueryMethod(orderNo: string, pid: string, key: string, adminClient: any): Promise<boolean> {
  try {
    console.log(`尝试备用查询方法获取订单 ${orderNo} 状态`);
    
    // 备用API地址 - 尝试不同路径
    const backupUrl = `https://z-pay.cn/api/query`;
    
    const queryParams: Record<string, any> = {
      pid: pid,
      out_trade_no: orderNo,
      time: Date.now()
    };
    
    const sign = generateSignForQuery(queryParams, key);
    queryParams['sign'] = sign;
    queryParams['sign_type'] = 'MD5';
    
    console.log(`发送备用查询请求: ${backupUrl}`);
    
    const response = await fetch(backupUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(queryParams),
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log(`备用API响应:`, result);
      
      // 根据备用API的响应格式判断订单状态
      if ((result.code === 1 || result.code === '1' || result.status === 'success') && 
          (result.trade_status === 'TRADE_SUCCESS' || result.paid === true || result.paid === 'true')) {
        console.log(`备用查询成功: ${orderNo} 已支付`);
        
        // 更新订单状态为成功
        await adminClient
          .from('ai_images_creator_payments')
          .update({
            status: 'success',
            trade_no: result.trade_no || result.transaction_id || `auto_${Date.now()}`,
            callback_data: { ...result, backup_method: true },
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('order_no', orderNo);
          
        return true;
      }
    }
    
    console.log(`备用查询方法未能确认订单 ${orderNo} 状态`);
    return false;
  } catch (error) {
    console.error(`备用查询方法出错:`, error);
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