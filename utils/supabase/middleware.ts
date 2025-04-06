import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// 设置日志级别常量
const LOG_LEVELS = {
  ERROR: 0,    // 只显示错误
  WARN: 1,     // 显示警告和错误
  INFO: 2,     // 显示信息、警告和错误
  DEBUG: 3     // 显示所有日志
};

// 获取环境变量中的日志级别，默认为INFO
const currentLogLevel = (() => {
  const level = process.env.LOG_LEVEL || 'INFO';
  switch (level.toUpperCase()) {
    case 'ERROR': return LOG_LEVELS.ERROR;
    case 'WARN': return LOG_LEVELS.WARN;
    case 'INFO': return LOG_LEVELS.INFO;
    case 'DEBUG': return LOG_LEVELS.DEBUG;
    default: return LOG_LEVELS.INFO;
  }
})();

// 日志工具函数
const logger = {
  error: (message: string) => {
    console.error(`[中间件错误] ${message}`);
  },
  warn: (message: string) => {
    if (currentLogLevel >= LOG_LEVELS.WARN) {
      console.warn(`[中间件警告] ${message}`);
    }
  },
  info: (message: string) => {
    if (currentLogLevel >= LOG_LEVELS.INFO) {
      console.log(`[中间件] ${message}`);
    }
  },
  debug: (message: string) => {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
      console.log(`[中间件调试] ${message}`);
    }
  }
};

// 保存最近的重定向记录，防止重定向循环
let lastRedirectInfo: { url: string; timestamp: number } | null = null;
const REDIRECT_TIMEOUT = 2000; // 2秒内不重复相同重定向

export const updateSession = async (request: NextRequest) => {
  try {
    // 添加调试信息
    logger.debug(`处理请求路径: ${request.nextUrl.pathname}, 方法: ${request.method}`);
    
    // 创建未修改的响应
    let response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    // 检查是否为POST登录请求，如果是，不在中间件中干预
    if (request.nextUrl.pathname === '/sign-in' && request.method === 'POST') {
      logger.debug('检测到登录POST请求，跳过中间件重定向检查');
      return response;
    }
    
    // 处理重定向循环检测
    const currentUrl = request.nextUrl.pathname;
    const currentTime = Date.now();
    
    // 如果最近有重定向到同一URL，且时间间隔很短，可能是循环
    if (
      lastRedirectInfo && 
      lastRedirectInfo.url === currentUrl && 
      currentTime - lastRedirectInfo.timestamp < REDIRECT_TIMEOUT
    ) {
      logger.warn(`检测到可能的重定向循环到 ${currentUrl}，暂停重定向`);
      // 重置重定向记录
      lastRedirectInfo = null;
      // 放行请求，不再进行重定向
      return response;
    }
    
    // 从环境变量中读取URL和ANON KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // 验证环境变量存在
    if (!supabaseUrl || !supabaseAnonKey) {
      logger.error("缺少必要的Supabase环境变量");
      return response;
    }
    
    // 优先检查强制登录参数，这会覆盖任何状态
    const forceLogin = request.nextUrl.searchParams.get('force_login');
    if (forceLogin === 'true') {
      logger.info('检测到强制登录参数，删除登出标记并允许访问');
      
      // 删除登出标记cookie
      response.cookies.delete('logged_out');
      
      // 设置强制登录cookie
      response.cookies.set('force_login', 'true', {
        path: '/',
        maxAge: 60 * 30, // 30分钟有效
        httpOnly: true,
        sameSite: 'lax'
      });
      
      // 检查是否有clean_url参数，用于清理URL
      const cleanUrl = new URL(request.url);
      cleanUrl.searchParams.delete('force_login');
      
      // 如果是受保护页面，直接允许访问
      if (request.nextUrl.pathname.startsWith('/protected')) {
        logger.info('强制登录参数生效，允许访问受保护页面');
        return response;
      }
      
      return NextResponse.redirect(cleanUrl);
    }
    
    // 检查是否有强制登录cookie，这会覆盖任何登出状态
    const forceLoginCookie = request.cookies.get('force_login');
    if (forceLoginCookie && forceLoginCookie.value === 'true') {
      logger.info('检测到强制登录cookie，忽略登出状态');
      
      // 如果访问受保护页面，允许访问
      if (request.nextUrl.pathname.startsWith("/protected")) {
        return response;
      }
    }
    
    // 检查是否有强制登出参数，如有则直接处理为未登录状态
    const forceLogout = request.nextUrl.searchParams.get('force_logout');
    
    // 检查是否需要清除登出标记
    const clearLogoutFlags = request.nextUrl.searchParams.get('clear_logout_flags');
    if (clearLogoutFlags === 'true') {
      logger.info('检测到清除登出标记请求，删除登出cookie');
      
      // 删除登出标记cookie - 仅使用默认参数
      response.cookies.delete('logged_out');
      
      // 确保设置cookie为过期 - 这种方式实际上也是删除cookie
      response.cookies.set('logged_out', '', {
        path: '/',
        expires: new Date(0),
        maxAge: 0
      });
      
      // 设置一个明确的登录标记
      response.cookies.set('force_login', 'true', {
        path: '/',
        maxAge: 60 * 5, // 5分钟有效
        httpOnly: true,
        sameSite: 'lax'
      });
      
      // 从localStorage中清除登出标记的脚本
      const clearScript = `
        <script>
          try {
            console.log('[清除标记] 正在清除登出标记');
            localStorage.removeItem('force_logged_out');
            sessionStorage.removeItem('isLoggedOut');
            
            // 使用cookie覆盖方式确保删除
            document.cookie = 'logged_out=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
            
            // 使用绝对路径也清除一遍
            const domainRoot = window.location.hostname.split('.').slice(-2).join('.');
            document.cookie = 'logged_out=; path=/; domain=.' + domainRoot + '; expires=Thu, 01 Jan 1970 00:00:00 GMT';
            
            console.log('[清除标记] 登出标记已清除');
            
            // 清除URL中的参数
            const url = new URL(window.location.href);
            url.searchParams.delete('clear_logout_flags');
            window.history.replaceState({}, document.title, url.toString());
          } catch(e) {
            console.error('[清除标记] 清除登出标记时出错:', e);
          }
        </script>
      `;
      
      // 获取刷新后的URL（没有clear_logout_flags参数）
      const cleanUrl = new URL(request.url);
      cleanUrl.searchParams.delete('clear_logout_flags');
      
      // 如果请求是来自登录表单的重定向到保护页面，我们需要确保成功访问
      if (cleanUrl.pathname.startsWith('/protected')) {
        logger.info('用户刚刚登录，允许访问受保护页面');
        
        // 让响应通过，并带上清除登出标记的脚本
        return new NextResponse(
          `<!DOCTYPE html><html><head><meta charset="utf-8"/>
          <title>正在进入保护页面</title>
          <style>
            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f9fafb; margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
            .container { text-align: center; padding: 2rem; background: white; border-radius: 0.5rem; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); max-width: 90%; width: 30rem; }
            h1 { color: #111827; font-size: 1.5rem; margin-bottom: 1rem; }
            p { color: #6b7280; margin-bottom: 2rem; }
            .loading { display: inline-block; width: 2rem; height: 2rem; border: 3px solid rgba(59, 130, 246, 0.2); border-radius: 50%; border-top-color: #3b82f6; animation: spin 1s ease-in-out infinite; margin-bottom: 1rem; }
            @keyframes spin { to { transform: rotate(360deg); } }
            a { color: #3b82f6; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
          </head>
          <body>
            <div class="container">
              <div class="loading"></div>
              <h1>正在进入保护页面</h1>
              <p>请稍候，系统正在处理您的登录信息...</p>
              <p style="font-size: 0.875rem; color: #9ca3af;">
                如果页面没有自动跳转，请<a href="${cleanUrl.toString()}">点击这里</a>
              </p>
            </div>
            ${clearScript}
            <script>
              // 确保在清除登出标记后再跳转到保护页
              setTimeout(function() {
                console.log('开始重定向到保护页面...');
                window.location.href = "${cleanUrl.toString()}";
              }, 1000); // 等待1秒确保用户体验更流畅
            </script>
          </body></html>`, 
          {
            status: 200,
            headers: {
              'Content-Type': 'text/html',
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            },
          }
        );
      }

      // 不是保护页面的情况，直接重定向到清理后的URL
      return NextResponse.redirect(cleanUrl);
    }
    
    // 如果有force_logout参数，设置一个cookie标记用户已登出
    if (forceLogout === 'true') {
      logger.info('检测到强制登出参数，跳过认证检查，视为未登录');
      
      // 设置一个登出标记cookie
      response.cookies.set('logged_out', 'true', {
        path: '/',
        maxAge: 60 * 60, // 1小时有效
        httpOnly: true,
        sameSite: 'lax'
      });
      
      // 尝试清除认证相关Cookie
      ['sb-access-token', 'sb-refresh-token', '__session', 'sb-refresh-token-nonce'].forEach(name => {
        response.cookies.delete(name);
      });
      
      // 对于登录页和首页，允许直接访问
      if (request.nextUrl.pathname === '/sign-in' || 
          request.nextUrl.pathname === '/') {
        return response;
      }
      
      // 对于受保护页面，重定向到登录页
      if (request.nextUrl.pathname.startsWith("/protected")) {
        lastRedirectInfo = { url: '/sign-in', timestamp: currentTime };
        logger.info('检测到强制登出且尝试访问受保护页面，重定向到登录页');
        return NextResponse.redirect(new URL("/sign-in", request.url));
      }
      
      return response;
    }
    
    // 检查是否存在登出标记cookie
    const loggedOutCookie = request.cookies.get('logged_out');
    if (loggedOutCookie && loggedOutCookie.value === 'true') {
      logger.info('检测到登出标记cookie，跳过认证检查，视为未登录');
      
      // 如果是访问登录页，直接放行
      if (request.nextUrl.pathname === '/sign-in') {
        return response;
      }
      
      // 如果是访问受保护页面，重定向到登录页
      if (request.nextUrl.pathname.startsWith("/protected")) {
        lastRedirectInfo = { url: '/sign-in', timestamp: currentTime };
        logger.info('检测到登出标记且尝试访问受保护页面，重定向到登录页');
        return NextResponse.redirect(new URL("/sign-in", request.url));
      }
    }

    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          get(name) {
            return request.cookies.get(name)?.value;
          },
          set(name, value, options) {
            // 设置request cookie (用于当前请求)
            request.cookies.set({
              name,
              value,
              ...options,
            });
            
            // 设置response cookie (用于下一个请求)
            const finalOptions = {
              ...options,
              // 确保cookie在整个域名下可用
              path: options?.path || "/",
              // 增加cookie持久性，默认为7天
              maxAge: options?.maxAge || 60 * 60 * 24 * 7,
              // 确保安全设置
              secure: process.env.NODE_ENV === "production",
              httpOnly: true,
              sameSite: "lax" as const
            };
            
            response.cookies.set(name, value, finalOptions);
          },
          remove(name, options) {
            request.cookies.delete({
              name,
              ...options,
            });
            response.cookies.delete(name);
          },
        },
      },
    );

    // 刷新session如果过期 - 对Server Components是必需的
    // https://supabase.com/docs/guides/auth/server-side/nextjs
    await supabase.auth.getUser();

    // 保护路由
    const {
      data: { user },
    } = await supabase.auth.getUser();

    logger.info(`路径: ${request.nextUrl.pathname}, 用户状态: ${user ? '已登录' : '未登录'}`);
    
    // 检查是否已有强制登录标记 - 这会覆盖登出标记
    // 注意：在上面已经检查过这个标记，这里是为了向后兼容
    if (forceLoginCookie && forceLoginCookie.value === 'true') {
      logger.info('检测到强制登录标记，忽略登出状态');
      
      // 如果访问受保护页面，允许访问
      if (request.nextUrl.pathname.startsWith("/protected")) {
        return response;
      }
    }
    
    // 如果检测到登出标记cookie但API仍然返回用户已登录，可能是cookie未正确清除
    // 此时我们应该信任登出标记，而不是API返回的用户状态
    if (loggedOutCookie && loggedOutCookie.value === 'true' && user) {
      logger.warn('API返回用户已登录，但存在登出标记cookie，按未登录处理');
      
      // 强制清除所有认证cookie
      ['sb-access-token', 'sb-refresh-token', '__session', 'sb-refresh-token-nonce'].forEach(name => {
        response.cookies.delete(name);
      });
      
      // 如果是访问登录页，正常放行
      if (request.nextUrl.pathname === '/sign-in') {
        return response;
      }
      
      // 如果是访问受保护页面，重定向到登录页
      if (request.nextUrl.pathname.startsWith("/protected")) {
        return NextResponse.redirect(new URL("/sign-in", request.url));
      }
      
      return response;
    }
    
    // 特殊处理：如果请求来自登录表单提交后的重定向，给予一定宽容度
    // 通过检查Referer头来判断
    const referer = request.headers.get('referer') || '';
    const isComingFromSignIn = referer.includes('/sign-in') && request.nextUrl.pathname.startsWith('/protected');
    
    // 如果用户在登录页但已经登录了，自动重定向到受保护页面
    if (request.nextUrl.pathname === "/sign-in" && user) {
      // 检查是否存在登出标记cookie，如果存在则优先信任登出标记
      if (loggedOutCookie && loggedOutCookie.value === 'true') {
        logger.info('虽然API返回用户已登录，但检测到登出标记，允许访问登录页');
        return response;
      }
      
      // 记录本次重定向
      lastRedirectInfo = { url: '/protected', timestamp: currentTime };
      logger.info('用户已登录但在登录页面，重定向到受保护页面');
      return NextResponse.redirect(new URL("/protected", request.url));
    }
    
    // 对受保护的路由进行验证，但给予登录后的请求一定宽容度
    if (request.nextUrl.pathname.startsWith("/protected") && !user) {
      // 检查是否有直接导航标记，如果有则尊重用户的导航意图
      const isDirectNav = request.nextUrl.searchParams.get('nav_direct') === 'true';
      if (isDirectNav) {
        // 清除导航标记，避免保留在URL中
        const cleanUrl = new URL(request.url);
        cleanUrl.searchParams.delete('nav_direct');
        
        logger.info('检测到直接导航参数，重定向到登录页并记住要返回的页面');
        
        // 将目标地址作为redirect参数传递给登录页
        const loginUrl = new URL('/sign-in', request.url);
        loginUrl.searchParams.set('redirect', cleanUrl.pathname);
        
        return NextResponse.redirect(loginUrl);
      }

      if (isComingFromSignIn) {
        logger.debug('检测到登录后的首次访问protected路径，尝试宽容处理');
        
        // 检查是否有Supabase的访问令牌cookie
        const hasAuthCookie = request.cookies.has('sb-access-token') || 
                              request.cookies.has('sb-refresh-token');
        
        if (hasAuthCookie) {
          logger.debug('检测到认证cookie存在，允许访问');
          return response;
        }
      }
      
      // 记录本次重定向
      lastRedirectInfo = { url: '/sign-in', timestamp: currentTime };
      logger.info('未授权访问，重定向到登录页');
      
      // 添加redirect参数，使登录后可以返回原页面
      const loginUrl = new URL("/sign-in", request.url);
      loginUrl.searchParams.set('redirect', request.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }

    // 如果用户已登录且访问根路径，重定向到受保护页面
    if (request.nextUrl.pathname === "/" && user) {
      // 检查是否存在登出标记cookie，如果存在则优先信任登出标记
      if (loggedOutCookie && loggedOutCookie.value === 'true') {
        logger.info('虽然API返回用户已登录，但检测到登出标记，允许访问首页');
        return response;
      }
      
      // 注释掉原有的重定向逻辑，允许用户访问首页
      // lastRedirectInfo = { url: '/protected', timestamp: currentTime };
      // return NextResponse.redirect(new URL("/protected", request.url));
      
      // 直接返回响应，允许访问首页
      logger.info('用户已登录且访问首页，允许直接访问');
      return response;
    }

    return response;
  } catch (e) {
    logger.error(`Supabase客户端创建失败: ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }
};
