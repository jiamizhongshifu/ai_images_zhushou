import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// 从环境变量获取站点URL，默认使用本地开发URL
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    console.error('[Auth Callback] 缺少认证码')
    return NextResponse.redirect(`${origin}/auth/sign-in?error=缺少认证码`)
  }

  const supabase = await createClient()
    
  try {
    const { data: { session }, error: signInError } = await supabase.auth.exchangeCodeForSession(code)
      
    if (signInError) {
      console.error('[Auth Callback] 交换会话失败:', signInError)
      return NextResponse.redirect(`${origin}/auth/sign-in?error=${encodeURIComponent(signInError.message)}`)
    }

    if (!session) {
      console.error('[Auth Callback] 未获取到有效会话')
      return NextResponse.redirect(`${origin}/auth/sign-in?error=无效会话`)
    }

    // 设置认证相关cookie
    const response = NextResponse.redirect(`${origin}${next}`)
      
    const cookieOptions = {
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7天
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production'
    }

    response.cookies.set('auth_valid', 'true', cookieOptions)
    response.cookies.set('auth_time', Date.now().toString(), cookieOptions)

    // 保存会话恢复数据
    const sessionData = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      user: {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role
      }
    }

    response.cookies.set('session_recovery', JSON.stringify(sessionData), {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60 // 30天
    })

    console.log('[Auth Callback] 认证成功，用户:', session.user.email)
    return response
  } catch (error) {
    console.error('[Auth Callback] 处理回调时出错:', error)
    return NextResponse.redirect(`${origin}/auth/sign-in?error=${encodeURIComponent('回调处理失败')}`)
  }
}
