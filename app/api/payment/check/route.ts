import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { PaymentStatus } from '@/utils/payment';

/**
 * 查询订单支付状态的API接口
 * 
 * 请求参数:
 * - orderNo: 订单号
 * 
 * 返回:
 * - success: 是否成功
 * - data: { status, credits, isPaid }
 * - error: 错误信息(如果有)
 */
export async function GET(request: NextRequest) {
  try {
    // 获取查询参数
    const url = new URL(request.url);
    const orderNo = url.searchParams.get('orderNo');
    
    if (!orderNo) {
      return new Response(JSON.stringify({ success: false, error: "缺少订单号" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 获取当前认证用户
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "用户未认证" }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 查询订单信息
    const { data: orderData, error: queryError } = await supabase
      .from('ai_images_creator_payments')
      .select('*')
      .eq('order_no', orderNo)
      .eq('user_id', user.id)
      .single();
    
    if (queryError) {
      console.error("查询订单信息失败:", queryError);
      return new Response(JSON.stringify({ success: false, error: "查询订单信息失败" }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (!orderData) {
      return new Response(JSON.stringify({ success: false, error: "订单不存在" }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 判断是否支付成功
    const isPaid = orderData.status === PaymentStatus.SUCCESS;
    
    return new Response(JSON.stringify({ 
      success: true, 
      data: {
        status: orderData.status,
        credits: orderData.credits,
        isPaid,
        paidAt: orderData.paid_at
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error("处理订单查询请求时出错:", error);
    return new Response(JSON.stringify({ success: false, error: error.message || "服务器内部错误" }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 