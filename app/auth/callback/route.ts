import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// 获取站点URL
const SITE_URL = 'https://www.imgtutu.ai';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    
    try {
      // 交换授权码获取会话
      await supabase.auth.exchangeCodeForSession(code)
      
      // 重定向到受保护页面
      return NextResponse.redirect(new URL('/protected', request.url))
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
