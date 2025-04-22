import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// 检测是否可能是浏览器扩展环境的辅助函数
function isExtensionEnvironment(request: NextRequest): boolean {
  // 检查请求头中的标志
  const userAgent = request.headers.get('user-agent') || '';
  const referer = request.headers.get('referer') || '';
  const origin = request.headers.get('origin') || '';
  
  // Extension-specific indicators
  return (
    userAgent.includes('Chrome-Lighthouse') || 
    referer.includes('chrome-extension://') ||
    origin.includes('chrome-extension://') ||
    // 检查特殊URL参数，可以由扩展环境设置
    request.nextUrl.searchParams.has('extension_env') ||
    // 检查特殊cookie标记
    request.cookies.get('is_extension_env')?.value === 'true'
  );
}

export async function middleware(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl
    
    // 跳过不需要认证的路径
    if (pathname.startsWith('/_next/') || 
        pathname.startsWith('/api/') ||
        pathname.startsWith('/static/') ||
        pathname.startsWith('/images/') ||
        pathname === '/' ||
        pathname === '/sign-in') {
      return NextResponse.next()
    }

    // 创建响应对象
    const res = NextResponse.next()
    const supabase = createMiddlewareClient({ req: request, res })

    // 检查存储访问限制
    const hasStorageLimitation = request.cookies.get('storage_limitation')?.value === 'true'
    
    // 如果有存储访问限制，使用cookie中的认证状态
    if (hasStorageLimitation) {
      const authValid = request.cookies.get('auth_valid')?.value === 'true'
      if (!authValid && pathname.startsWith('/protected')) {
        const redirectUrl = new URL('/sign-in', request.url)
        redirectUrl.searchParams.set('redirect', pathname)
        return NextResponse.redirect(redirectUrl)
      }
      return res
    }
    
    // 获取会话状态
    const { data: { session } } = await supabase.auth.getSession()
    
    // 检查认证成功标记
    const authSuccess = request.cookies.get('auth_success')?.value === 'true'
    
    // 如果有认证成功标记，清除所有登出状态
    if (authSuccess) {
      const response = NextResponse.next()
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
      
      // 设置认证有效标记
      response.cookies.set('auth_valid', 'true', {
        path: '/',
        maxAge: 3600,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      })
      
      return response
    }
    
    // 处理受保护路由的访问
    if (pathname.startsWith('/protected')) {
      if (!session) {
        // 未登录时重定向到登录页
        const redirectUrl = new URL('/sign-in', request.url)
        redirectUrl.searchParams.set('redirect', pathname)
        return NextResponse.redirect(redirectUrl)
      }
      
      // 设置认证有效标记
      res.cookies.set('auth_valid', 'true', {
        path: '/',
        maxAge: 3600,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      })
    }
    
    return res
  } catch (error) {
    console.error('[Middleware Error]:', error)
    
    // 如果出现存储访问错误，设置标记
    if (error instanceof Error && error.message.includes('storage')) {
      const res = NextResponse.next()
      res.cookies.set('storage_limitation', 'true', {
        path: '/',
        maxAge: 3600,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      })
      return res
    }
    
    return NextResponse.next()
  }
}

// 配置中间件匹配规则
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
