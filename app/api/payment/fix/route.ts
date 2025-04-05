import { NextRequest, NextResponse } from 'next/server';
import { createTransactionalAdminClient } from '@/utils/supabase/admin';
import { withAuth, AuthType, getClientIP, getRequestInfo } from '@/utils/auth-middleware';
import { getEnv } from '@/utils/env';

/**
 * 修复特定订单的API接口
 * 仅管理员可访问
 */
export const GET = withAuth(async (request: NextRequest, authResult) => {
  try {
    // 获取请求信息，用于日志记录
    const requestInfo = getRequestInfo(request);
    console.log(`修复订单API调用:`, requestInfo);
    
    // 获取订单号
    const url = new URL(request.url);
    const orderNo = url.searchParams.get('order_no');
    
    if (!orderNo) {
      return NextResponse.json({
        success: false,
        error: '缺少订单号'
      }, { status: 400 });
    }
    
    // 获取事务客户端
    const transactionalAdmin = await createTransactionalAdminClient();
    
    // 使用事务处理
    const result = await transactionalAdmin.executeTransaction(async (client) => {
      // 1. 查询订单信息
      const { data: orderData, error: orderError } = await client
        .from('ai_images_creator_payments')
        .select('*')
        .eq('order_no', orderNo)
        .single();
      
      if (orderError) {
        throw new Error(`订单查询失败: ${orderError.message}`);
      }
      
      if (!orderData) {
        throw new Error(`未找到订单: ${orderNo}`);
      }
      
      // 2. 检查订单状态
      if (orderData.status === 'success') {
        console.log(`订单 ${orderNo} 已是成功状态，检查是否已增加点数`);
        
        // 检查是否已经增加过点数
        const { data: creditLogs } = await client
          .from('ai_images_creator_credit_logs')
          .select('id, created_at')
          .eq('order_no', orderNo)
          .eq('operation_type', 'recharge');
        
        // 如果已有点数记录，则跳过处理
        if (creditLogs && creditLogs.length > 0) {
          return {
            success: true,
            message: `订单已是成功状态，且已增加点数记录于 ${creditLogs[0].created_at}`,
            order: orderData,
            creditLogs
          };
        }
        
        console.log(`订单 ${orderNo} 状态为成功，但未找到点数记录，将添加点数`);
      } else {
        // 3. 更新订单状态为成功
        const { error: updateError } = await client
          .from('ai_images_creator_payments')
          .update({
            status: 'success',
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            trade_state: 'SUCCESS',
            trade_state_desc: '手动修复'
          })
          .eq('order_no', orderNo);
          
        if (updateError) {
          throw new Error(`更新订单状态失败: ${updateError.message}`);
        }
        
        console.log(`订单 ${orderNo} 状态已更新为成功`);
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
        if (creditQueryError.code === 'PGRST116') { // 不存在的记录
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
            throw new Error(`创建用户点数记录失败: ${insertError.message}`);
          }
          
          console.log(`已为用户 ${orderData.user_id} 创建新的点数记录: ${orderData.credits}点`);
        } else {
          throw new Error(`查询用户点数失败: ${creditQueryError.message}`);
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
          throw new Error(`更新用户点数失败: ${updateCreditError.message}`);
        }
        
        console.log(`已更新用户 ${orderData.user_id} 的点数: ${currentCredits} -> ${newCredits}`);
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
          note: `手动修复充值${orderData.credits}点`
        });
        
      if (logInsertError) {
        throw new Error(`创建点数变更日志失败: ${logInsertError.message}`);
      }
      
      // 6. 记录支付处理日志
      await client
        .from('ai_images_creator_payment_logs')
        .insert({
          order_no: orderNo,
          user_id: orderData.user_id,
          process_type: 'manual_fix',
          amount: orderData.amount,
          credits: orderData.credits,
          status: 'success',
          created_at: new Date().toISOString(),
          note: `操作者: ${authResult.user?.id || '系统'}, IP: ${getClientIP(request)}`
        });
      
      const result = {
        success: true,
        message: '订单已修复，状态已更新为成功，点数已增加',
        oldCredits: currentCredits,
        addedCredits: orderData.credits,
        newCredits: currentCredits + orderData.credits,
        isNewCreditRecord
      };
      
      console.log(`订单修复结果:`, result);
      return result;
    });
    
    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('修复订单失败:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '修复订单失败'
    }, { status: 500 });
  }
}, AuthType.ADMIN);