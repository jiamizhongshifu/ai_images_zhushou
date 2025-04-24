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
  },
  SECURE_NAMES: ['sb-access-token', 'sb-refresh-token', 'sb-session-confirmed']
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
      if (!name || typeof name !== 'string') {
        throw new Error('无效的Cookie名称');
      }
      
      const store = await cookieStore;
      const value = store.get(name)?.value;
      
      // 对安全相关的Cookie进行额外验证
      if (COOKIE_CONFIG.SECURE_NAMES.includes(name) && value) {
        if (value.length < 10) { // 简单的安全检查
          logger.warn(`可疑的安全Cookie值: ${name}`);
          return undefined;
        }
      }
      
      return value;
    } catch (error) {
      logger.error(`获取Cookie失败: ${name}`, error as Error);
      return undefined;
    }
  },
  
  set: async (cookieStore: Promise<ReadonlyRequestCookies>, name: string, value: string, options?: Partial<CookieOptions>) => {
    try {
      if (!name || !value) {
        throw new Error('Cookie名称和值不能为空');
      }

      // 对安全Cookie强制使用安全选项
      const finalOptions = {
        ...COOKIE_CONFIG.DEFAULT_OPTIONS,
        ...options
      };
      
      if (COOKIE_CONFIG.SECURE_NAMES.includes(name)) {
        finalOptions.secure = true;
        finalOptions.httpOnly = true;
        finalOptions.sameSite = 'lax';
      }

      const store = await cookieStore;
      store.set({
        name,
        value,
        ...finalOptions
      });
      
      logger.debug(`Cookie设置成功: ${name}`);
    } catch (error) {
      logger.error(`设置Cookie失败: ${name}`, error as Error);
      throw new AuthError(
        'Cookie设置失败',
        'COOKIE_SET_ERROR',
        500
      );
    }
  },
  
  remove: async (cookieStore: Promise<ReadonlyRequestCookies>, name: string) => {
    try {
      if (!name) {
        throw new Error('Cookie名称不能为空');
      }

      const store = await cookieStore;
      store.set({
        name,
        value: '',
        ...COOKIE_CONFIG.DEFAULT_OPTIONS,
        maxAge: 0
      });
      
      logger.debug(`Cookie删除成功: ${name}`);
    } catch (error) {
      logger.error(`删除Cookie失败: ${name}`, error as Error);
      // 删除失败不抛出错误,但会记录日志
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
  const MAX_RETRIES = 2;
  let retryCount = 0;

  const refreshSession = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      return session;
    } catch (error) {
      logger.error('刷新会话失败', error as Error);
      throw new AuthError(
        '会话刷新失败',
        'SESSION_REFRESH_ERROR'
      );
    }
  };

  const getUser = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!user) {
        throw new AuthError(
          '用户未登录',
          'USER_NOT_FOUND'
        );
      }
      return user;
    } catch (error) {
      logger.error('获取用户信息失败', error as Error);
      throw new AuthError(
        '获取用户信息失败',
        'USER_FETCH_ERROR'
      );
    }
  };

  while (retryCount <= MAX_RETRIES) {
    try {
      // 1. 先检查当前会话
      const { data: { session } } = await supabase.auth.getSession();
      
      // 2. 如果没有会话,尝试刷新
      if (!session) {
        logger.debug('未找到有效会话,尝试刷新');
        const refreshedSession = await refreshSession();
        if (!refreshedSession) {
          throw new AuthError(
            '认证已过期',
            'TOKEN_EXPIRED'
          );
        }
      }

      // 3. 获取用户信息
      const user = await getUser();
      logger.debug('成功获取用户信息', { userId: user.id });
      return user;

    } catch (error) {
      retryCount++;
      
      if (error instanceof AuthError) {
        // 如果是认证错误直接抛出
        if (error.code === 'TOKEN_EXPIRED') {
          throw error;
        }
        // 其他认证错误重试
        if (retryCount <= MAX_RETRIES) {
          logger.warn(`认证重试 ${retryCount}/${MAX_RETRIES}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          continue;
        }
      }
      
      // 重试次数用完或其他错误
      throw error;
    }
  }

  // 重试次数用完
  throw new AuthError(
    '认证重试次数已用完',
    'MAX_RETRIES_EXCEEDED'
  );
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