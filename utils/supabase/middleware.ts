import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// 保存最近的重定向记录，防止重定向循环
let lastRedirectInfo: { url: string; timestamp: number } | null = null;
const REDIRECT_TIMEOUT = 2000; // 2秒内不重复相同重定向

export const updateSession = async (request: NextRequest) => {
  try {
    // 添加调试信息
    console.log(`[中间件] 处理请求路径: ${request.nextUrl.pathname}, 方法: ${request.method}`);
    
    // 检查是否为POST登录请求，如果是，不在中间件中干预
    if (request.nextUrl.pathname === '/sign-in' && request.method === 'POST') {
      console.log('[中间件] 检测到登录POST请求，跳过中间件重定向检查');
      return NextResponse.next({
        request: { headers: request.headers },
      });
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
      console.log(`[中间件] 检测到可能的重定向循环到 ${currentUrl}，暂停重定向`);
      // 重置重定向记录
      lastRedirectInfo = null;
      // 放行请求，不再进行重定向
      return NextResponse.next({
        request: { headers: request.headers },
      });
    }
    
    // 创建未修改的响应
    let response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    // 从环境变量中读取URL和ANON KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // 验证环境变量存在
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("缺少必要的Supabase环境变量");
      return response;
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

    console.log(`[中间件] 路径: ${request.nextUrl.pathname}, 用户状态: ${user ? '已登录' : '未登录'}`);
    
    // 特殊处理：如果请求来自登录表单提交后的重定向，给予一定宽容度
    // 通过检查Referer头来判断
    const referer = request.headers.get('referer') || '';
    const isComingFromSignIn = referer.includes('/sign-in') && request.nextUrl.pathname.startsWith('/protected');
    
    // 如果用户在登录页但已经登录了，自动重定向到受保护页面
    if (request.nextUrl.pathname === "/sign-in" && user) {
      // 记录本次重定向
      lastRedirectInfo = { url: '/protected', timestamp: currentTime };
      console.log('[中间件] 用户已登录但在登录页面，重定向到受保护页面');
      return NextResponse.redirect(new URL("/protected", request.url));
    }
    
    // 对受保护的路由进行验证，但给予登录后的请求一定宽容度
    if (request.nextUrl.pathname.startsWith("/protected") && !user) {
      if (isComingFromSignIn) {
        console.log('[中间件] 检测到登录后的首次访问protected路径，尝试宽容处理');
        
        // 检查是否有Supabase的访问令牌cookie
        const hasAuthCookie = request.cookies.has('sb-access-token') || 
                              request.cookies.has('sb-refresh-token');
        
        if (hasAuthCookie) {
          console.log('[中间件] 检测到认证cookie存在，允许访问');
          return response;
        }
      }
      
      // 记录本次重定向
      lastRedirectInfo = { url: '/sign-in', timestamp: currentTime };
      console.log('[中间件] 未授权访问，重定向到登录页');
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }

    // 如果用户已登录且访问根路径，重定向到受保护页面
    if (request.nextUrl.pathname === "/" && user) {
      // 记录本次重定向
      lastRedirectInfo = { url: '/protected', timestamp: currentTime };
      return NextResponse.redirect(new URL("/protected", request.url));
    }

    return response;
  } catch (e) {
    console.error("Supabase客户端创建失败:", e);
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }
};
