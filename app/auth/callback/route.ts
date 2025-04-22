import { getSupabase } from '@/lib/supabaseClient';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// 为客户端代码添加客户端检查脚本
const clientScript = `
<script>
(function() {
  console.log('[AuthCallback] 客户端脚本执行');
  
  // 尝试从会话存储中获取 code_verifier
  let codeVerifier = '';
  try {
    if (typeof sessionStorage !== 'undefined') {
      codeVerifier = sessionStorage.getItem('sb_temp_code_verifier') || '';
      console.log('[AuthCallback] 从 sessionStorage 获取到 code_verifier:', !!codeVerifier);
    }
    
    if (!codeVerifier && typeof localStorage !== 'undefined') {
      codeVerifier = localStorage.getItem('supabase.auth.code_verifier') || '';
      console.log('[AuthCallback] 从 localStorage 获取到 code_verifier:', !!codeVerifier);
    }
  } catch (error) {
    console.error('[AuthCallback] 获取 code_verifier 失败:', error);
  }
  
  // 如果有 code_verifier，添加到 URL 并重定向
  if (codeVerifier) {
    console.log('[AuthCallback] 找到 code_verifier，重定向到带有 code_verifier 的 URL');
    
    // 获取当前 URL 参数
    const url = new URL(window.location.href);
    // 获取 code 参数
    const code = url.searchParams.get('code');
    
    if (code) {
      // 创建新 URL，添加 code_verifier 参数
      const fixedUrl = new URL('/auth/callback-with-verifier', window.location.origin);
      fixedUrl.searchParams.set('code', code);
      fixedUrl.searchParams.set('code_verifier', codeVerifier);
      
      // 添加其他可能的参数
      for (const [key, value] of url.searchParams.entries()) {
        if (key !== 'code') {
          fixedUrl.searchParams.set(key, value);
        }
      }
      
      // 重定向到新 URL
      console.log('[AuthCallback] 重定向到:', fixedUrl.toString());
      window.location.replace(fixedUrl.toString());
    }
  } else {
    console.log('[AuthCallback] 未找到 code_verifier，继续使用标准流程');
  }
})();
</script>
`;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const codeVerifier = requestUrl.searchParams.get('code_verifier');
  const state = requestUrl.searchParams.get('state');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');
  const source = requestUrl.searchParams.get('source'); // 跟踪请求来源
  
  console.log(`[AuthCallback] 处理 OAuth 回调，参数: { code: ${Boolean(code)}, state: ${Boolean(state)}, code_verifier: ${Boolean(codeVerifier)}, error: ${Boolean(error)}, source: ${source || 'unknown'} }`);
  
  // 检查是否有错误参数
  if (error) {
    console.error(`[AuthCallback] OAuth 错误: ${error}, 描述: ${errorDescription}`);
    return createErrorResponse('/sign-in', requestUrl.origin, `授权错误: ${errorDescription || error}`);
  }
  
  // 检查是否有 code 参数
  if (!code) {
    console.error('[AuthCallback] 缺少 code 参数，无法处理登录');
    return createErrorResponse('/sign-in', requestUrl.origin, '登录过程中断，请重试');
  }
  
  // 如果没有 code_verifier 参数，返回一个带有客户端脚本的 HTML 页面
  // 客户端脚本将尝试从 sessionStorage 获取 code_verifier，然后重定向
  if (!codeVerifier) {
    console.log('[AuthCallback] 缺少 code_verifier 参数，注入客户端脚本');
    
    // 构建 HTML 页面
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>登录处理中...</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background-color: #f9fafb;
              color: #1f2937;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              padding: 20px;
              text-align: center;
            }
            .loader {
              border: 4px solid rgba(0, 0, 0, 0.1);
              border-radius: 50%;
              border-top: 4px solid #3b82f6;
              width: 40px;
              height: 40px;
              animation: spin 1s linear infinite;
              margin-bottom: 20px;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            .message {
              margin-bottom: 20px;
              font-size: 18px;
            }
            .sub-message {
              color: #6b7280;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="loader"></div>
          <p class="message">登录处理中...</p>
          <p class="sub-message">正在验证您的账户，请稍候...</p>
          ${clientScript}
        </body>
      </html>
    `;
    
    // 返回 HTML 响应
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  }
  
  try {
    // 获取可能存在的 code_verifier（从请求的 cookie 中）
    const cookieStore = cookies();
    const pkceCodeVerifier = cookieStore.get('supabase.auth.code_verifier')?.value;
    
    // 使用传入的 code_verifier 或从 cookie 获取的
    const finalCodeVerifier = codeVerifier || pkceCodeVerifier;
    
    // 获取 Supabase 客户端
    console.log('[AuthCallback] 获取 Supabase 客户端');
    const supabase = getSupabase();
    
    // 添加调试日志
    console.log(`[AuthCallback] PKCE 状态: code_verifier 在参数中${codeVerifier ? '存在' : '不存在'}, 在 cookie 中${pkceCodeVerifier ? '存在' : '不存在'}`);
    
    // 尝试交换 code 获取会话
    console.log('[AuthCallback] 开始交换 code 获取会话');
    
    let result;
    
    // 尝试使用 code 和 code_verifier 交换会话
    if (finalCodeVerifier) {
      console.log('[AuthCallback] 使用提供的 code_verifier 交换会话');
      
      try {
        // 直接使用 URL 集成将 code 和 code_verifier 提交给 Supabase
        const exchangeUrl = new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=pkce`);
        exchangeUrl.searchParams.set('code', code);
        exchangeUrl.searchParams.set('code_verifier', finalCodeVerifier);
        
        const exchangeResponse = await fetch(exchangeUrl.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apiKey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
          },
        });
        
        if (!exchangeResponse.ok) {
          const errorData = await exchangeResponse.json();
          console.error('[AuthCallback] 手动交换会话失败:', errorData);
          throw new Error(errorData.error_description || errorData.error || '交换会话失败');
        }
        
        // 如果交换成功，使用普通方法完成会话交换
        result = await supabase.auth.exchangeCodeForSession(code);
      } catch (exchangeError) {
        console.error('[AuthCallback] 手动交换会话出错:', exchangeError);
        // 如果手动交换失败，尝试正常交换
        result = await supabase.auth.exchangeCodeForSession(code);
      }
    } else {
      // 使用标准流程交换
      result = await supabase.auth.exchangeCodeForSession(code);
    }
    
    // 如果失败且错误是关于 code_verifier，尝试使用替代方法
    if (result.error && result.error.message.includes('code verifier')) {
      console.log('[AuthCallback] 标准交换失败，尝试替代方法');
      
      try {
        const { error: signInError } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            skipBrowserRedirect: true,
            redirectTo: `${requestUrl.origin}/auth/callback`
          }
        });
        
        if (!signInError) {
          // 如果初步 OAuth 流程成功，尝试再次交换
          result = await supabase.auth.exchangeCodeForSession(code);
        }
      } catch (oauthError) {
        console.error('[AuthCallback] 尝试替代登录方法失败:', oauthError);
      }
    }
    
    // 处理交换错误
    if (result.error) {
      console.error('[AuthCallback] 交换会话失败:', result.error.message);
      // 对于 PKCE 相关错误，使用更友好的错误信息
      let errorMessage = result.error.message;
      if (errorMessage.includes('code verifier')) {
        errorMessage = '登录验证失败：请清除浏览器缓存并重试，或尝试使用邮箱密码登录';
      }
      return createErrorResponse('/sign-in', requestUrl.origin, `登录失败: ${errorMessage}`);
    }
    
    // 确认数据存在
    if (!result.data || !result.data.session) {
      console.error('[AuthCallback] 交换成功但没有返回会话数据');
      return createErrorResponse('/sign-in', requestUrl.origin, '会话创建失败，请重试');
    }
    
    // 再次检查会话状态
    console.log('[AuthCallback] 交换成功，检查会话状态');
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    // 处理会话检查错误
    if (sessionError) {
      console.error('[AuthCallback] 检查会话状态失败:', sessionError.message);
      return createErrorResponse('/sign-in', requestUrl.origin, '无法验证会话状态');
    }
    
    // 验证会话有效性
    if (!sessionData?.session) {
      console.error('[AuthCallback] 获取到的会话无效');
      
      // 等待一段时间后再次检查，防止会话数据延迟可用
      await new Promise(resolve => setTimeout(resolve, 1000));
      const { data: retryData } = await supabase.auth.getSession();
      
      if (!retryData?.session) {
        console.error('[AuthCallback] 重试后会话仍然无效');
        return createErrorResponse('/sign-in', requestUrl.origin, '会话验证失败，请重试');
      }
      
      console.log('[AuthCallback] 重试后获取到有效会话');
    }
    
    // 成功登录，重定向到受保护页面
    console.log('[AuthCallback] 会话验证通过，重定向到受保护页面');
    const redirectUrl = new URL('/protected', requestUrl.origin);
    redirectUrl.searchParams.set('login_success', 'true');
    redirectUrl.searchParams.set('auth_session', Date.now().toString());
    
    return NextResponse.redirect(redirectUrl);
    
  } catch (error) {
    // 捕获并记录所有未处理的错误
    console.error('[AuthCallback] 处理过程中发生未预期的错误:', error);
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    return createErrorResponse('/sign-in', requestUrl.origin, `登录处理失败: ${errorMessage}`);
  }
}

// 创建错误响应
function createErrorResponse(path: string, origin: string, errorMessage: string = '授权错误'): NextResponse {
  const redirectUrl = new URL(path, origin);
  redirectUrl.searchParams.set('error', encodeURIComponent(errorMessage));
  // 添加 skip_middleware 参数避免中间件重定向循环
  redirectUrl.searchParams.set('skip_middleware', 'true');
  // 添加时间戳防止浏览器缓存
  redirectUrl.searchParams.set('ts', Date.now().toString());
  
  console.log(`[AuthCallback] 重定向到错误页面: ${redirectUrl.toString()}`);
  return NextResponse.redirect(redirectUrl);
}
