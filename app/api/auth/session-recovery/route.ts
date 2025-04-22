import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: NextRequest) {
  try {
    // 获取认证cookie
    const cookieStore = await cookies()
    const authValidCookie = cookieStore.get('auth_valid')
    
    // 检查认证cookie
    const authValid = authValidCookie?.value === 'true'
    
    // 如果没有认证cookie，返回未认证状态
    if (!authValid) {
      return NextResponse.json({
        status: 'unauthenticated',
        message: '未找到有效的认证状态'
      }, { status: 401 })
    }
    
    // 创建Supabase客户端
    const supabase = await createClient()
    
    // 获取会话状态
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error || !session) {
      console.error('[会话恢复] 获取会话失败:', error?.message)
      return NextResponse.json({
        status: 'error',
        message: '获取会话失败',
        error: error?.message
      }, { status: 500 })
    }
    
    // 返回成功响应
    return NextResponse.json({
      status: 'success',
      message: '会话已恢复',
      session: {
        user: session.user,
        expires_at: session.expires_at
      }
    })
  } catch (error) {
    console.error('[会话恢复] 处理请求失败:', error)
    return NextResponse.json({
      status: 'error',
      message: '处理请求失败',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  })
} 