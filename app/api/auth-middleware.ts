import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';

// Cookie 配置常量
const COOKIE_CONFIG = {
  ACCESS_TOKEN: 'sb-access-token',
  REFRESH_TOKEN: 'sb-refresh-token',
  SESSION_CONFIRMED: 'sb-session-confirmed',
  DEFAULT_OPTIONS: {
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7天
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const
  }
};

// 错误类型定义
class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// 日志级别和配置
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

const currentLogLevel = (() => {
  const level = (process.env.LOG_LEVEL || 'INFO').toUpperCase() as LogLevel;
  return LOG_LEVELS[level] ?? LOG_LEVELS.INFO;
})();

// 增强的日志工具
const logger = {
  error: (message: string, error?: Error) => {
    console.error(`[Auth错误] ${message}`, error?.stack || '');
  },
  warn: (message: string) => {
    if (currentLogLevel >= LOG_LEVELS.WARN) {
      console.warn(`[Auth警告] ${message}`);
    }
  },
  info: (message: string) => {
    if (currentLogLevel >= LOG_LEVELS.INFO) {
      console.info(`[Auth信息] ${message}`);
    }
  },
  debug: (message: string, data?: any) => {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
      console.debug(`[Auth调试] ${message}`, data || '');
    }
  }
};

// 统一的错误响应处理
const createErrorResponse = (error: AuthError | Error) => {
  const isAuthError = error instanceof AuthError;
  const statusCode = isAuthError ? error.statusCode : 500;
  const errorCode = isAuthError ? error.code : 'INTERNAL_ERROR';
  
  return Response.json({
    success: false,
    error: {
      message: error.message,
      code: errorCode
    }
  }, { status: statusCode });
};

// 增强的Cookie管理
const cookieManager = {
  get: async (cookieStore: Promise<ReadonlyRequestCookies>, name: string): Promise<string | undefined> => {
    try {
      const store = await cookieStore;
      return store.get(name)?.value;
    } catch (error) {
      logger.error(`获取Cookie失败: ${name}`, error as Error);
      return undefined;
    }
  },
  
  set: async (cookieStore: Promise<ReadonlyRequestCookies>, name: string, value: string, options?: Partial<CookieOptions>) => {
    try {
      const store = await cookieStore;
      store.set({
        name,
        value,
        ...COOKIE_CONFIG.DEFAULT_OPTIONS,
        ...options
      });
    } catch (error) {
      logger.error(`设置Cookie失败: ${name}`, error as Error);
    }
  },
  
  remove: async (cookieStore: Promise<ReadonlyRequestCookies>, name: string) => {
    try {
      const store = await cookieStore;
      store.set({
        name,
        value: '',
        ...COOKIE_CONFIG.DEFAULT_OPTIONS,
        maxAge: 0
      });
    } catch (error) {
      logger.error(`删除Cookie失败: ${name}`, error as Error);
    }
  }
};

/**
 * 创建安全的Supabase客户端
 */
export async function createSecureClient() {
  try {
    logger.debug('开始创建Supabase客户端');
    const cookieStore = cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: async (name) => await cookieManager.get(cookieStore, name),
          set: async (name, value, options) => await cookieManager.set(cookieStore, name, value, options),
          remove: async (name) => await cookieManager.remove(cookieStore, name)
        }
      }
    );

    logger.debug('Supabase客户端创建成功');
    return { supabase, cookieStore };
  } catch (error) {
    logger.error('创建Supabase客户端失败', error as Error);
    throw new AuthError(
      '认证服务初始化失败',
      'AUTH_INIT_ERROR',
      500
    );
  }
}

/**
 * 获取当前用户信息
 */
export async function getCurrentUser(supabase: SupabaseClient): Promise<User> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      throw new AuthError(
        '获取用户信息失败',
        'USER_FETCH_ERROR'
      );
    }
    
    if (!user) {
      throw new AuthError(
        '用户未登录',
        'USER_NOT_FOUND'
      );
    }
    
  return user;
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError(
      '获取用户信息时发生错误',
      'USER_FETCH_ERROR'
    );
  }
}

/**
 * API认证中间件
 */
export async function withApiAuth(
  req: Request, 
  handler: (user: User, supabase: SupabaseClient) => Promise<Response>
) {
  try {
    const { supabase } = await createSecureClient();
    const user = await getCurrentUser(supabase);
    
    logger.debug('用户认证成功', { userId: user.id });
    return await handler(user, supabase);
  } catch (error) {
    logger.error('API认证失败', error as Error);
    return createErrorResponse(error as Error);
  }
}

/**
 * 验证用户登录状态
 */
export async function validateLoggedIn(supabase: SupabaseClient): Promise<User> {
  try {
    return await getCurrentUser(supabase);
  } catch (error) {
    logger.error('验证用户登录状态失败', error as Error);
    throw error;
  }
}

// 导出错误处理工具
export const AuthErrors = {
  createErrorResponse,
  AuthError
}; 