import { NextRequest, NextResponse } from 'next/server';
import { createTransactionalAdminClient } from '@/utils/supabase/admin';
import { getRequestInfo, getClientIP } from '@/utils/auth-middleware';

/**
 * 手动同步指定天数内未完成支付的API
 * 主要用于测试环境调试和特殊情况下的数据修复
 */
export const GET = async (request: NextRequest) => {
  try {
    const requestInfo = getRequestInfo(request);
    console.log(`手动同步支付API调用:`, requestInfo);
    
    // 获取参数
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '1', 10);
    const overrideKey = url.searchParams.get('override_key');
    
    // 安全检查
    const validKey = process.env.ADMIN_OVERRIDE_KEY || 'admin-secret-key';
    if (overrideKey !== validKey) {
      console.warn(`尝试使用无效的管理员密钥进行操作: ${overrideKey}`);
      return NextResponse.json({
        success: false,
        error: '无效的管理员密钥'
      }, { status: 403 });
    }
    
    // 获取事务客户端
    const transactionalAdmin = await createTransactionalAdminClient();
    
    // 使用事务处理
    const result = await transactionalAdmin.executeTransaction(async (client) => {
      // 计算时间范围
      const now = new Date();
      const startDate = new Date();
      startDate.setDate(now.getDate() - days);
      
      // 查询待处理订单
      const { data: pendingOrders, error: queryError } = await client
        .from('ai_images_creator_payments')
        .select('*')
        .eq('status', 'pending')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });
      
      if (queryError) {
        throw new Error(`查询待处理订单失败: ${queryError.message}`);
      }
      
      console.log(`找到 ${pendingOrders?.length || 0} 个待处理订单`);
      
      const results = [];
      
      // 处理每一个订单
      for (const order of pendingOrders || []) {
        console.log(`处理订单: ${order.order_no}`);
        
        // 检查是否已有点数记录
        const { data: creditLogs } = await client
          .from('ai_images_creator_credit_logs')
          .select('id')
          .eq('order_no', order.order_no)
          .eq('operation_type', 'recharge');
          
        if (creditLogs && creditLogs.length > 0) {
          console.log(`订单 ${order.order_no} 已有点数记录，跳过`);
          results.push({
            order_no: order.order_no,
            result: 'skipped',
            reason: '已有点数记录'
          });
          continue;
        }
        
        try {
          // 1. 更新订单状态
          const { error: updateError } = await client
            .from('ai_images_creator_payments')
            .update({
              status: 'success',
              paid_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('order_no', order.order_no);
            
          if (updateError) {
            throw new Error(`更新订单状态失败: ${updateError.message}`);
          }
          
          // 2. 查询用户当前点数
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
                  last_order_no: order.order_no
                });
                
              if (insertError) {
                throw new Error(`创建用户点数记录失败: ${insertError.message}`);
              }
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
                last_order_no: order.order_no
              })
              .eq('user_id', order.user_id);
              
            if (updateCreditError) {
              throw new Error(`更新用户点数失败: ${updateCreditError.message}`);
            }
          }
          
          // 3. 记录点数变更日志
          const { error: logInsertError } = await client
            .from('ai_images_creator_credit_logs')
            .insert({
              user_id: order.user_id,
              order_no: order.order_no,
              operation_type: 'recharge',
              old_value: currentCredits,
              change_value: order.credits,
              new_value: currentCredits + order.credits,
              created_at: new Date().toISOString(),
              note: `手动同步充值${order.credits}点`
            });
            
          if (logInsertError) {
            throw new Error(`创建点数变更日志失败: ${logInsertError.message}`);
          }
          
          // 4. 记录处理日志
          await client
            .from('ai_images_creator_payment_logs')
            .insert({
              order_no: order.order_no,
              user_id: order.user_id,
              process_type: 'manual_sync',
              amount: order.amount,
              credits: order.credits,
              status: 'success',
              created_at: new Date().toISOString(),
              note: `手动同步充值，IP: ${getClientIP(request)}`
            });
          
          results.push({
            order_no: order.order_no,
            result: 'success',
            oldCredits: currentCredits,
            addedCredits: order.credits,
            newCredits: currentCredits + order.credits,
            isNewCreditRecord
          });
          
          console.log(`成功处理订单 ${order.order_no}`);
        } catch (orderError) {
          console.error(`处理订单 ${order.order_no} 失败:`, orderError);
          results.push({
            order_no: order.order_no,
            result: 'error',
            error: orderError instanceof Error ? orderError.message : String(orderError)
          });
        }
      }
      
      return {
        totalProcessed: pendingOrders?.length || 0,
        results
      };
    });
    
    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('手动同步支付失败:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '手动同步失败'
    }, { status: 500 });
  }
}; 