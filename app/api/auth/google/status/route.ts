import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { pendingAuths, getAuthState, cleanupOldAuthStates } from '../auth-state';

/**
 * 检查Google OAuth认证状态
 * 客户端通过定期轮询此端点来检查登录状态
 */
export async function POST(request: NextRequest) {
  try {
    // 清理旧数据
    cleanupOldAuthStates();
    
    // 解析请求数据
    const data = await request.json();
    const { timestamp, sessionKey } = data;
    
    if (!timestamp || !sessionKey) {
      return NextResponse.json({ 
        error: '缺少必要参数' 
      }, { status: 400 });
    }
    
    // 从内存状态获取认证状态
    const authState = getAuthState(sessionKey);
    
    if (!authState) {
      // 尝试从cookie中获取sessionKey
      const cookieValue = request.cookies.get('google_auth_state')?.value;
      
      if (cookieValue && cookieValue === sessionKey) {
        // cookie存在但内存中没有状态，说明服务器可能重启过
        return NextResponse.json({ 
          status: 'pending',
          message: '会话有效，等待认证完成'
        });
      }
      
      return NextResponse.json({ 
        status: 'failed',
        error: '找不到认证会话' 
      }, { status: 404 });
    }
    
    // 返回当前状态
    return NextResponse.json({
      status: authState.status || 'pending',
      error: authState.error,
      userData: authState.userData
    });
  } catch (error) {
    console.error('Google认证状态检查错误:', error);
    
    return NextResponse.json({ 
      status: 'failed',
      error: '服务器处理错误' 
    }, { status: 500 });
  }
} 