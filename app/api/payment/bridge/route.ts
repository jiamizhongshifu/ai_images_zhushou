import { NextRequest, NextResponse } from 'next/server';

/**
 * 支付通知URL桥接API
 * 
 * 这个API负责接收支付平台的通知请求，然后解码并转发给真正的处理端点
 * 使用这个桥接API可以避免notify_url中的特殊字符问题
 */
export async function GET(request: NextRequest) {
  try {
    // 获取编码的真实URL
    const url = request.nextUrl.searchParams.get('url');
    if (!url) {
      return NextResponse.json({ error: 'Missing URL parameter' }, { status: 400 });
    }
    
    // 解码真实URL
    const decodedUrl = Buffer.from(url, 'base64').toString('utf-8');
    console.log(`支付桥接转发: 从 ${request.url} 转发到 ${decodedUrl}`);
    
    // 获取所有传入的查询参数
    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    
    // 移除url参数，只保留支付平台传递的参数
    delete searchParams.url;
    
    // 构建新的查询字符串
    const queryString = new URLSearchParams(searchParams).toString();
    
    // 构建完整的转发URL
    const redirectUrl = `${decodedUrl}?${queryString}`;
    
    // 进行转发
    const response = await fetch(redirectUrl);
    
    if (!response.ok) {
      throw new Error(`转发请求失败: ${response.status} ${response.statusText}`);
    }
    
    // 读取响应内容
    const text = await response.text();
    
    // 返回相同的响应
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/plain'
      }
    });
  } catch (error) {
    console.error('支付通知桥接错误:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : '支付通知处理错误' 
    }, { status: 500 });
  }
}

/**
 * 同样支持POST请求的处理
 */
export async function POST(request: NextRequest) {
  try {
    // 获取编码的真实URL
    const url = request.nextUrl.searchParams.get('url');
    if (!url) {
      return NextResponse.json({ error: 'Missing URL parameter' }, { status: 400 });
    }
    
    // 解码真实URL
    const decodedUrl = Buffer.from(url, 'base64').toString('utf-8');
    console.log(`支付桥接转发(POST): 从 ${request.url} 转发到 ${decodedUrl}`);
    
    // 读取请求体
    const body = await request.text();
    
    // 获取所有传入的查询参数
    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    
    // 移除url参数，只保留支付平台传递的参数
    delete searchParams.url;
    
    // 构建新的查询字符串
    const queryString = new URLSearchParams(searchParams).toString();
    
    // 构建完整的转发URL
    const redirectUrl = `${decodedUrl}?${queryString}`;
    
    // 进行转发，传递原始请求体
    const response = await fetch(redirectUrl, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('Content-Type') || 'application/x-www-form-urlencoded'
      },
      body: body
    });
    
    if (!response.ok) {
      throw new Error(`转发请求失败: ${response.status} ${response.statusText}`);
    }
    
    // 读取响应内容
    const text = await response.text();
    
    // 返回相同的响应
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/plain'
      }
    });
  } catch (error) {
    console.error('支付通知桥接错误(POST):', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : '支付通知处理错误' 
    }, { status: 500 });
  }
} 