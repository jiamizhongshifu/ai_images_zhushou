// 添加全局类型声明
declare global {
  var __GOOGLE_AUTH_SESSIONS: Map<string, any>;
}

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { nanoid } from 'nanoid';

// Google OAuth配置
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const IS_DEV = process.env.NODE_ENV === 'development';
const NEXT_PUBLIC_URL = process.env.NEXT_PUBLIC_URL || process.env.VERCEL_URL || 'http://localhost:3000';

// 使用已在Google控制台注册的重定向URI
const REDIRECT_URI = IS_DEV 
  ? `http://localhost:3000/api/auth/google/callback` 
  : `https://imgtutu.ai/api/auth/google/callback`;

// 存储待处理的认证状态
const pendingAuths = new Map();

// 确保全局认证会话存储存在
if (typeof global !== 'undefined' && !global.__GOOGLE_AUTH_SESSIONS) {
  global.__GOOGLE_AUTH_SESSIONS = new Map();
  console.log('[GoogleAuth] 初始化全局会话存储');
}

/**
 * 获取认证状态（内部函数）
 */
function getAuthState(sessionKey: string) {
  return pendingAuths.get(sessionKey);
}

/**
 * 更新认证状态（内部函数）
 */
function updateAuthState(sessionKey: string, update: any) {
  const current = pendingAuths.get(sessionKey) || {};
  pendingAuths.set(sessionKey, { ...current, ...update });
  return pendingAuths.get(sessionKey);
}

/**
 * 初始化Google OAuth认证流程
 * 生成认证URL并设置会话状态
 */
export async function POST(request: NextRequest) {
  try {
    // 如果未配置Google OAuth，返回错误
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error('[GoogleAuth] 缺少Google OAuth配置，尝试使用NextAuth');
      return NextResponse.redirect(new URL('/api/auth/signin/google', request.url));
    }
    
    // 解析请求体
    const body = await request.json();
    const timestamp = body.timestamp || Date.now();
    const isRestricted = body.isRestricted === true;
    const fallbackUrl = body.fallbackUrl || '/';
    
    // 生成唯一会话密钥和状态参数，防止CSRF攻击
    const sessionKey = body.sessionKey || nanoid(10);
    const state = nanoid(20);
    
    // 存储会话状态
    const authState = {
      timestamp,
      state,
      sessionKey,
      status: 'pending'
    };
    
    pendingAuths.set(sessionKey, authState);
    
    // 如果是受限环境或明确要求，存储到全局会话状态
    if (isRestricted || body.forceGlobalStorage) {
      try {
        // 添加到全局会话状态中，设置过期时间（30分钟）
        const expireDate = new Date();
        expireDate.setMinutes(expireDate.getMinutes() + 30);
        
        // 保存到全局变量中
        if (global.__GOOGLE_AUTH_SESSIONS) {
          global.__GOOGLE_AUTH_SESSIONS.set(sessionKey, {
            ...authState,
            createdAt: new Date().toISOString(),
            validUntil: expireDate.toISOString()
          });
          
          console.log('[GoogleAuth] 保存到全局会话状态:', sessionKey);
        }
      } catch (err) {
        console.error('[GoogleAuth] 保存到全局会话出错:', err);
      }
    }
    
    console.log('[GoogleAuth] 保存会话状态:', authState);
    console.log('[GoogleAuth] 当前会话状态数量:', pendingAuths.size, '全局会话状态数量:', global.__GOOGLE_AUTH_SESSIONS?.size || 0);
    
    // 构建授权URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.append('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'email profile openid');
    authUrl.searchParams.append('state', sessionKey);
    authUrl.searchParams.append('prompt', 'consent');
    
    // 附加重定向信息到state参数，允许认证后自动重定向
    if (body.fallbackUrl && typeof body.fallbackUrl === 'string') {
      try {
        // 尝试设置重定向URL
        pendingAuths.set(sessionKey, {
          ...authState,
          redirectUrl: body.fallbackUrl
        });
        
        console.log('[GoogleAuth] 设置认证后重定向URL:', body.fallbackUrl);
      } catch (err) {
        console.error('[GoogleAuth] 设置重定向URL出错:', err);
      }
    }
    
    console.log('[GoogleAuth] 初始化OAuth:', {
      sessionKey,
      state,
      redirectUri: REDIRECT_URI,
      isDev: IS_DEV,
      isRestricted
    });
    
    // 构建响应并设置cookie
    const response = NextResponse.json({
      url: authUrl.toString(),
      sessionKey,
      expiresIn: 30 * 60 * 1000 // 30分钟过期时间（毫秒）
    });
    
    // 设置cookie
    let cookieSet = false;
    try {
      // 使用await关键字处理异步cookies函数
      const cookieStore = await cookies();
      // 或者可以直接通过response.cookies设置
      response.cookies.set('google_auth_state', sessionKey, {
        httpOnly: true,
        secure: !IS_DEV,
        maxAge: 60 * 60 * 24, // 24小时
        path: '/'
      });
      cookieSet = true;
    } catch (e) {
      console.error('[GoogleAuth] 设置cookie失败:', e);
    }
    
    // 更新响应中的cookieSet状态
    response.cookies.set('debug', 'true', { maxAge: 10 });
    
    console.log('[GoogleAuth] Cookie设置状态:', cookieSet);
    
    return response;
  } catch (error) {
    console.error('[GoogleAuth] 初始化出错:', error);
    
    // 返回错误并重定向到NextAuth的Google登录
    return NextResponse.json(
      { error: '初始化Google登录失败，请重试' },
      { status: 500 }
    );
  }
}

/**
 * 获取认证状态
 */
export async function GET(request: NextRequest) {
  try {
    // 获取会话密钥
    const url = new URL(request.url);
    const sessionKey = url.searchParams.get('key');
    
    // 如果未提供会话密钥，返回错误
    if (!sessionKey) {
      return NextResponse.json({ error: '缺少会话密钥' }, { status: 400 });
    }
    
    // 获取认证状态
    const authState = pendingAuths.get(sessionKey);
    
    // 如果找不到认证状态，检查全局状态
    if (!authState) {
      // 从全局会话状态中获取
      const globalState = global.__GOOGLE_AUTH_SESSIONS?.get(sessionKey);
      
      if (globalState) {
        // 返回全局状态（但不导入到本地，由回调处理导入）
        return NextResponse.json({
          status: 'pending',
          restoredFromGlobal: true,
          message: '从全局会话状态恢复'
        });
      }
      
      return NextResponse.json({ error: '找不到认证会话' }, { status: 404 });
    }
    
    // 返回认证状态
    return NextResponse.json(authState);
  } catch (error) {
    console.error('[GoogleAuth] 获取状态出错:', error);
    return NextResponse.json({ error: '获取认证状态失败' }, { status: 500 });
  }
} 