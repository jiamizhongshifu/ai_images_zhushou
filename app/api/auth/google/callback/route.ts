import { NextRequest, NextResponse } from 'next/server';
import { getAuthState, updateAuthState, pendingAuths } from '../auth-state';
import { createClient } from '@/utils/supabase/server';

// Google OAuth配置
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const IS_DEV = process.env.NODE_ENV === 'development';
const NEXT_PUBLIC_URL = process.env.NEXT_PUBLIC_URL || process.env.VERCEL_URL || 'http://localhost:3000';

// 使用已在Google控制台注册的重定向URI
const REDIRECT_URI = IS_DEV 
  ? `http://localhost:3000/api/auth/google/callback` 
  : `https://imgtutu.ai/api/auth/google/callback`;

/**
 * 处理Google OAuth回调
 * 此API由Google OAuth流程回调
 */
export async function GET(request: NextRequest) {
  try {
    // 获取URL中的code和state参数
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    
    // 从请求中获取cookie
    const cookieSessionKey = request.cookies.get('google_auth_state')?.value;
    
    // 尝试从cookie或state参数中获取会话密钥
    let sessionKey = cookieSessionKey;
    
    // 如果cookie中没有会话密钥或无效，尝试使用state参数
    if (!sessionKey || sessionKey === 'undefined') {
      console.log('[GoogleAuth] Cookie中的会话密钥无效，尝试使用state参数');
      // 检查state参数是否是有效的会话密钥
      if (state) {
        const stateAuthState = getAuthState(state);
        if (stateAuthState) {
          sessionKey = state;
          console.log('[GoogleAuth] 使用state参数作为会话密钥:', state);
        }
      }
    }
    
    // 如果没有有效的会话密钥或code，认证失败
    if (!sessionKey || (!code && !error)) {
      console.error('[GoogleAuth] 缺少必要的回调参数:', { cookieSessionKey, state, code, error });
      // 尝试重定向到NextAuth
      if (code && state) {
        console.log('[GoogleAuth] 直接重定向到NextAuth回调');
        return redirectToNextAuth(code, state);
      }
      return getCallbackResponse('认证失败: 缺少必要参数', true, sessionKey || '');
    }
    
    // 获取认证状态
    let authState = getAuthState(sessionKey);
    let restoredFromGlobal = false;

    // 如果本地找不到认证状态，尝试从全局恢复
    if (!authState) {
      console.error('[GoogleAuth] 找不到普通认证会话:', sessionKey);
      
      // 尝试从全局会话状态中获取
      try {
        const globalSessions = (global.__GOOGLE_AUTH_SESSIONS as Map<string, any>) || new Map();
        const globalState = globalSessions.get(sessionKey);
        
        if (globalState) {
          console.log('[GoogleAuth] 从全局会话状态中找到会话:', sessionKey, globalState);
          // 还原到普通会话状态
          pendingAuths.set(sessionKey, {
            timestamp: globalState.timestamp,
            state: globalState.state,
            sessionKey,
            status: 'pending'
          });
          
          // 重新获取并确认
          authState = getAuthState(sessionKey);
          restoredFromGlobal = true;
          
          if (authState) {
            console.log('[GoogleAuth] 成功从全局会话状态恢复会话:', authState);
          } else {
            console.error('[GoogleAuth] 全局会话恢复失败，无法获取authState');
          }
        }
      } catch (err) {
        console.error('[GoogleAuth] 恢复全局会话出错:', err);
      }
    }
    
    // 如果仍然没有认证状态或状态不匹配，则认证失败
    if (!authState) {
      console.error('[GoogleAuth] 无法找到或恢复认证会话');
      // 尝试使用NextAuth完成认证流程
      if (code && state) {
        return redirectToNextAuth(code, state);
      }
      return getCallbackResponse('认证失败: 找不到有效会话', true, sessionKey);
    }
    
    // 验证state参数，防止CSRF攻击
    if (state !== authState.state) {
      console.error('[GoogleAuth] 状态验证失败:', { 
        receivedState: state, 
        expectedState: authState.state,
        restoredFromGlobal
      });
      updateAuthState(sessionKey, { status: 'failed', error: '状态验证错误' });
      return getCallbackResponse('认证失败: 状态验证错误', true, sessionKey);
    }
    
    // 检查是否有错误返回
    if (error) {
      console.error('[GoogleAuth] Google返回错误:', error);
      updateAuthState(sessionKey, { status: 'failed', error: error });
      return getCallbackResponse(`认证失败: ${error}`, true, sessionKey);
    }
    
    try {
      // 使用授权码获取访问令牌
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code: code!,
          client_id: GOOGLE_CLIENT_ID!,
          client_secret: GOOGLE_CLIENT_SECRET!,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });
      
      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        console.error('[GoogleAuth] 获取令牌失败:', errorData);
        updateAuthState(sessionKey, { status: 'failed', error: '无法获取访问令牌' });
        return getCallbackResponse('认证失败: 无法获取访问令牌', true, sessionKey);
      }
      
      const tokenData = await tokenResponse.json();
      const { access_token, id_token } = tokenData;
      
      // 使用访问令牌获取用户信息
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });
      
      if (!userInfoResponse.ok) {
        const errorData = await userInfoResponse.text();
        console.error('[GoogleAuth] 获取用户信息失败:', errorData);
        updateAuthState(sessionKey, { status: 'failed', error: '无法获取用户信息' });
        return getCallbackResponse('认证失败: 无法获取用户信息', true, sessionKey);
      }
      
      const userData = await userInfoResponse.json();
      
      try {
        // 使用Supabase创建或获取用户
        const supabase = await createClient();
        
        // 使用Google身份验证
        const { data: authData, error: authError } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: id_token,
        });
        
        if (authError || !authData.user) {
          console.error('[GoogleAuth] Supabase认证失败:', authError);
          updateAuthState(sessionKey, { status: 'failed', error: authError?.message || '无法完成登录流程' });
          return getCallbackResponse('认证失败: 无法完成登录流程', true, sessionKey);
        }
        
        // 设置认证cookie
        const response = getCallbackResponse('认证成功！正在返回应用...', false, sessionKey);
        
        // 设置认证cookie，确保中间件能识别
        response.cookies.set('user_authenticated', 'true', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 24 * 60 * 60 // 24小时
        });
        
        response.cookies.set('auth_synced', 'true', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 24 * 60 * 60 // 24小时
        });
        
        // 更新认证状态
        updateAuthState(sessionKey, { 
          status: 'success', 
          userData: {
            ...authData.user,
            session: authData.session
          }
        });
        
        return response;
      } catch (supabaseError) {
        console.error('[GoogleAuth] Supabase操作错误:', supabaseError);
        updateAuthState(sessionKey, { status: 'failed', error: '认证服务异常' });
        return getCallbackResponse('认证失败: 服务异常', true, sessionKey);
      }
    } catch (fetchError) {
      console.error('[GoogleAuth] 获取令牌或用户信息出错:', fetchError);
      updateAuthState(sessionKey, { status: 'failed', error: '网络请求错误' });
      
      // 尝试重定向到NextAuth
      if (code && state) {
        return redirectToNextAuth(code, state);
      }
      
      return getCallbackResponse('认证过程中发生网络错误，请重试', true, sessionKey);
    }
  } catch (error) {
    console.error('[GoogleAuth] 回调处理错误:', error);
    return getCallbackResponse('认证过程中发生错误，请重试', true, '');
  }
}

/**
 * 重定向到NextAuth
 */
function redirectToNextAuth(code: string | null, state: string | null) {
  if (!code) {
    console.error('[GoogleAuth] 无法重定向到NextAuth: 缺少code参数');
    return getCallbackResponse('认证失败: 无效的认证代码', true, '');
  }
  
  // 直接返回一个通知页面，让父窗口处理重定向
  return getCallbackResponse('认证成功，正在处理...', false, state || '');
}

/**
 * 生成回调响应HTML页面
 */
function getCallbackResponse(message: string, isError: boolean, sessionKey: string) {
  const color = isError ? '#e53e3e' : '#38a169';
  const title = isError ? '认证失败' : '认证成功';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
          padding: 20px;
          text-align: center;
          background-color: #f7fafc;
        }
        .card {
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          padding: 32px;
          max-width: 400px;
          width: 100%;
        }
        h1 {
          color: ${color};
          font-size: 24px;
          margin-bottom: 16px;
        }
        p {
          color: #4a5568;
          line-height: 1.5;
          margin-bottom: 24px;
        }
        .btn {
          background-color: #4a5568;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 8px 16px;
          font-size: 14px;
          cursor: pointer;
        }
        .icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">${isError ? '❌' : '✅'}</div>
        <h1>${title}</h1>
        <p>${message}</p>
        <button class="btn" onclick="closeWindow()">关闭窗口</button>
        ${isError ? `<p class="text-sm mt-4">如果问题持续存在，<a href="/api/auth/signin/google" style="color: blue;">请尝试备用登录方式</a></p>` : ''}
      </div>
      <script>
        function notifyParent() {
          try {
            if (window.opener) {
              console.log('正在通知父窗口认证结果...');
              
              // 先同步认证状态
              window.opener.postMessage(
                { 
                  type: 'GOOGLE_AUTH_RESULT', 
                  success: ${!isError}, 
                  message: '${message}',
                  redirectTo: '/protected'
                }, 
                '*'
              );
              
              // 等待一段时间后再进行重定向
              setTimeout(() => {
                try {
                  // 设置认证标记
                  window.opener.localStorage.setItem('auth_valid', 'true');
                  window.opener.localStorage.setItem('auth_time', Date.now().toString());
                  window.opener.localStorage.setItem('wasAuthenticated', 'true');
                  window.opener.localStorage.setItem('redirect_after_login', '/protected');
                  
                  // 清除登出标记
                  window.opener.localStorage.removeItem('force_logged_out');
                  window.opener.localStorage.removeItem('isLoggedOut');
                  window.opener.sessionStorage.removeItem('isLoggedOut');
                  window.opener.sessionStorage.setItem('activeAuth', 'true');
                  
                  // 设置cookie标记
                  window.opener.document.cookie = 'user_authenticated=true; path=/; max-age=86400; SameSite=Lax';
                  window.opener.document.cookie = 'auth_synced=true; path=/; max-age=86400; SameSite=Lax';
                  
                  // 通知刷新会话
                  window.opener.postMessage({ 
                    type: 'REFRESH_SUPABASE_SESSION',
                    timestamp: Date.now()
                  }, '*');
                  
                  // 最后进行重定向
                  setTimeout(() => {
                    const redirectUrl = '/protected?auth_flag=true&auth_ts=' + Date.now();
                    window.opener.location.href = redirectUrl;
                  }, 1000);
                } catch (e) {
                  console.error('设置认证状态失败:', e);
                }
              }, 2000);
            }
          } catch (e) {
            console.error('通知父窗口失败:', e);
          }
        }
        
        function closeWindow() {
          window.close();
        }
        
        notifyParent();
        
        setTimeout(() => {
          closeWindow();
        }, 8000);
      </script>
    </body>
    </html>
  `;
  
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
} 