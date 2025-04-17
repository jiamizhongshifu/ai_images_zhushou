/**
 * 图片下载API
 * 用于下载图片并设置适当的下载头信息
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * 获取图片并返回，带有下载头信息
 */
export async function GET(request: NextRequest) {
  try {
    // 从URL参数中获取原始图片URL
    const url = request.nextUrl.searchParams.get('url');
    const filename = request.nextUrl.searchParams.get('filename') || `image-${Date.now()}.png`;
    
    if (!url) {
      return NextResponse.json(
        { error: '缺少url参数' },
        { status: 400 }
      );
    }
    
    console.log(`[图片下载] 开始获取图片，URL: ${url}`);
    
    // 设置请求头，模拟浏览器请求
    const headers = new Headers();
    headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // 对于OpenAI的资源，添加特殊处理
    if (url.includes('openai.com')) {
      headers.set('Referer', 'https://openai.com/');
    }
    
    // 获取图片资源
    const imageResponse = await fetch(url, {
      headers,
      cache: 'no-store',
    });
    
    if (!imageResponse.ok) {
      console.error(`[图片下载] 获取图片失败: ${imageResponse.status} ${imageResponse.statusText}`);
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
    let contentType = imageResponse.headers.get('content-type') || 'image/png';
    
    // 确保内容类型是图片格式
    if (!contentType.startsWith('image/')) {
      contentType = 'image/png';
    }
    
    // 从内容类型提取文件扩展名
    const fileExt = contentType.split('/')[1] || 'png';
    
    // 生成文件名（如果未提供）
    const downloadFilename = filename.includes('.') ? 
      filename : `${filename}.${fileExt}`;
    
    // 读取图片数据
    const imageArrayBuffer = await imageResponse.arrayBuffer();
    const imageBuffer = Buffer.from(imageArrayBuffer);
    
    console.log(`[图片下载] 图片获取成功，类型: ${contentType}, 大小: ${imageBuffer.length}字节`);
    
    // 创建下载响应，添加下载所需的头信息
    const response = new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${downloadFilename}"`,
        'Content-Length': imageBuffer.length.toString(),
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
    return response;
  } catch (error) {
    console.error('[图片下载] 处理请求时出错:', error);
    
    return NextResponse.json(
      { 
        error: '处理请求时出错',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
} 