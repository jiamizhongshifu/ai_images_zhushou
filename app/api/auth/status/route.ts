import { createClient } from '@/utils/supabase/server';
import { NextRequest } from 'next/server';

/**
 * 检查用户认证状态的API端点
 * 返回:
 * - authenticated: 布尔值，表示用户是否已认证
 * - userId: 字符串，用户ID（如果已认证）
 * - error: 错误信息（如果有）
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // 获取当前认证用户
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.error('[API] auth/status: 获取用户信息出错', authError);
      return new Response(
        JSON.stringify({ 
          authenticated: false, 
          error: "获取用户信息出错"
        }),
        {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate' 
          }
        }
      );
    }
    
    // 根据用户是否存在返回状态
    if (user) {
      return new Response(
        JSON.stringify({ 
          authenticated: true, 
          userId: user.id
        }),
        {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate' 
          }
        }
      );
    } else {
      return new Response(
        JSON.stringify({ authenticated: false }),
        {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate' 
          }
        }
      );
    }
  } catch (error: any) {
    console.error('[API] auth/status: 服务器错误', error);
    return new Response(
      JSON.stringify({ 
        authenticated: false, 
        error: error.message || "服务器内部错误"
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 