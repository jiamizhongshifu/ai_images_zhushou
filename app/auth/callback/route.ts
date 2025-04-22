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
      const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)
      
      if (error) throw error
      
      // 创建响应对象
      const response = NextResponse.redirect(new URL(redirect, request.url))
      
      // 清除所有登出状态的 cookie
      const cookiesToClear = [
        'force_logged_out',
        'isLoggedOut',
        'auth_logged_out',
        'logged_out',
        'storage_limitation'  // 清除存储限制标记
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
        maxAge: 30,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      })
      
      // 设置认证有效标记
      response.cookies.set('auth_valid', 'true', {
        path: '/',
        maxAge: 3600,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      })
      
      return response
    } catch (error) {
      console.error('OAuth 回调错误:', error)
      
      // 如果是存储访问错误，设置标记
      if (error instanceof Error && error.message.includes('storage')) {
        const response = NextResponse.redirect(new URL(redirect, request.url))
        response.cookies.set('storage_limitation', 'true', {
          path: '/',
          maxAge: 3600,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax'
        })
        return response
      }
      
      // 其他错误重定向到登录页面并显示错误
      return NextResponse.redirect(
        new URL('/sign-in?error=授权失败，请重试', request.url)
      )
    }
  }

  // 没有授权码,重定向到登录页
  return NextResponse.redirect(new URL('/sign-in', request.url))
}
