import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { 
  CREDIT_PACKAGES, 
  PaymentStatus, 
  PaymentType, 
  generateOrderNo, 
  generatePaymentFormData 
} from '@/utils/payment';

/**
 * 获取支付URL的API接口
 * 
 * 请求参数:
 * - packageId: 套餐ID
 * - paymentType: 支付方式(可选，默认支付宝)
 * 
 * 返回:
 * - success: 是否成功
 * - data: { orderNo, paymentUrl, formData } - 表单数据用于POST提交
 * - error: 错误信息(如果有)
 */
export async function POST(request: NextRequest) {
  try {
    // 获取当前认证用户
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "用户未认证" }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 解析请求参数
    const body = await request.json();
    const { packageId, paymentType = PaymentType.ALIPAY } = body;
    
    // 查找套餐
    const creditPackage = CREDIT_PACKAGES.find(pkg => pkg.id === packageId);
    if (!creditPackage) {
      return new Response(JSON.stringify({ success: false, error: "无效的套餐ID" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 生成订单号
    const orderNo = generateOrderNo();
    
    // 生成支付表单数据（改用表单方式）
    const paymentData = generatePaymentFormData(
      orderNo,
      creditPackage.price,
      creditPackage.credits,
      paymentType as PaymentType,
      user.id
    );
    
    // 在数据库中创建支付订单记录
    const adminClient = await createAdminClient();
    const { error: insertError } = await adminClient
      .from('ai_images_creator_payments')
      .insert({
        user_id: user.id,
        order_no: orderNo,
        amount: creditPackage.price,
        credits: creditPackage.credits,
        status: PaymentStatus.PENDING,
        payment_type: paymentType,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    
    if (insertError) {
      console.error("创建支付订单失败:", insertError);
      return new Response(JSON.stringify({ success: false, error: "创建支付订单失败" }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 返回订单号和支付数据
    return new Response(JSON.stringify({ 
      success: true, 
      data: {
        orderNo,
        paymentUrl: paymentData.url,
        formData: paymentData.formData
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error("处理支付URL请求时出错:", error);
    return new Response(JSON.stringify({ success: false, error: error.message || "服务器内部错误" }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 