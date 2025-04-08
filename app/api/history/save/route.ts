import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

// 历史记录最大存储数量
const MAX_HISTORY_RECORDS = 100;

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
    const supabaseAdmin = await createAdminClient();
    
    // 检查用户当前历史记录数量
    const { count, error: countError } = await supabaseAdmin
      .from('ai_images_creator_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    if (countError) {
      console.error('查询历史记录数量失败:', countError);
    } else {
      console.log(`用户 ${userId} 当前历史记录数量: ${count || 0}`);
      
      // 如果记录数量达到或超过最大限制，删除最早的记录
      if (count !== null && count >= MAX_HISTORY_RECORDS) {
        console.log(`用户历史记录数量(${count})已达到最大限制(${MAX_HISTORY_RECORDS})，将删除最早的记录`);
        
        // 查询最早的记录
        const { data: oldestRecords, error: queryError } = await supabaseAdmin
          .from('ai_images_creator_history')
          .select('id')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .limit(count - MAX_HISTORY_RECORDS + 1); // 删除超出限制的记录数量
        
        if (queryError) {
          console.error('查询最早的历史记录失败:', queryError);
        } else if (oldestRecords && oldestRecords.length > 0) {
          // 删除最早的记录
          const recordIds = oldestRecords.map(record => record.id);
          const { error: deleteError } = await supabaseAdmin
            .from('ai_images_creator_history')
            .delete()
            .in('id', recordIds);
          
          if (deleteError) {
            console.error('删除最早的历史记录失败:', deleteError);
          } else {
            console.log(`成功删除 ${recordIds.length} 条最早的历史记录`);
          }
        }
      }
    }
    
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