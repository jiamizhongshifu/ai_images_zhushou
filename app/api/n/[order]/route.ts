import { NextRequest, NextResponse } from 'next/server';

/**
 * 极简化支付通知处理API
 * 通过非常短的URL接收支付通知，然后转发到实际处理程序
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ order: string }> }
) {
  try {
    // 获取订单号 (在Next.js 15中，params是一个Promise)
    const { order: orderNo } = await context.params;
    
    // 记录通知
    console.log(`收到支付通知 [GET] 订单号: ${orderNo}`);
    
    // 获取原始URL，记录完整信息
    console.log(`原始请求URL: ${request.url}`);
    
    // 构建完整的查询参数，确保所有参数都被传递
    const searchParams = new URLSearchParams();
    
    // 从请求URL中复制所有参数 - 使用Array.from避免迭代器问题
    Array.from(request.nextUrl.searchParams.entries()).forEach(([key, value]) => {
      searchParams.set(key, value);
    });
    
    // 确保添加订单号，这是最关键的参数
    if (!searchParams.has('out_trade_no')) {
      searchParams.set('out_trade_no', orderNo);
    }
    
    // 转发到真正的webhook处理
    const webhookUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/payment/webhook?${searchParams.toString()}`;
    
    console.log(`转发支付通知到: ${webhookUrl}`);
    
    // 执行转发，确保正确处理响应
    const response = await fetch(webhookUrl);
    const responseText = await response.text();
    
    console.log(`支付通知处理响应: ${responseText}`);
    
    // 返回原始响应
    return new Response(responseText, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/plain',
      },
    });
  } catch (error) {
    // 详细记录错误信息
    console.error('支付通知处理错误:', error instanceof Error ? error.message : String(error));
    console.error('错误详情:', error);
    
    // 总是返回成功，防止支付平台重试
    return new Response('success', { status: 200 });
  }
}

/**
 * 处理POST请求
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ order: string }> }
) {
  try {
    // 获取订单号 (在Next.js 15中，params是一个Promise)
    const { order: orderNo } = await context.params;
    
    // 记录通知
    console.log(`收到支付通知 [POST] 订单号: ${orderNo}`);
    console.log(`原始请求URL: ${request.url}`);
    
    // 读取请求体
    const body = await request.text();
    console.log(`POST请求体: ${body}`);
    
    // 构建转发请求，确保添加订单号作为查询参数
    const webhookUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/payment/webhook?out_trade_no=${orderNo}`;
    
    console.log(`转发支付通知到: ${webhookUrl}`);
    
    // 执行转发，将原始请求体和参数一起发送
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('Content-Type') || 'application/x-www-form-urlencoded',
      },
      body: body,
    });
    
    const responseText = await response.text();
    console.log(`支付通知处理响应: ${responseText}`);
    
    // 返回原始响应
    return new Response(responseText, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/plain',
      },
    });
  } catch (error) {
    // 详细记录错误信息
    console.error('支付通知处理错误:', error instanceof Error ? error.message : String(error));
    console.error('错误详情:', error);
    
    // 总是返回成功，防止支付平台重试
    return new Response('success', { status: 200 });
  }
} 