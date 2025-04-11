import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    console.log('[设置cookie] 开始处理请求...');
    
    // 解析请求体
    const body = await request.json().catch((error) => {
      console.error('解析请求JSON失败:', error);
      throw new Error('无效的请求格式，无法解析JSON数据');
    });
    
    const { token } = body;
    
    if (!token) {
      return NextResponse.json({
        status: 'failed',
        error: '缺少必要参数: token'
      }, { status: 400 });
    }
    
    // 设置响应
    const response = NextResponse.json({
      status: 'success',
      message: '认证Cookie已设置'
    });
    
    // 设置cookie
    response.cookies.set({
      name: 'sb-access-token',
      value: token,
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7 // 7天
    });
    
    return response;
    
  } catch (error) {
    console.error('[设置cookie] 处理请求失败:', error);
    
    return NextResponse.json({
      status: 'failed',
      error: '处理请求失败',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 