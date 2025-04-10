import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  console.log('[调试API] 处理认证调试请求');
  
  // 获取所有cookie
  const cookieStore = cookies();
  const allCookies = cookieStore.getAll();
  
  // 获取Supabase用户信息
  let userData = null;
  let userError = null;
  
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    
    if (error) {
      userError = error.message;
    } else {
      userData = {
        userId: data.user?.id,
        email: data.user?.email,
        lastSignInAt: data.user?.last_sign_in_at,
        createdAt: data.user?.created_at
      };
    }
  } catch (error) {
    userError = error instanceof Error ? error.message : String(error);
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
    userStatus: {
      hasUser: !!userData,
      error: userError,
      details: userData,
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