import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * 保存用户图片生成历史记录
 * 
 * POST 参数:
 * {
 *   userId: string, // 用户ID
 *   imageUrl: string, // 图片URL
 *   prompt: string, // 提示词
 *   modelUsed?: string, // 使用的模型
 *   generationSettings?: object, // 生成设置
 *   status?: string // 状态 (completed, failed)
 * }
 * 
 * 返回:
 * {
 *   success: boolean,
 *   id?: number, // 新记录ID
 *   error?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // 解析请求体
    const body = await request.json();
    const { userId, imageUrl, prompt, modelUsed = 'gpt-4o-all', generationSettings = {}, status = 'completed' } = body;
    
    console.log('保存历史记录:', { userId, prompt, status });
    
    // 验证必要参数
    if (!userId || !imageUrl) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: '用户ID和图片URL是必需参数' 
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    
    // 使用管理员客户端插入记录（避免RLS策略限制）
    const supabaseAdmin = createAdminClient();
    
    // 插入历史记录
    const { data, error } = await supabaseAdmin
      .from('ai_images_creator_history')
      .insert({
        user_id: userId,
        image_url: imageUrl,
        prompt: prompt,
        model_used: modelUsed,
        generation_settings: generationSettings,
        status: status,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('保存历史记录失败:', error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: '保存历史记录失败' 
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    
    // 返回成功结果
    console.log('历史记录保存成功，ID:', data.id);
    
    return new Response(JSON.stringify({ 
      success: true,
      id: data.id
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('保存历史记录出错:', error);
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