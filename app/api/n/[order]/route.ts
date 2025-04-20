import { NextRequest, NextResponse } from 'next/server';

/**
 * 极简化支付通知处理API
 * 通过非常短的URL接收支付通知，然后转发到实际处理程序
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { order: string } }
) {
  try {
    // 获取订单号
    const orderNo = params.order;
    
    // 记录通知
    console.log(`收到支付通知 [GET] 订单号: ${orderNo}`);
    
    // 构建完整的查询参数
    const searchParams = new URLSearchParams(request.nextUrl.searchParams);
    
    // 确保添加订单号
    if (!searchParams.has('out_trade_no')) {
      searchParams.set('out_trade_no', orderNo);
    }
    
    // 转发到真正的webhook处理
    const webhookUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/payment/webhook?${searchParams.toString()}`;
    
    console.log(`转发支付通知到: ${webhookUrl}`);
    
    // 执行转发
    const response = await fetch(webhookUrl);
    
    // 返回原始响应
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/plain',
      },
    });
  } catch (error) {
    console.error('支付通知处理错误:', error);
    return new Response('success', { status: 200 }); // 总是返回成功，防止重试
  }
}

/**
 * 处理POST请求
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { order: string } }
) {
  try {
    // 获取订单号
    const orderNo = params.order;
    
    // 记录通知
    console.log(`收到支付通知 [POST] 订单号: ${orderNo}`);
    
    // 读取请求体
    const body = await request.text();
    
    // 构建转发请求
    const webhookUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/payment/webhook`;
    
    console.log(`转发支付通知到: ${webhookUrl}`);
    
    // 执行转发，将原始请求体和参数一起发送
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('Content-Type') || 'application/x-www-form-urlencoded',
      },
      body: body,
    });
    
    // 返回原始响应
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/plain',
      },
    });
  } catch (error) {
    console.error('支付通知处理错误:', error);
    return new Response('success', { status: 200 }); // 总是返回成功，防止重试
  }
} 