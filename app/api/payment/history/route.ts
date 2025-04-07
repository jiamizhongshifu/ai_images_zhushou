import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { revalidatePath } from "next/cache";

export async function GET(request: NextRequest) {
  try {
    // 创建服务端Supabase客户端
    const supabase = await createClient();
    
    // 获取当前用户会话
    const {
      data: { session },
    } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json({ success: false, error: "未授权访问" }, { status: 401 });
    }
    
    // 查询用户的支付订单历史
    const { data: orders, error } = await supabase
      .from('ai_images_creator_payments')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) {
      console.error('查询订单历史失败:', error.message);
      return NextResponse.json(
        { success: false, error: `查询订单历史失败: ${error.message}` },
        { status: 500 }
      );
    }
    
    // 格式化返回数据
    const formattedOrders = orders.map((order: any) => ({
      id: order.id,
      orderNo: order.order_no,
      packageId: order.package_id || '1',
      packageName: order.package_name || undefined,
      price: order.amount,
      credits: order.credits,
      status: order.status,
      paymentType: order.payment_type,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      paidAt: order.paid_at
    }));
    
    // 重新验证相关路径缓存
    revalidatePath('/protected');
    
    return NextResponse.json({
      success: true,
      orders: formattedOrders
    });
  } catch (error) {
    console.error("获取订单历史失败:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: `获取订单历史时发生错误: ${errorMessage}` },
      { status: 500 }
    );
  }
} 