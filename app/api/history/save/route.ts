import { NextRequest } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * 保存用户图片生成历史的API接口
 * 
 * 请求体参数:
 * - userId: 用户ID
 * - imageUrl: 生成的图片URL
 * - prompt: 用户输入的提示词(可选)
 * - modelUsed: 使用的模型(可选)
 * - generationSettings: 生成设置(可选,JSON对象)
 * 
 * 返回:
 * - success: 是否成功
 * - id: 新创建记录的ID
 * - error: 错误信息(如果有)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      userId, 
      imageUrl, 
      prompt, 
      modelUsed = 'gpt-4o-all',
      generationSettings = {},
      status = 'completed'
    } = body;

    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: "缺少用户ID" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!imageUrl) {
      return new Response(JSON.stringify({ success: false, error: "缺少图片URL" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 创建Supabase管理员客户端
    const supabase = createAdminClient();

    // 保存历史记录
    const { data, error } = await supabase
      .from('ai_images_creator_history')
      .insert({
        user_id: userId,
        image_url: imageUrl,
        prompt: prompt || null,
        model_used: modelUsed,
        generation_settings: generationSettings,
        status: status
      })
      .select('id')
      .single();

    if (error) {
      console.error("保存历史记录失败:", error);
      return new Response(JSON.stringify({ success: false, error: "保存历史记录失败" }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      id: data.id
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("处理保存历史记录请求时出错:", error);
    return new Response(JSON.stringify({ success: false, error: error.message || "服务器内部错误" }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 