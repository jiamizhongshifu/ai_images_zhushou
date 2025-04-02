import { NextRequest } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { OpenAI } from 'openai';
import { getApiConfig } from '@/utils/env';

// 网络请求配置
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 毫秒
const TIMEOUT = 600000; // 10分钟超时

/**
 * 处理图像生成任务API（仅内部使用，需要适当保护）
 * 
 * 查询参数:
 * - taskId: 任务ID (必需)
 * - secretKey: 安全密钥 (必需，防止未授权访问)
 * 
 * 响应:
 * {
 *   success: boolean,
 *   message?: string,
 *   error?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // 获取查询参数
    const body = await request.json();
    const { taskId, secretKey } = body;
    
    // 验证安全密钥（实际环境中应使用更安全的方式）
    const validSecretKey = process.env.TASK_PROCESS_SECRET_KEY || 'your-secret-key-here';
    if (secretKey !== validSecretKey) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: '无效的安全密钥' 
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 验证任务ID
    if (!taskId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: '任务ID不能为空' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 获取任务信息
    const supabase = createAdminClient();
    const { data: task, error: taskError } = await supabase
      .from('ai_images_creator_tasks')
      .select('*')
      .eq('task_id', taskId)
      .single();
    
    if (taskError || !task) {
      console.error('获取任务信息失败:', taskError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: '任务不存在或已被处理' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 检查任务状态，避免重复处理
    if (task.status !== 'pending') {
      return new Response(JSON.stringify({ 
        success: false, 
        message: `任务已处于 ${task.status} 状态，无需再次处理` 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 更新任务状态为处理中
    const { error: updateError } = await supabase
      .from('ai_images_creator_tasks')
      .update({
        status: 'processing',
        processing_started_at: new Date().toISOString()
      })
      .eq('task_id', taskId);
    
    if (updateError) {
      console.error('更新任务状态失败:', updateError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: '更新任务状态失败' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 启动异步处理
    processTask(taskId).catch(err => {
      console.error(`处理任务 ${taskId} 时发生错误:`, err);
    });
    
    // 返回成功响应
    return new Response(JSON.stringify({ 
      success: true, 
      message: '任务处理已启动' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error: any) {
    console.error('处理任务处理请求时出错:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || '服务器内部错误' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 异步处理任务
 */
async function processTask(taskId: string) {
  const supabase = createAdminClient();
  
  try {
    // 获取任务信息
    const { data: task, error: taskError } = await supabase
      .from('ai_images_creator_tasks')
      .select('*')
      .eq('task_id', taskId)
      .single();
    
    if (taskError || !task) {
      console.error(`任务 ${taskId} 不存在:`, taskError);
      return;
    }
    
    // 检查任务状态
    if (task.status !== 'processing') {
      console.log(`任务 ${taskId} 状态为 ${task.status}，跳过处理`);
      return;
    }
    
    // 扣除用户点数
    const { data: deductedData, error: deductError } = await supabase
      .from('ai_images_creator_credits')
      .update({
        credits: supabase.rpc('decrement', { x: 1 })
      })
      .eq('user_id', task.user_id)
      .select('credits')
      .single();
    
    if (deductError) {
      console.error(`扣除用户点数失败:`, deductError);
      await updateTaskStatus(taskId, 'failed', null, '扣除点数失败');
      return;
    }
    
    // 更新任务状态，标记已扣除点数
    await supabase
      .from('ai_images_creator_tasks')
      .update({
        credits_deducted: true
      })
      .eq('task_id', taskId);
    
    // 获取API配置
    const apiConfig = getApiConfig();
    
    if (!apiConfig.isConfigComplete) {
      console.error('API配置不完整，无法处理任务');
      await updateTaskStatus(taskId, 'failed', null, 'API配置不完整');
      await refundCredits(task.user_id);
      await updateTaskRefundStatus(taskId, true);
      return;
    }
    
    // 创建OpenAI客户端
    const openai = new OpenAI({
      apiKey: apiConfig.apiKey,
      baseURL: apiConfig.apiUrl
    });
    
    // 准备生成请求
    let messages: Array<{
      role: 'user' | 'assistant' | 'system'; 
      content: Array<{type: 'text' | 'image_url', text?: string, image_url?: {url: string}}> | string;
    }> = [];
    
    // 生成主提示词
    const fullPrompt = task.style 
      ? `${task.prompt}，风格：${task.style}`
      : task.prompt;
      
    // 使用标准格式的消息
    if (task.image_base64) {
      // 如果有图片，使用多部分内容
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: fullPrompt },
          { 
            type: 'image_url', 
            image_url: { url: task.image_base64 }
          }
        ]
      });
    } else {
      // 纯文本消息
      messages.push({
        role: 'user',
        content: fullPrompt
      });
    }
    
    try {
      // 调用OpenAI API
      const response = await openai.chat.completions.create({
        model: apiConfig.model || 'gpt-4o-all',
        messages: messages as any, // 类型断言处理暂时的类型不匹配问题
        max_tokens: 4000,
        temperature: 0.7,
        response_format: { type: 'text' }
      });
      
      // 提取图片URL
      const content = response.choices[0]?.message.content;
      
      if (!content) {
        console.error('API返回内容为空');
        await updateTaskStatus(taskId, 'failed', null, 'API返回内容为空');
        await refundCredits(task.user_id);
        await updateTaskRefundStatus(taskId, true);
        return;
      }
      
      // 提取图片URL
      const imageUrl = extractImageUrl(content);
      
      if (!imageUrl) {
        console.error('未能从API响应中提取图片URL');
        await updateTaskStatus(taskId, 'failed', null, '未能提取图片URL');
        await refundCredits(task.user_id);
        await updateTaskRefundStatus(taskId, true);
        return;
      }
      
      // 保存图片URL和历史记录
      await updateTaskStatus(taskId, 'completed', imageUrl);
      
      // 保存历史记录
      await saveImageHistory(
        task.user_id,
        imageUrl,
        task.prompt,
        apiConfig.model,
        { style: task.style }
      );
      
      console.log(`任务 ${taskId} : 图片生成成功`);
      
    } catch (error: any) {
      console.error(`调用OpenAI API失败:`, error);
      
      // 更新任务状态为失败
      await updateTaskStatus(
        taskId,
        'failed',
        null,
        error.message || '调用API失败'
      );
      
      // 退还点数
      await refundCredits(task.user_id);
      await updateTaskRefundStatus(taskId, true);
    }
    
  } catch (error) {
    console.error(`处理任务 ${taskId} 时发生错误:`, error);
    
    // 尝试更新任务状态为失败
    try {
      await updateTaskStatus(
        taskId,
        'failed',
        null,
        error.message || '处理任务时发生错误'
      );
      
      // 如果已扣除点数，退还
      const { data: task } = await supabase
        .from('ai_images_creator_tasks')
        .select('user_id, credits_deducted')
        .eq('task_id', taskId)
        .single();
      
      if (task && task.credits_deducted) {
        await refundCredits(task.user_id);
        await updateTaskRefundStatus(taskId, true);
      }
    } catch (updateError) {
      console.error(`更新任务 ${taskId} 状态失败:`, updateError);
    }
  }
}

/**
 * 更新任务状态
 */
async function updateTaskStatus(
  taskId: string,
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled',
  resultUrl: string | null = null,
  errorMessage: string | null = null
) {
  const supabase = createAdminClient();
  
  const updateData: any = {
    status,
    updated_at: new Date().toISOString()
  };
  
  if (status === 'completed' && resultUrl) {
    updateData.result_url = resultUrl;
    updateData.completed_at = new Date().toISOString();
  }
  
  if (status === 'failed' && errorMessage) {
    updateData.error_message = errorMessage;
  }
  
  const { error } = await supabase
    .from('ai_images_creator_tasks')
    .update(updateData)
    .eq('task_id', taskId);
  
  if (error) {
    console.error(`更新任务 ${taskId} 状态失败:`, error);
    throw error;
  }
}

/**
 * 更新任务退款状态
 */
async function updateTaskRefundStatus(taskId: string, refunded: boolean) {
  const supabase = createAdminClient();
  
  const { error } = await supabase
    .from('ai_images_creator_tasks')
    .update({
      credits_refunded: refunded,
      updated_at: new Date().toISOString()
    })
    .eq('task_id', taskId);
  
  if (error) {
    console.error(`更新任务 ${taskId} 退款状态失败:`, error);
  }
}

/**
 * 退还用户点数
 */
async function refundCredits(userId: string) {
  const supabase = createAdminClient();
  
  const { error } = await supabase
    .from('ai_images_creator_credits')
    .update({
      credits: supabase.rpc('increment', { x: 1 })
    })
    .eq('user_id', userId);
  
  if (error) {
    console.error(`退还用户 ${userId} 点数失败:`, error);
    throw error;
  }
}

/**
 * 保存图片历史记录
 */
async function saveImageHistory(
  userId: string,
  imageUrl: string,
  prompt: string,
  modelUsed: string = 'gpt-4o-all',
  generationSettings: any = {}
) {
  const supabase = createAdminClient();
  
  const { error } = await supabase
    .from('ai_images_creator_history')
    .insert({
      user_id: userId,
      image_url: imageUrl,
      prompt: prompt,
      model_used: modelUsed,
      generation_settings: generationSettings,
      created_at: new Date().toISOString()
    });
  
  if (error) {
    console.error(`保存图片历史记录失败:`, error);
  }
}

/**
 * 从API响应中提取图片URL
 */
function extractImageUrl(content: string): string | null {
  console.log("开始提取图片URL，原始内容:", content);
  
  // 检测错误消息模式
  const errorPatterns = [
    "encountered an issue",
    "couldn't complete",
    "unable to generate",
    "failed to create",
    "I'm sorry",
    "error",
    "cannot",
    "couldn't"
  ];
  
  // 检查内容是否包含错误信息
  for (const pattern of errorPatterns) {
    if (content.toLowerCase().includes(pattern.toLowerCase())) {
      console.log(`检测到错误信息: "${pattern}"`);
      return null;
    }
  }
  
  // 1. 尝试提取Markdown格式的图片URL
  const markdownMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  if (markdownMatch && markdownMatch[1]) {
    console.log("找到Markdown格式图片URL:", markdownMatch[1]);
    
    // 验证是否是占位图URL
    if (markdownMatch[1].includes("placehold.co")) {
      console.log("URL是占位图，不视为有效图片URL");
      return null;
    }
    
    return markdownMatch[1];
  }

  // 2. 尝试提取直接URL格式（带图片扩展名）
  const directUrlMatch = content.match(/(https?:\/\/[^\s"']+\.(jpe?g|png|gif|webp|bmp))/i);
  if (directUrlMatch && directUrlMatch[1]) {
    console.log("找到直接图片URL:", directUrlMatch[1]);
    
    // 验证是否是占位图URL
    if (directUrlMatch[1].includes("placehold.co")) {
      console.log("URL是占位图，不视为有效图片URL");
      return null;
    }
    
    return directUrlMatch[1];
  }

  // 3. 尝试提取任何URL格式
  const anyUrlMatch = content.match(/(https?:\/\/[^\s"'<>]+)/i);
  if (anyUrlMatch && anyUrlMatch[1]) {
    console.log("找到任意URL:", anyUrlMatch[1]);
    
    // 验证是否是占位图URL或非图片
    if (anyUrlMatch[1].includes("placehold.co") || !anyUrlMatch[1].match(/\.(jpe?g|png|gif|webp|bmp|svg)/i)) {
      console.log("URL不是有效图片URL或是占位图");
      return null;
    }
    
    return anyUrlMatch[1];
  }

  console.log("未找到任何可用的URL");
  return null;
} 