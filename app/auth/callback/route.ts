import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// 获取站点URL
const SITE_URL = 'https://www.imgtutu.ai';

export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')
    const redirect = requestUrl.searchParams.get('redirect') || '/protected'
    const authTime = requestUrl.searchParams.get('auth_time') || Date.now().toString()

    if (!code) {
      console.error('[OAuth Callback] 未找到授权码')
      return NextResponse.redirect(new URL('/sign-in?error=未找到授权码', request.url))
    }

    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    
    try {
      const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)
      
      if (error) throw error
      
      if (!session) {
        throw new Error('获取会话失败')
      }

      // 创建响应对象
      const response = NextResponse.redirect(new URL(`${redirect}?auth_time=${authTime}`, request.url))
      
      // 设置认证相关cookie
      const cookieOptions = {
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        httpOnly: true,
        maxAge: 3600 // 1小时
      }

      // 设置会话恢复数据
      const sessionRecoveryData = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        auth_time: authTime,
        user: {
          id: session.user.id,
          email: session.user.email
        }
      }

      response.cookies.set('session_recovery', JSON.stringify(sessionRecoveryData), cookieOptions)
      response.cookies.set('auth_valid', 'true', cookieOptions)
      response.cookies.set('auth_time', authTime, cookieOptions)
      
      // 清除登出状态相关cookie
      const cookiesToClear = ['force_logged_out', 'isLoggedOut', 'logged_out', 'storage_limitation']
      cookiesToClear.forEach(name => {
        response.cookies.set(name, '', {
          path: '/',
          expires: new Date(0),
          maxAge: 0
        })
      })
      
      return response
    } catch (error) {
      console.error('[OAuth Callback] 处理授权码时出错:', error)
      
      // 如果是存储访问错误，尝试使用备用方案
      if (error instanceof Error && error.message.includes('storage')) {
        const response = NextResponse.redirect(new URL(`${redirect}?auth_time=${authTime}&storage_error=true`, request.url))
        
        // 设置存储限制标记
        response.cookies.set('storage_limitation', 'true', {
          path: '/',
          maxAge: 3600,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax'
        })
        
        return response
      }
      
      return NextResponse.redirect(new URL('/sign-in?error=授权失败，请重试', request.url))
    }
  } catch (error) {
    console.error('[OAuth Callback] 处理请求时出错:', error)
    return NextResponse.redirect(new URL('/sign-in?error=系统错误，请稍后重试', request.url))
  }
}
