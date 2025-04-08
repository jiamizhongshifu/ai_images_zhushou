import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { v4 as uuidv4 } from 'uuid';

/**
 * 创建图像生成任务API
 * 
 * 请求体:
 * {
 *   prompt: string,  // 必需，生成提示词
 *   image?: string,  // 可选，base64编码的输入图片
 *   style?: string,  // 可选，指定生成风格
 * }
 * 
 * 响应:
 * {
 *   success: boolean,
 *   taskId: string,  // 任务ID，用于查询状态
 *   message?: string,
 *   error?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // 获取当前认证用户
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: '用户未认证' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 解析请求体
    const body = await request.json();
    const { prompt, image, style } = body;
    
    // 验证必要参数
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return new Response(JSON.stringify({ 
        success: false, 
        error: '提示词不能为空' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 检查用户点数
    const { data: userCredits, error: creditsError } = await supabase
      .from('ai_images_creator_credits')
      .select('credits')
      .eq('user_id', user.id)
      .single();
    
    if (creditsError) {
      console.error('检查用户点数失败:', creditsError);
      
      // 如果用户没有点数记录，创建一个初始记录
      if (creditsError.code === 'PGRST116') {
        const supabaseAdmin = await createAdminClient();
        await supabaseAdmin
          .from('ai_images_creator_credits')
          .insert({
            user_id: user.id,
            credits: 5, // 初始赠送5点
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
          
        // 重新检查点数
        const { data: newUserCredits, error: newCreditsError } = await supabase
          .from('ai_images_creator_credits')
          .select('credits')
          .eq('user_id', user.id)
          .single();
          
        if (newCreditsError || !newUserCredits || newUserCredits.credits <= 0) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: '点数不足，无法生成图片' 
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      } else {
        return new Response(JSON.stringify({ 
          success: false, 
          error: '获取用户点数失败' 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    
    // 检查点数是否足够
    if (userCredits && userCredits.credits <= 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: '点数不足，无法生成图片' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 生成任务ID
    const taskId = `task_${uuidv4()}`;
    
    // 创建任务记录
    const supabaseAdmin = await createAdminClient();
    const { error: taskError } = await supabaseAdmin
      .from('ai_images_creator_tasks')
      .insert({
        user_id: user.id,
        task_id: taskId,
        status: 'pending',
        prompt: prompt,
        image_base64: image || null,
        style: style || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    
    if (taskError) {
      console.error('创建任务记录失败:', taskError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: '创建任务失败' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 触发异步处理（这里我们只是创建任务，实际处理会由后台作业执行）
    // 实际项目中，这里可以调用队列服务或者WebHook触发后台作业
    
    // 返回任务ID
    return new Response(JSON.stringify({ 
      success: true,
      taskId: taskId,
      message: '任务创建成功，正在处理中'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error: any) {
    console.error('处理图像生成任务创建请求时出错:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || '服务器内部错误' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
} 