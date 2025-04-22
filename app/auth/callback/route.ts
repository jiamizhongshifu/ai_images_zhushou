import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// 获取站点URL
const SITE_URL = 'https://www.imgtutu.ai';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const redirect = requestUrl.searchParams.get('redirect') || '/protected'

  if (code) {
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    
    try {
      // 交换授权码获取会话
      await supabase.auth.exchangeCodeForSession(code)
      
      // 清除所有登出状态的 cookie
      const response = NextResponse.redirect(new URL(redirect, request.url))
      const cookiesToClear = [
        'force_logged_out',
        'isLoggedOut',
        'auth_logged_out',
        'logged_out'
      ]
      
      cookiesToClear.forEach(name => {
        response.cookies.set(name, '', {
          path: '/',
          expires: new Date(0),
          maxAge: 0
        })
      })
      
      // 设置认证成功标记
      response.cookies.set('auth_success', 'true', {
        path: '/',
        maxAge: 30, // 30秒后过期
        httpOnly: true
      })
      
      return response
    } catch (error) {
      console.error('OAuth 回调错误:', error)
      // 重定向到登录页面并显示错误
      return NextResponse.redirect(
        new URL('/sign-in?error=授权失败，请重试', request.url)
      )
    }
  }

  // 没有授权码,重定向到登录页
  return NextResponse.redirect(new URL('/sign-in', request.url))
}
