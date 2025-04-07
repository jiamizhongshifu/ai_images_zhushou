import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/middleware';

// 强制重定向的URL
const FORCE_REDIRECT_URL = '/sign-in';

/**
 * 设置离线模式标记的Cookie
 */
function setOfflineModeCookies(response: NextResponse) {
  // 设置离线模式标记，30分钟过期
  response.cookies.set('auth_connection_issue', 'true', { 
    path: '/', 
    maxAge: 60 * 30, // 30分钟
    httpOnly: true, 
  });
  
  // 设置强制登录标记，1小时过期
  response.cookies.set('force_login', 'true', { 
    path: '/', 
    maxAge: 60 * 60, // 1小时
    httpOnly: true,
  });
  
  return response;
}

/**
 * 清除离线模式标记的Cookie
 */
function clearOfflineModeCookies(response: NextResponse) {
  // 清除离线模式标记
  response.cookies.set('auth_connection_issue', '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
  });
  
  // 清除强制登录标记
  response.cookies.set('force_login', '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
  });
  
  return response;
}

/**
 * 中间件
 * 处理认证和路由保护
 */
export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const response = NextResponse.next();
  
  // 检查是否有手动清除离线模式的请求
  if (searchParams.get('clear_offline') === 'true' || searchParams.get('reset_offline') === 'true') {
    console.log("[中间件] 检测到清除离线模式参数，清除离线模式cookie");
    clearOfflineModeCookies(response);
    return response;
  }
  
  // 如果是API路由或是公开路径，不需要认证
  if (pathname.startsWith('/api/') || 
      pathname.startsWith('/_next/') || 
      pathname.startsWith('/static/') ||
      pathname.startsWith('/images/') ||
      pathname.startsWith('/sign-in') ||
      pathname === '/') {
    // 对于登录页面，检查是否是强制退出
    if (pathname === '/sign-in' && searchParams.get('force_logout') === 'true') {
      console.log("[中间件] 检测到强制登出参数，清除离线模式cookie");
      clearOfflineModeCookies(response);
    }
    return response;
  }
  
  try {
    // 检查是否是强制登出
    if (searchParams.get('force_logout') === 'true') {
      console.log("[中间件] 检测到强制登出参数，跳过认证检查，视为未登录");
      clearOfflineModeCookies(response);
      
      // 重定向到登录页
      const redirectUrl = new URL(FORCE_REDIRECT_URL, request.url);
      redirectUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(redirectUrl);
    }
    
    // 检查是否存在离线模式的Cookie
    const authConnectionIssue = request.cookies.get('auth_connection_issue');
    const forceLogin = request.cookies.get('force_login');
    
    if (searchParams.get('clear_offline') === 'true') {
      console.log("[中间件] 检测到清除离线模式参数，清除离线模式cookie");
      clearOfflineModeCookies(response);
      return response;
    }
    
    // 如果存在离线模式Cookie并且不是强制登出，则允许访问受保护的路由
    if (authConnectionIssue?.value === 'true' && forceLogin?.value === 'true') {
      console.log("[中间件] 检测到强制登录cookie，忽略登出状态");
      return response;
    }
    
    // 创建Supabase客户端
    const supabase = createClient(request);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      console.log(`[中间件] 路径: ${pathname} 用户状态: 已登录 (${user.id})`);
      
      // 如果存在离线模式Cookie，清除它们
      if (authConnectionIssue?.value === 'true' || forceLogin?.value === 'true') {
        console.log("[中间件] 检测到用户已登录，清除离线模式cookie");
        clearOfflineModeCookies(response);
      }
      
      return response;
    }
    
    console.log(`[中间件] 路径: ${pathname} 用户状态: 未登录`);
    
    // 如果未登录，重定向到登录页
    const redirectUrl = new URL(FORCE_REDIRECT_URL, request.url);
    redirectUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(redirectUrl);
    
  } catch (error) {
    console.error("[中间件] 发生认证错误:", error);
    
    // 发生错误时，启用离线模式
    return setOfflineModeCookies(response);
  }
} 