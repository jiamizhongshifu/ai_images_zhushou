import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// 缓存控制参数
const CACHE_MAX_AGE = 60; // 1分钟缓存

/**
 * 获取用户图片生成历史记录总数
 * 
 * 返回:
 * {
 *   success: boolean,
 *   count: number,
 *   error?: string
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // 获取当前用户
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: '用户未认证' 
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    
    // 查询数据库，获取记录总数
    const { count, error } = await supabase
      .from('ai_images_creator_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    
    if (error) {
      console.error('查询历史记录总数失败:', error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: '查询历史记录总数失败' 
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    
    // 设置缓存控制头
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
      'ETag': `"history-count-${user.id}-${Date.now()}"`,
    };
    
    return new Response(JSON.stringify({ 
      success: true, 
      count: count || 0
    }), {
      status: 200,
      headers
    });
  } catch (error) {
    console.error('获取历史记录总数出错:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: '服务器内部错误' 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
} 