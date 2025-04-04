import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// 获取历史记录的API端点
export async function GET(request: NextRequest) {
  try {
    // 创建Supabase客户端
    const supabase = createClient();

    // 获取限制和偏移参数
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // 查询用户
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { 
          success: false, 
          error: '未授权访问' 
        }, 
        { status: 401 }
      );
    }

    console.log(`获取历史记录，限制: ${limit}条，偏移: ${offset}`);

    // 查询历史记录 - 按照创建时间降序排列，最新的在前面
    const { data: history, error: historyError } = await supabase
      .from('ai_images_creator_history')
      .select('id, user_id, prompt, image_url, created_at, style, aspect_ratio')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)
      .range(offset, offset + limit - 1);

    if (historyError) {
      console.error('获取历史记录失败:', historyError);
      return NextResponse.json(
        { 
          success: false, 
          error: '获取历史记录时出错' 
        }, 
        { status: 500 }
      );
    }
    
    // 验证并处理历史记录数据
    const processedHistory = history.map(item => {
      // 确保URL格式正确
      let imageUrl = item.image_url;
      if (imageUrl && typeof imageUrl === 'string') {
        // 移除可能的URL引号
        imageUrl = imageUrl.trim();
        if ((imageUrl.startsWith('"') && imageUrl.endsWith('"')) || 
            (imageUrl.startsWith("'") && imageUrl.endsWith("'"))) {
          imageUrl = imageUrl.slice(1, -1);
        }
        
        // 确保完整URL
        if (imageUrl.startsWith('/')) {
          imageUrl = `${request.nextUrl.origin}${imageUrl}`;
        } else if (!imageUrl.startsWith('http')) {
          imageUrl = `https://${imageUrl}`;
        }
        
        // 更新处理后的URL
        item.image_url = imageUrl;
      }
      return item;
    });

    // 打印第一条记录示例，帮助调试
    if (processedHistory.length > 0) {
      const firstItem = processedHistory[0];
      console.log(`首条记录示例: {
  id: ${firstItem.id},
  image_url: '${firstItem.image_url}',
  prompt: '${firstItem.prompt?.substring(0, 30)}...'
}`);
    }

    console.log(`成功获取${processedHistory.length}条历史记录`);
    
    return NextResponse.json({
      success: true,
      history: processedHistory
    });
  } catch (error) {
    console.error('历史记录API出错:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '服务器内部错误' 
      }, 
      { status: 500 }
    );
  }
} 