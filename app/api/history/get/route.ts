import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// 历史记录最大数量限制
const MAX_HISTORY_RECORDS = 100;
// 缓存控制参数
const CACHE_MAX_AGE = 300; // 5分钟缓存

/**
 * 获取用户图片生成历史记录
 * 
 * GET 参数:
 * - limit: 可选，限制返回记录数量，默认20条
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
  // 检查是否是重复请求
  const requestId = request.headers.get('X-Request-ID') || '';
  const isXHR = request.headers.get('X-Requested-With') === 'XMLHttpRequest';
  
  try {
    // 获取请求参数
    const { searchParams } = new URL(request.url);
    // 默认每页20条，限制最大返回记录数为MAX_HISTORY_RECORDS
    const requestedLimit = parseInt(searchParams.get('limit') || '20');
    const limit = Math.min(requestedLimit, MAX_HISTORY_RECORDS);
    const offset = parseInt(searchParams.get('offset') || '0');
    
    console.log(`获取历史记录，请求限制: ${requestedLimit}条，实际限制: ${limit}条，偏移: ${offset}`);
    
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
    
    // 处理URL格式，确保所有URL都是完整正确的格式
    const processedData = data.map(item => {
      // 确保URL格式正确
      if (item.image_url && typeof item.image_url === 'string') {
        let imageUrl = item.image_url.trim();
        
        // 移除URL两端的引号
        if ((imageUrl.startsWith('"') && imageUrl.endsWith('"')) || 
            (imageUrl.startsWith("'") && imageUrl.endsWith("'"))) {
          imageUrl = imageUrl.slice(1, -1);
        }
        
        // 确保URL包含协议
        if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
          imageUrl = `https://${imageUrl}`;
        }
        
        // 确保filesystem.site域名正确
        if (imageUrl.includes('filesystem.site')) {
          // 移除URL末尾可能的多余字符
          imageUrl = imageUrl.replace(/[.,;:!?)]$/, '');
        }
        
        item.image_url = imageUrl;
      }
      return item;
    });
    
    // 返回结果
    console.log(`成功获取${processedData.length}条历史记录，最多显示${MAX_HISTORY_RECORDS}条`);
    if (processedData.length > 0) {
      console.log('首条记录示例:', {
        id: processedData[0].id,
        image_url: processedData[0].image_url,
        prompt: processedData[0].prompt?.substring(0, 30) + '...'
      });
    }
    
    // 设置缓存控制头
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
      'ETag': `"history-${user.id}-${offset}-${limit}-${Date.now()}"`,
    };
    
    return new Response(JSON.stringify({ 
      success: true, 
      history: processedData,
      meta: {
        limit,
        offset,
        total_records: processedData.length,
        has_more: processedData.length >= limit,
        max_limit: MAX_HISTORY_RECORDS
      }
    }), {
      status: 200,
      headers
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