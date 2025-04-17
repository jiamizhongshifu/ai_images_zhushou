/**
 * 图片代理API
 * 用于解决跨域和资源访问限制问题
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * 获取图片并返回
 */
export async function GET(request: NextRequest) {
  try {
    // 从URL参数中获取原始图片URL和来源
    const url = request.nextUrl.searchParams.get('url');
    const source = request.nextUrl.searchParams.get('source') || 'unknown';
    
    if (!url) {
      return NextResponse.json(
        { error: '缺少url参数' },
        { status: 400 }
      );
    }
    
    console.log(`[图片代理] 开始获取图片，来源: ${source}, URL: ${url}`);
    
    // 设置请求头，模拟浏览器请求
    const headers = new Headers();
    headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // 对于OpenAI的资源，添加特殊处理
    if (source === 'openai') {
      headers.set('Referer', 'https://openai.com/');
      // 添加可能需要的其他头信息
    }
    
    // 获取图片资源
    const imageResponse = await fetch(url, {
      headers,
      cache: 'no-store',
    });
    
    if (!imageResponse.ok) {
      console.error(`[图片代理] 获取图片失败: ${imageResponse.status} ${imageResponse.statusText}`);
      return NextResponse.json(
        { 
          error: '获取图片失败', 
          status: imageResponse.status,
          statusText: imageResponse.statusText
        },
        { status: imageResponse.status }
      );
    }
    
    // 获取原始图片的内容类型
    const contentType = imageResponse.headers.get('content-type') || 'image/png';
    
    // 读取图片数据
    const imageArrayBuffer = await imageResponse.arrayBuffer();
    const imageBuffer = Buffer.from(imageArrayBuffer);
    
    console.log(`[图片代理] 图片获取成功，类型: ${contentType}, 大小: ${imageBuffer.length}字节`);
    
    // 创建响应
    const response = new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
    return response;
  } catch (error) {
    console.error('[图片代理] 处理请求时出错:', error);
    
    return NextResponse.json(
      { 
        error: '处理请求时出错',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
} 