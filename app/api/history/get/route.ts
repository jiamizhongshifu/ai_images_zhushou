import { createClient } from '@/utils/supabase/server';
import { NextRequest } from 'next/server';

/**
 * 获取用户图片生成历史的API接口
 * 注意: 这个接口使用普通客户端，通过客户端的认证获取当前用户
 * 
 * 查询参数:
 * - limit: 限制返回数量(默认10)
 * - page: 分页(从1开始)
 * 
 * 返回:
 * - success: 是否成功
 * - history: 历史记录数组
 * - total: 总记录数
 * - error: 错误信息(如果有)
 */
export async function GET(request: NextRequest) {
  try {
    // 获取查询参数
    const searchParams = new URL(request.url).searchParams;
    const limit = parseInt(searchParams.get('limit') || '10');
    const page = parseInt(searchParams.get('page') || '1');
    
    // 创建Supabase客户端
    const supabase = await createClient();
    
    // 获取当前认证用户
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "用户未认证" }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 计算偏移量
    const offset = (page - 1) * limit;
    
    // 查询用户历史记录
    const { data: history, error: historyError, count } = await supabase
      .from('ai_images_creator_history')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (historyError) {
      console.error("获取用户历史记录失败:", historyError);
      return new Response(JSON.stringify({ success: false, error: "获取用户历史记录失败" }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ 
      success: true, 
      history: history || [],
      total: count || 0
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error("处理获取用户历史记录请求时出错:", error);
    return new Response(JSON.stringify({ success: false, error: error.message || "服务器内部错误" }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 