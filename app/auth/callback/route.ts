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
  const authTime = requestUrl.searchParams.get('auth_time') || Date.now().toString()

  if (code) {
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    
    try {
      // 交换授权码获取会话
      const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)
      
      if (error) throw error
      
      // 创建响应对象
      const response = NextResponse.redirect(new URL(`${redirect}?auth_time=${authTime}`, request.url))
      
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

      // 设置会话恢复标记
      if (session) {
        response.cookies.set('session_recovery', JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          auth_time: authTime
        }), {
          path: '/',
          maxAge: 3600,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax'
        })
      }
      
      return response
    } catch (error) {
      console.error('OAuth 回调错误:', error)
      
      // 如果是存储访问错误，设置标记并继续
      if (error instanceof Error && error.message.includes('storage')) {
        const response = NextResponse.redirect(new URL(`${redirect}?auth_time=${authTime}&storage_error=true`, request.url))
        response.cookies.set('storage_limitation', 'true', {
          path: '/',
          maxAge: 3600,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax'
        })
        
        // 尝试从错误中提取会话信息
        try {
          const sessionData = (error as any).session || null
          if (sessionData) {
            response.cookies.set('session_recovery', JSON.stringify({
              access_token: sessionData.access_token,
              refresh_token: sessionData.refresh_token,
              expires_at: sessionData.expires_at,
              auth_time: authTime
            }), {
              path: '/',
              maxAge: 3600,
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax'
            })
          }
        } catch (e) {
          console.warn('无法保存会话恢复数据:', e)
        }
        
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
