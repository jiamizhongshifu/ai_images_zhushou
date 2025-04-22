import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  console.log('[直接认证测试] 开始处理请求');
  
  // 记录请求信息
  console.log('请求URL:', request.url);
  console.log('请求方法:', request.method);
  console.log('请求头:', Object.fromEntries(request.headers));
  
  // 获取cookie
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  
  console.log('所有cookie:', allCookies.map(c => ({ name: c.name, value: c.value })));
  
  // 创建Supabase客户端
  const supabase = await createClient();
  
  // 获取用户信息
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error) {
    console.error('获取用户信息失败:', error);
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  
  if (!user) {
    return NextResponse.json({ error: '未找到用户' }, { status: 401 });
  }
  
  return NextResponse.json({
    message: '认证成功',
    user: {
      id: user.id,
      email: user.email,
      lastSignIn: user.last_sign_in_at,
    }
  });
} 