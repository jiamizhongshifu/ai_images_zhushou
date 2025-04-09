import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  console.log('[调试API] 处理认证调试请求');
  
  // 获取所有cookie
  const cookieStore = cookies();
  // 无需使用getAll方法，直接获取所有cookie
  const allCookies = cookieStore.getAll();
  
  // 获取Supabase会话
  let sessionData = null;
  let sessionError = null;
  
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      sessionError = error.message;
    } else {
      sessionData = {
        hasSession: !!data.session,
        userId: data.session?.user?.id,
        email: data.session?.user?.email,
        expiresAt: data.session?.expires_at,
      };
    }
  } catch (error) {
    sessionError = error instanceof Error ? error.message : String(error);
  }
  
  // 提取认证相关cookie
  const authCookies = allCookies.filter(cookie => {
    const name = cookie.name.toLowerCase();
    return name.includes('auth') || 
           name.includes('login') || 
           name.includes('logout') || 
           name.includes('session') ||
           name.includes('force');
  }).map(cookie => ({
    name: cookie.name,
    value: cookie.value,
  }));
  
  // 返回所有信息
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    authCookies,
    allCookiesCount: allCookies.length,
    sessionStatus: {
      hasSession: !!sessionData,
      error: sessionError,
      details: sessionData,
    },
    requestInfo: {
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers),
    }
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
    }
  });
} 