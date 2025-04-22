import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createTransactionalAdminClient } from '@/utils/supabase/admin';
import { authenticate, AuthType } from '@/utils/auth-middleware';
import { PaymentStatus } from '@/utils/payment';
import { handleError, ErrorLevel } from '@/utils/error-handler';

/**
 * 修复订单状态API - 仅管理员可用
 * 
 * 请求体:
 * - orderNo: 订单号
 * - targetStatus: 目标状态 (success/pending/failed)
 * - forceCreditUpdate: 是否强制更新点数（true/false）
 * 
 * 返回:
 * - success: 是否成功
 * - message: 操作结果信息
 * - order: 更新后的订单信息
 */
export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const authResult = await authenticate(request, AuthType.ADMIN);
    if (!authResult.user) {
      return NextResponse.json({
        success: false,
        error: '未授权访问'
      }, { status: 401 });
    }
    
    // 获取请求参数
    const body = await request.json();
    const { orderNo, targetStatus, forceCreditUpdate = false } = body;
    
    if (!orderNo) {
      return NextResponse.json({
        success: false,
        error: '缺少订单号'
      }, { status: 400 });
    }
    
    if (!targetStatus || !Object.values(PaymentStatus).includes(targetStatus)) {
      return NextResponse.json({
        success: false,
        error: '无效的目标状态'
      }, { status: 400 });
    }
    
    // 获取管理员信息
    const adminId = authResult.user?.id;
    console.log(`管理员 ${adminId} 尝试修复订单 ${orderNo} 状态为 ${targetStatus}`);
    
    // 使用事务客户端
    const transactionClient = await createTransactionalAdminClient();
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
      
      // 记录原始状态
      const originalStatus = order.status;
      const originalUpdated = order.credits_updated;
        
      // 如果状态没有变化且不需要强制更新点数，则直接返回
      if (originalStatus === targetStatus && (!forceCreditUpdate || originalUpdated)) {
          return {
            success: true,
          message: `订单状态已经是 ${targetStatus}，无需修改`,
          order
          };
        }
        
      // 更新订单状态
      const updates: any = {
        status: targetStatus,
        updated_at: new Date().toISOString(),
        manual_processed: true
      };
      
      // 如果是成功状态，设置支付时间
      if (targetStatus === PaymentStatus.SUCCESS) {
        updates.paid_at = order.paid_at || new Date().toISOString();
      }
      
      // 更新订单
        const { error: updateError } = await client
          .from('ai_images_creator_payments')
        .update(updates)
          .eq('order_no', orderNo);
          
        if (updateError) {
          throw new Error(`更新订单状态失败: ${updateError.message}`);
        }
        
      // 如果状态改为成功且需要更新点数，或者强制更新点数
      if ((targetStatus === PaymentStatus.SUCCESS && !order.credits_updated) || 
          (targetStatus === PaymentStatus.SUCCESS && forceCreditUpdate)) {
      
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
            note: `管理员手动修复-增加${order.credits}点`
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
        
        // 记录管理员操作日志
        await client
          .from('ai_images_creator_admin_logs')
          .insert({
            admin_id: adminId,
            operation: 'fix_payment',
            target_id: orderNo,
            original_data: { status: originalStatus, credits_updated: originalUpdated },
            new_data: { status: targetStatus, credits_updated: true },
            note: `手动修复订单状态并更新点数`,
            created_at: new Date().toISOString()
          });
        
        return {
          success: true,
          message: `订单状态已从 ${originalStatus} 更新为 ${targetStatus}，并已更新用户点数`,
          order: {
            ...order,
            status: targetStatus,
            credits_updated: true,
            paid_at: updates.paid_at
          },
          creditsUpdated: true,
          oldCredits: currentCredits,
          creditsAdded: order.credits,
          newCredits: currentCredits + order.credits
        };
      }
      
      // 如果状态改为非成功，且之前已经更新过点数，需要扣除点数
      if (targetStatus !== PaymentStatus.SUCCESS && order.credits_updated) {
        // 需要扣除之前增加的点数
        // 查询用户当前点数
        const { data: creditData, error: creditQueryError } = await client
          .from('ai_images_creator_credits')
          .select('credits')
          .eq('user_id', order.user_id)
          .single();
          
        if (creditQueryError) {
          throw new Error(`查询用户点数失败: ${creditQueryError.message}`);
        }
        
        // 扣除点数
        const currentCredits = creditData.credits;
        const newCredits = Math.max(0, currentCredits - order.credits); // 确保不会变成负数
        
        const { error: updateCreditError } = await client
          .from('ai_images_creator_credits')
          .update({
            credits: newCredits,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', order.user_id);
          
        if (updateCreditError) {
          throw new Error(`更新用户点数失败: ${updateCreditError.message}`);
        }
        
        // 记录点数变更日志
      const { error: logInsertError } = await client
        .from('ai_images_creator_credit_logs')
        .insert({
            user_id: order.user_id,
          order_no: orderNo,
            operation_type: 'deduct',
          old_value: currentCredits,
            change_value: -order.credits,
            new_value: newCredits,
          created_at: new Date().toISOString(),
            note: `管理员手动修复-扣除${order.credits}点`
        });
        
      if (logInsertError) {
        throw new Error(`创建点数变更日志失败: ${logInsertError.message}`);
      }
      
        // 更新订单标记为未更新点数
        const { error: updateOrderError } = await client
          .from('ai_images_creator_payments')
          .update({
            credits_updated: false,
            updated_at: new Date().toISOString()
          })
          .eq('order_no', orderNo);
          
        if (updateOrderError) {
          throw new Error(`更新订单标记失败: ${updateOrderError.message}`);
        }
        
        // 记录管理员操作日志
        await client
          .from('ai_images_creator_admin_logs')
          .insert({
            admin_id: adminId,
            operation: 'fix_payment',
            target_id: orderNo,
            original_data: { status: originalStatus, credits_updated: originalUpdated },
            new_data: { status: targetStatus, credits_updated: false },
            note: `手动修复订单状态并扣除点数`,
            created_at: new Date().toISOString()
          });
        
        return {
          success: true,
          message: `订单状态已从 ${originalStatus} 更新为 ${targetStatus}，并已扣除之前增加的用户点数`,
          order: {
            ...order,
            status: targetStatus,
            credits_updated: false
          },
          creditsUpdated: false,
          oldCredits: currentCredits,
          creditsDeducted: order.credits,
          newCredits: newCredits
        };
      }
      
      // 记录管理员操作日志
      await client
        .from('ai_images_creator_admin_logs')
        .insert({
          admin_id: adminId,
          operation: 'fix_payment',
          target_id: orderNo,
          original_data: { status: originalStatus },
          new_data: { status: targetStatus },
          note: `手动修复订单状态，不涉及点数变更`,
          created_at: new Date().toISOString()
        });
      
      return {
        success: true,
        message: `订单状态已从 ${originalStatus} 更新为 ${targetStatus}`,
        order: {
          ...order,
          status: targetStatus
        }
      };
    });
    
    return NextResponse.json(result);
  } catch (error) {
    handleError(error, '修复订单状态', null, ErrorLevel.ERROR);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '修复订单失败'
    }, { status: 500 });
  }
}