import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/client';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * API身份验证类型
 */
export enum AuthType {
  USER = 'user',       // 普通用户认证
  ADMIN = 'admin',     // 管理员认证
  API_KEY = 'api_key', // API密钥认证
  NONE = 'none'        // 无需认证
}

/**
 * 认证结果类型
 */
type AuthResult = {
  authenticated: boolean;
  user?: any;
  response?: NextResponse;
  error?: string;
  admin?: boolean;
};

/**
 * API身份验证中间件
 * 
 * 支持四种认证模式:
 * - USER: 要求普通用户登录
 * - ADMIN: 要求管理员权限
 * - API_KEY: 使用API密钥验证
 * - NONE: 无需认证
 * 
 * @param request NextRequest请求对象
 * @param authType 认证类型
 * @param apiKeyName 环境变量中的API密钥名称，默认为API_KEY
 * @returns 认证结果对象
 */
export async function authenticate(
  request: NextRequest,
  authType: AuthType = AuthType.USER,
  apiKeyName?: string
): Promise<AuthResult> {
  // API密钥认证
  if (authType === AuthType.API_KEY) {
    const keyName = apiKeyName || 'API_KEY';
    const apiKey = request.headers.get('x-api-key');
    const validKey = process.env[keyName];
    
    if (!apiKey || apiKey !== validKey) {
      console.warn(`API密钥认证失败: 无效的API密钥 ${apiKey?.substring(0, 4)}...`);
      
      return { 
        authenticated: false,
        error: '未授权访问: 无效的API密钥',
        response: NextResponse.json(
          { success: false, error: '未授权访问' }, 
          { status: 401 }
        )
      };
    }
    
    console.log(`API密钥认证成功: ${keyName}`);
    return { authenticated: true };
  }
  
  // 无需认证
  if (authType === AuthType.NONE) {
    return { authenticated: true };
  }
  
  // 获取会话信息
  try {
    // 用户或管理员认证
    const supabase = createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('获取会话信息失败:', sessionError);
      return {
        authenticated: false,
        error: '获取会话信息失败',
        response: NextResponse.json(
          { success: false, error: '会话验证失败' },
          { status: 401 }
        )
      };
    }
    
    if (!session) {
      return { 
        authenticated: false,
        error: '未登录',
        response: NextResponse.json(
          { success: false, error: '未登录' }, 
          { status: 401 }
        )
      };
    }
    
    // 管理员认证需额外检查角色
    if (authType === AuthType.ADMIN) {
      // 使用admin客户端查询，避免权限问题
      const adminClient = await createAdminClient();
      const { data: profile, error: profileError } = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
        
      if (profileError) {
        console.error('获取用户角色失败:', profileError);
        return {
          authenticated: false,
          error: '获取用户角色失败',
          response: NextResponse.json(
            { success: false, error: '权限验证失败' },
            { status: 500 }
          )
        };
      }
      
      if (!profile || profile.role !== 'admin') {
        console.warn(`管理员权限验证失败: 用户 ${session.user.id} 不是管理员`);
        return { 
          authenticated: false, 
          error: '需要管理员权限',
          response: NextResponse.json(
            { success: false, error: '需要管理员权限' }, 
            { status: 403 }
          )
        };
      }
      
      console.log(`管理员认证成功: 用户 ${session.user.id}`);
      return { authenticated: true, user: session.user, admin: true };
    }
    
    // 普通用户认证
    console.log(`用户认证成功: ${session.user.id}`);
    return { authenticated: true, user: session.user };
  } catch (error) {
    console.error('认证过程发生未知错误:', error);
    return {
      authenticated: false,
      error: '认证过程发生错误',
      response: NextResponse.json(
        { success: false, error: '认证过程发生错误' },
        { status: 500 }
      )
    };
  }
}

/**
 * 中间件包装器，用于简化API路由中的认证逻辑
 * 
 * @param handler API处理函数
 * @param authType 认证类型
 * @param apiKeyName API密钥名称
 * @returns 包装后的处理函数
 */
export function withAuth(
  handler: (request: NextRequest, authResult: AuthResult) => Promise<NextResponse>,
  authType: AuthType = AuthType.USER,
  apiKeyName?: string
) {
  return async (request: NextRequest) => {
    const authResult = await authenticate(request, authType, apiKeyName);
    
    if (!authResult.authenticated) {
      return authResult.response;
    }
    
    return handler(request, authResult);
  };
}

/**
 * 从请求中获取用户IP地址
 * @param request NextRequest请求对象
 * @returns IP地址字符串
 */
export function getClientIP(request: NextRequest): string {
  return request.headers.get('x-forwarded-for') || 
         request.headers.get('x-real-ip') || 
         'unknown';
}

/**
 * 获取请求的相关信息，用于日志记录
 * @param request NextRequest请求对象
 * @returns 请求信息对象
 */
export function getRequestInfo(request: NextRequest) {
  return {
    method: request.method,
    url: request.url,
    ip: getClientIP(request),
    userAgent: request.headers.get('user-agent') || 'unknown',
    timestamp: new Date().toISOString()
  };
} 