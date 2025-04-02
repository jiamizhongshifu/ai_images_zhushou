import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * 获取用户图片生成历史记录
 * 
 * GET 参数:
 * - limit: 可选，限制返回记录数量，默认10条
 * - offset: 可选，分页偏移量，默认0
 * 
 * 返回:
 * {
 *   success: boolean,
 *   history: Array<{
 *     id: number,
 *     image_url: string,
 *     prompt: string,
 *     created_at: string,
 *     model_used: string,
 *     generation_settings: Object,
 *     status: string
 *   }>,
 *   error?: string
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // 获取请求参数
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    console.log(`获取历史记录，限制: ${limit}条，偏移: ${offset}`);
    
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
    
    // 查询数据库
    const { data, error } = await supabase
      .from('ai_images_creator_history')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)
      .range(offset, offset + limit - 1);
    
    if (error) {
      console.error('查询历史记录失败:', error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: '查询历史记录失败' 
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    
    // 返回结果
    console.log(`成功获取${data.length}条历史记录`);
    console.log('首条记录示例:', data.length > 0 ? {
      id: data[0].id,
      image_url: data[0].image_url,
      prompt: data[0].prompt?.substring(0, 30) + '...'
    } : 'No records');
    
    return new Response(JSON.stringify({ 
      success: true, 
      history: data
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('获取历史记录出错:', error);
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