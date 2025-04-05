import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createTransactionalAdminClient } from '@/utils/supabase/admin';

/**
 * 定时任务API，用于检查未完成的支付订单
 * 
 * 安全验证:
 * - x-api-key: 请求头中包含API密钥进行验证
 * 
 * 查询参数:
 * - hours: 查询多少小时内的订单，默认1小时
 * - max: 最大处理订单数，默认20
 * 
 * 返回:
 * - success: 是否成功
 * - data: 处理结果
 */
export async function GET(request: NextRequest) {
  try {
    // 安全验证
    const apiKey = request.headers.get('x-api-key');
    if (apiKey !== process.env.CRON_API_KEY) {
      return NextResponse.json({ success: false, error: '未授权访问' }, { status: 401 });
    }
    
    // 获取查询参数
    const url = new URL(request.url);
    const hoursParam = url.searchParams.get('hours');
    const maxParam = url.searchParams.get('max');
    
    // 设置默认值
    const hours = hoursParam ? parseInt(hoursParam, 10) : 1;
    const maxOrders = maxParam ? parseInt(maxParam, 10) : 20;
    
    if (isNaN(hours) || hours <= 0 || hours > 24) {
      return NextResponse.json({ success: false, error: '无效的hours参数，应为1-24之间的数字' }, { status: 400 });
    }
    
    if (isNaN(maxOrders) || maxOrders <= 0 || maxOrders > 100) {
      return NextResponse.json({ success: false, error: '无效的max参数，应为1-100之间的数字' }, { status: 400 });
    }
    
    // 获取管理员客户端
    const adminClient = await createAdminClient();
    
    // 设置时间范围
    const hoursAgo = new Date();
    hoursAgo.setHours(hoursAgo.getHours() - hours);
    
    // 查询pending状态的订单
    const { data: pendingOrders, error: queryError } = await adminClient
      .from('ai_images_creator_payments')
      .select('order_no, user_id, credits, created_at, status')
      .eq('status', 'pending')
      .gt('created_at', hoursAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(maxOrders);
    
    if (queryError) {
      console.error('查询待处理订单失败:', queryError);
      return NextResponse.json({ success: false, error: '查询订单失败' }, { status: 500 });
    }
    
    console.log(`找到 ${pendingOrders?.length || 0} 个待处理订单`);
    
    // 记录处理结果
    const results = [];
    
    // 逐个处理订单
    for (const order of pendingOrders || []) {
      try {
        // 使用事务处理每个订单
        const transactionClient = await createTransactionalAdminClient();
        const result = await transactionClient.executeTransaction(async (client) => {
          // 1. 再次确认订单状态，防止并发处理
          const { data: currentOrder, error: checkError } = await client
            .from('ai_images_creator_payments')
            .select('id, status, created_at')
            .eq('order_no', order.order_no)
            .single();
          
          if (checkError) {
            throw new Error(`查询订单最新状态失败: ${checkError.message}`);
          }
          
          // 如果订单已不是pending状态，跳过处理
          if (currentOrder.status !== 'pending') {
            return {
              order_no: order.order_no,
              status: 'skipped',
              message: `订单当前状态为${currentOrder.status}，不需要处理`
            };
          }
          
          // 2. 模拟查询支付网关的结果
          // 在实际项目中，这里应该调用支付网关的查单API
          // 为演示，我们假设创建超过5分钟的订单有70%的概率是支付成功的
          const orderAge = (new Date().getTime() - new Date(currentOrder.created_at).getTime()) / 1000 / 60; // 分钟
          const shouldMarkAsSuccess = orderAge > 5 && Math.random() < 0.7;
          
          // 3. 处理查询结果
          if (shouldMarkAsSuccess) {
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
              if (creditQueryError.code === 'PGRST116') {
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
            
            // 记录点数变更日志
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
                note: `自动检查充值${order.credits}点`
              });
              
            if (logInsertError) {
              throw new Error(`创建点数变更日志失败: ${logInsertError.message}`);
            }
            
            // 更新订单状态为成功
            const { error: updateError } = await client
              .from('ai_images_creator_payments')
              .update({
                status: 'success',
                paid_at: new Date().toISOString(),
                transaction_id: `cron_check_${Date.now()}`,
                trade_state: 'SUCCESS',
                trade_state_desc: '定时任务主动查询',
                updated_at: new Date().toISOString()
              })
              .eq('order_no', order.order_no);
              
            if (updateError) {
              throw new Error(`更新订单状态失败: ${updateError.message}`);
            }
            
            // 记录处理日志
            await client
              .from('ai_images_creator_payment_logs')
              .insert({
                order_no: order.order_no,
                user_id: order.user_id,
                process_type: 'cron_check',
                amount: 0, // 信息不完整
                credits: order.credits,
                status: 'success',
                created_at: new Date().toISOString()
              });
            
            return {
              order_no: order.order_no,
              status: 'success',
              oldCredits: currentCredits,
              addedCredits: order.credits,
              newCredits: currentCredits + order.credits,
              isNewCreditRecord
            };
          } else {
            // 订单仍为pending状态，不做处理
            return {
              order_no: order.order_no,
              status: 'pending',
              message: '支付状态未变化，保持pending状态'
            };
          }
        });
        
        results.push({
          order_no: order.order_no,
          result: result
        });
      } catch (error) {
        console.error(`处理订单 ${order.order_no} 时出错:`, error);
        results.push({
          order_no: order.order_no,
          error: error instanceof Error ? error.message : '处理失败',
          status: 'error'
        });
      }
    }
    
    // 返回处理结果
    return NextResponse.json({
      success: true,
      data: {
        total: pendingOrders?.length || 0,
        processed: results.length,
        results
      }
    });
  } catch (error) {
    console.error('批量处理待支付订单失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '处理失败'
    }, { status: 500 });
  }
} 