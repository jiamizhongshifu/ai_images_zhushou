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
    const { taskId, secretKey, preserveAspectRatio } = body;
    
    // 存储preserveAspectRatio以便在processTask中使用
    const shouldPreserveAspectRatio = preserveAspectRatio === true;
    
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
    
    // 启动异步处理，传入保持比例参数
    processTask(taskId, shouldPreserveAspectRatio).catch(err => {
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
async function processTask(taskId: string, preserveAspectRatio: boolean = false) {
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
    
    // 扣除用户点数 - 使用安全的方式
    let deductError: any = null;
    let deductedData = null;
    
    try {
      // 方法1: 先获取当前点数，然后更新
      const { data: currentData, error: fetchError } = await supabase
        .from('ai_images_creator_credits')
        .select('credits')
        .eq('user_id', task.user_id)
        .single();
      
      if (fetchError) {
        console.error('获取用户点数失败:', fetchError);
        deductError = fetchError;
      } else if (currentData) {
        // 确保点数不会低于0
        const newCredits = Math.max(0, (currentData.credits || 0) - 1);
        
        const { data: updateData, error: updateError } = await supabase
          .from('ai_images_creator_credits')
          .update({ credits: newCredits })
          .eq('user_id', task.user_id)
          .select('credits')
          .single();
          
        if (updateError) {
          console.error('更新用户点数失败:', updateError);
          deductError = updateError;
        } else {
          deductedData = updateData;
        }
      }
    } catch (err) {
      console.error('扣除点数过程中出错:', err);
      deductError = err;
    }
    
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
    
    // 处理比例保持
    let size: string | undefined = "1024x1024"; // 默认尺寸

    if (preserveAspectRatio && task.image_base64) {
      try {
        // 从Base64数据中计算图片比例
        const aspectRatio = await calculateImageAspectRatio(task.image_base64);
        
        if (aspectRatio) {
          console.log(`图片宽高比为 ${aspectRatio.toFixed(2)}`);
          
          // 根据比例确定输出尺寸，保持总像素数约为1M
          if (aspectRatio >= 1.3) { // 宽屏
            size = "1152x896";  // 约1:1.29
          } else if (aspectRatio <= 0.8) { // 竖屏
            size = "896x1152";  // 约0.78:1
          }
          // 否则使用默认的正方形
        }
      } catch (error) {
        console.error('计算图片比例时出错:', error);
        // 继续使用默认尺寸
      }
    }

    console.log(`使用输出尺寸: ${size}`);

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
    
    // 准备生成请求参数时添加size
    const params: any = {
      model: apiConfig.model || 'gpt-4o-all',
      messages: messages as any, // 类型断言处理暂时的类型不匹配问题
      max_tokens: 4000,
      temperature: 0.7,
      response_format: { type: 'text' }
    };

    // 如果确定了size，加入到请求参数中
    if (size) {
      console.log(`添加size参数: ${size}`);
      params.size = size;
    }
    
    try {
      // 调用OpenAI API
      console.log(`开始调用OpenAI API生成图片，参数:`, {
        model: params.model,
        hasImage: !!task.image_base64,
        size: params.size
      });
      
      const response = await openai.chat.completions.create(params);
      
      // 提取图片URL
      const content = response.choices[0]?.message.content;
      
      if (!content) {
        console.error('API返回内容为空');
        await updateTaskStatus(taskId, 'failed', null, 'API返回内容为空');
        await refundCredits(task.user_id);
        await updateTaskRefundStatus(taskId, true);
        return;
      }
      
      // 记录原始响应内容（忽略过长内容）
      const contentPreview = content.length > 200 
        ? `${content.substring(0, 200)}... (内容较长，已截断)`
        : content;
      console.log(`任务 ${taskId} API返回原始内容: ${contentPreview}`);
      
      // 识别不同响应格式并适当处理
      let finalContent = content;
      
      // 检查是否是JSON格式响应
      if (content.includes('```json') && content.includes('```')) {
        console.log('检测到JSON格式响应，尝试提取JSON数据');
        
        // 尝试提取JSON
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          try {
            const jsonData = JSON.parse(jsonMatch[1]);
            console.log('成功解析JSON数据:', JSON.stringify(jsonData).substring(0, 100) + '...');
            
            // 检查是否直接包含图片URL
            if (jsonData.url || jsonData.image || jsonData.image_url) {
              const directUrl = jsonData.url || jsonData.image || jsonData.image_url;
              if (directUrl && typeof directUrl === 'string' && directUrl.startsWith('http')) {
                console.log(`从JSON中直接提取到URL: ${directUrl}`);
                
                // 验证URL
                const isValid = await isValidImageUrl(directUrl);
                if (isValid) {
                  // 直接使用找到的URL
                  await updateTaskStatus(taskId, 'completed', directUrl);
                  await saveImageHistory(
                    task.user_id,
                    directUrl,
                    task.prompt,
                    apiConfig.model,
                    { style: task.style }
                  );
                  console.log(`任务 ${taskId} : 从JSON直接提取图片URL成功`);
                  return;
                }
              }
            }
            
            // 使用JSON内容替换原始内容进行提取
            finalContent = JSON.stringify(jsonData);
          } catch (e) {
            console.warn('解析JSON失败，将使用原始内容:', e);
          }
        }
      }
      
      // 检查是否包含markdown图片标记
      if (content.includes('![') && content.includes('](')) {
        console.log('检测到Markdown图片标记');
      }
      
      // 首次尝试提取URL
      let imageUrl = await extractImageUrlWithRetry(finalContent, 1);
      
      // 如果首次尝试失败，等待更多时间再尝试（某些API会延迟返回完整结果）
      if (!imageUrl) {
        console.log('首次提取URL失败，等待5秒后再次尝试...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 尝试从原始内容中提取
        imageUrl = await extractImageUrlWithRetry(content, 2);
      }
      
      // 如果仍然失败，尝试最后的后备提取
      if (!imageUrl) {
        // 最后的尝试：非常宽松地查找任何URL
        console.log('标准提取方法失败，使用最宽松匹配尝试提取任何URL...');
        imageUrl = extractAnyPossibleUrl(content);
      }
      
      if (!imageUrl) {
        console.error('经过多次尝试，仍未能从API响应中提取图片URL');
        
        // 提供更详细的错误信息
        let errorMsg = '未能提取图片URL';
        if (content.length > 50) {
          errorMsg += `, 响应内容开头: ${content.substring(0, 50)}...`;
        }
        
        await updateTaskStatus(taskId, 'failed', null, errorMsg);
        await refundCredits(task.user_id);
        await updateTaskRefundStatus(taskId, true);
        return;
      }
      
      // 保存图片URL和历史记录
      console.log(`成功提取到图片URL: ${imageUrl}`);
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
        (error as any).message || '处理任务时发生错误'
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
  
  try {
    // 方法1: 先使用safe_decrement_credits RPC函数（如果存在）
    try {
      const { data: rpcResult, error: rpcError } = await supabase
        .rpc('safe_decrement_credits', { user_id_param: userId });
      
      if (!rpcError) {
        console.log(`成功使用RPC退还用户 ${userId} 点数`);
        return;
      }
      
      console.warn(`RPC退还点数失败，使用备用方法: ${rpcError.message}`);
    } catch (rpcErr) {
      console.warn(`调用safe_decrement_credits失败: ${rpcErr}`);
    }
    
    // 方法2: 使用increment RPC函数
    try {
      // 关键修复：直接将数字1作为参数值，而不是对象或字符串
      const { data, error: incrementError } = await supabase.rpc('increment', { x: 1 });
      
      if (!incrementError) {
        // 完成更新
        const { error: updateError } = await supabase
          .from('ai_images_creator_credits')
          .update({ credits: data })
          .eq('user_id', userId);
          
        if (!updateError) {
          console.log(`成功使用increment RPC退还用户 ${userId} 点数`);
          return;
        }
        
        console.warn(`更新用户点数记录失败: ${updateError.message}`);
      } else {
        console.error(`increment RPC调用失败: ${incrementError.message}`);
      }
    } catch (incErr) {
      console.warn(`调用increment失败: ${incErr}`);
    }
      
    // 方法3: 直接更新点数（最后的后备方法）
    const { data: currentData, error: fetchError } = await supabase
      .from('ai_images_creator_credits')
      .select('credits')
      .eq('user_id', userId)
      .single();
    
    if (fetchError) {
      console.error(`获取用户点数失败: ${fetchError.message}`);
      throw fetchError;
    }
    
    const newCredits = (currentData.credits || 0) + 1;
    
    const { error: updateError } = await supabase
      .from('ai_images_creator_credits')
      .update({ credits: newCredits })
      .eq('user_id', userId);
    
    if (updateError) {
      console.error(`直接更新点数失败: ${updateError.message}`);
      throw updateError;
    }
    
    console.log(`使用直接更新方法退还用户 ${userId} 点数成功`);
  } catch (error: any) {
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
 * 增强版提取图片URL，支持重试机制
 */
async function extractImageUrlWithRetry(content: string, maxRetries: number = 3): Promise<string | null> {
  let retries = 0;
  let url = extractImageUrl(content);
  
  // 如果第一次提取成功，验证URL是否可访问
  if (url) {
    const isValid = await isValidImageUrl(url);
    if (isValid) {
      console.log(`图片URL验证成功: ${url}`);
      return url;
    } else {
      console.log(`图片URL验证失败，将尝试提取其他URL: ${url}`);
      url = null; // 重置URL，继续尝试其他匹配
    }
  }
  
  // 如果第一次提取失败或URL无效，进行重试
  while (!url && retries < maxRetries) {
    console.log(`尝试第 ${retries + 1} 次提取图片URL...`);
    await new Promise(resolve => setTimeout(resolve, 3000)); // 增加等待时间到3秒
    
    // 检查内容是否包含各种URL模式
    if (content.includes('![') || 
        content.includes('http') || 
        content.includes('://') ||
        content.includes('image')) {
      
      console.log('检测到内容中可能包含URL，尝试提取');
      
      // 尝试多种提取方式
      url = tryExtractImageUrl(content);
      
      // 如果提取到URL，验证其可访问性
      if (url) {
        const isValid = await isValidImageUrl(url);
        if (isValid) {
          console.log(`图片URL验证成功: ${url}`);
          return url;
        } else {
          console.log(`图片URL验证失败，将尝试其他方式: ${url}`);
          url = null;
        }
      }
    }
    
    retries++;
  }
  
  // 最后一次尝试：从整个文本中提取任何看起来像URL的内容
  if (!url) {
    url = extractAnyPossibleUrl(content);
    if (url) {
      const isValid = await isValidImageUrl(url);
      if (isValid) {
        console.log(`最终尝试提取到有效URL: ${url}`);
        return url;
      }
    }
  }
  
  return url;
}

/**
 * 使用多种模式尝试提取图片URL
 */
function tryExtractImageUrl(content: string): string | null {
  // 标准提取方法
  let url = extractImageUrl(content);
  if (url) return url;
  
  // 尝试匹配模式1: JSON中的URL（用于处理API返回的JSON格式数据）
  try {
    // 检查是否包含JSON格式内容
    if (content.includes('{') && content.includes('}')) {
      const jsonMatches = content.match(/\{[\s\S]*?\}/g);
      if (jsonMatches) {
        for (const jsonStr of jsonMatches) {
          try {
            const json = JSON.parse(jsonStr);
            // 检查常见的JSON字段名称
            const possibleFields = ['url', 'image', 'image_url', 'imageUrl', 'src', 'source', 'path', 'link'];
            for (const field of possibleFields) {
              if (json[field] && typeof json[field] === 'string' && json[field].includes('http')) {
                console.log(`从JSON中提取到URL (${field}): ${json[field]}`);
                return json[field];
              }
            }
            
            // 递归搜索嵌套对象
            const deepSearch = (obj: any): string | null => {
              for (const key in obj) {
                if (typeof obj[key] === 'string' && obj[key].includes('http') && isLikelyImageUrl(obj[key])) {
                  return obj[key];
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                  const result = deepSearch(obj[key]);
                  if (result) return result;
                }
              }
              return null;
            };
            
            const deepResult = deepSearch(json);
            if (deepResult) {
              console.log(`从嵌套JSON中提取到URL: ${deepResult}`);
              return deepResult;
            }
          } catch (e) {
            // JSON解析失败，忽略
          }
        }
      }
    }
  } catch (e) {
    // JSON处理错误，忽略
  }
  
  // 尝试匹配模式2: 几种特定格式的图片URL模式
  const patterns = [
    /(?:image|img|photo|picture|pic)[^\w]?(?:link|url|src|path)[^\w]?[=:]\s*["']?(https?:\/\/[^"'\s]+)["']?/i,
    /["']?(https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|gif|webp|bmp)(?:\?[^"'\s]*)?)["']?/i,
    /["']?(https?:\/\/[^"'\s]+\/image[^"'\s]*)["']?/i,
    /["']?(https?:\/\/[^"'\s]+\/img[^"'\s]*)["']?/i,
    /["']?(https?:\/\/[^"'\s]+\/media[^"'\s]*)["']?/i,
    /["']?(https?:\/\/[^"'\s]+\/files[^"'\s]*)["']?/i,
    /["']?(https?:\/\/[^"'\s]+\/uploads[^"'\s]*)["']?/i,
    /(?:src|href)\s*=\s*["']?(https?:\/\/[^"'\s]+)["']?/i
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      console.log(`使用高级模式匹配URL: ${match[1]}`);
      return match[1];
    }
  }
  
  return null;
}

/**
 * 从文本中提取任何可能的URL，最后的尝试
 */
function extractAnyPossibleUrl(content: string): string | null {
  // 使用非常宽松的URL匹配模式
  const matches = content.match(/(https?:\/\/[^\s<>(){}[\]"`']+)/ig);
  
  if (matches && matches.length > 0) {
    // 过滤并找出可能性最高的图片URL
    const possibleImageUrls = matches.filter(url => isLikelyImageUrl(url));
    
    if (possibleImageUrls.length > 0) {
      console.log(`从所有可能URL中选择最可能的图片URL: ${possibleImageUrls[0]}`);
      return possibleImageUrls[0];
    }
    
    // 如果没有明显的图片URL，返回第一个URL
    console.log(`没有明显的图片URL，返回第一个URL: ${matches[0]}`);
    return matches[0];
  }
  
  return null;
}

/**
 * 检查URL是否可能是图片URL
 */
function isLikelyImageUrl(url: string): boolean {
  // 检查URL是否包含常见图片格式扩展名
  if (url.match(/\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i)) {
    return true;
  }
  
  // 检查URL是否包含常见的图片相关路径
  if (url.includes('/image') || 
      url.includes('/img') || 
      url.includes('/photo') || 
      url.includes('/media') || 
      url.includes('cdn') ||
      url.includes('storage') ||
      url.includes('assets')) {
    return true;
  }
  
  return false;
}

/**
 * 验证URL是否可访问并是图片
 */
async function isValidImageUrl(url: string): Promise<boolean> {
  try {
    // 排除明显的非图片URL
    if (url.includes('placeholder') || 
        url.includes('placehold.co') || 
        url.includes('example.com')) {
      return false;
    }
    
    // 仅做基本检查，不实际发送请求
    // 在生产环境中，可以使用HEAD请求确认URL有效且是图片
    return true;
  } catch (error) {
    console.error(`验证图片URL失败: ${url}`, error);
    return false;
  }
}

/**
 * 从API响应中提取图片URL
 */
function extractImageUrl(content: string): string | null {
  console.log("开始提取图片URL，原始内容:", content);
  
  // 检测错误消息模式 - 但不立即视为失败，因为可能是初始响应
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
  
  // 只有当明确不包含图片URL时，才标记为可能有错误
  const hasErrorMessage = errorPatterns.some(pattern => 
    content.toLowerCase().includes(pattern.toLowerCase()));
  
  const containsImageUrlPattern = content.includes('](https://') || 
                                 content.match(/https?:\/\/[^\s"']+\.(jpe?g|png|gif|webp|bmp)/i);
  
  // 如果包含错误信息且明确不包含URL模式，则视为错误
  if (hasErrorMessage && !containsImageUrlPattern) {
    console.log(`检测到错误信息，但继续尝试提取URL`);
    // 此处不立即返回null，仍然尝试提取
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

/**
 * 从Base64图片数据中计算宽高比
 */
async function calculateImageAspectRatio(base64Data: string): Promise<number> {
  // 去除data:image前缀
  const base64Image = base64Data.includes('base64,') ? 
    base64Data.split('base64,')[1] : base64Data;
  
  try {
    // 从Base64解码前8字节来检测图像类型和尺寸
    // 这是个简化方法，实际生产中应该使用完整的图像解析库
    const imageType = detectImageType(base64Data);
    
    if (imageType === 'unknown') {
      console.log('无法检测图片类型，使用默认比例');
      return 1.0; // 默认为正方形
    }
    
    // 如果是jpeg, png等常见格式，可以从请求参数中获取尺寸信息
    if (base64Data.includes('width=') && base64Data.includes('height=')) {
      const widthMatch = base64Data.match(/width=(\d+)/);
      const heightMatch = base64Data.match(/height=(\d+)/);
      
      if (widthMatch && heightMatch) {
        const width = parseInt(widthMatch[1]);
        const height = parseInt(heightMatch[1]);
        
        if (width > 0 && height > 0) {
          return width / height;
        }
      }
    }
    
    // 对于无法从参数获取的，可以解析Base64获取图像头信息
    // 这里简化处理，实际应使用专门的图像处理库
    const buffer = Buffer.from(base64Image, 'base64');
    
    // 简单检测几种常见格式的尺寸
    if (imageType === 'jpeg') {
      // JPEG格式解析非常复杂，这里只是示例，不是完整实现
      for (let i = 0; i < buffer.length - 10; i++) {
        // 寻找SOF0标记
        if (buffer[i] === 0xFF && (buffer[i + 1] === 0xC0 || buffer[i + 1] === 0xC2)) {
          const height = (buffer[i + 5] << 8) | buffer[i + 6];
          const width = (buffer[i + 7] << 8) | buffer[i + 8];
          return width / height;
        }
      }
    } else if (imageType === 'png') {
      // PNG宽高在头部固定位置
      const width = (buffer[16] << 24) | (buffer[17] << 16) | (buffer[18] << 8) | buffer[19];
      const height = (buffer[20] << 24) | (buffer[21] << 16) | (buffer[22] << 8) | buffer[23];
      return width / height;
    }
    
    // 默认返回1.0（正方形）
    return 1.0;
  } catch (error) {
    console.error('解析图片比例出错:', error);
    return 1.0; // 出错时返回默认值
  }
}

/**
 * 检测Base64图片的格式
 */
function detectImageType(base64Data: string): string {
  if (base64Data.includes('data:image/jpeg') || base64Data.includes('data:image/jpg')) {
    return 'jpeg';
  } else if (base64Data.includes('data:image/png')) {
    return 'png';
  } else if (base64Data.includes('data:image/gif')) {
    return 'gif';
  } else if (base64Data.includes('data:image/webp')) {
    return 'webp';
  }
  
  // 尝试从Base64编码中检测
  const base64Image = base64Data.includes('base64,') ? 
    base64Data.split('base64,')[1] : base64Data;
  
  try {
    const buffer = Buffer.from(base64Image.substring(0, 32), 'base64');
    
    // 检查JPEG标记
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      return 'jpeg';
    }
    // 检查PNG标记
    else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return 'png';
    }
    // 检查GIF标记
    else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      return 'gif';
    }
    // WebP检测需要更多字节
    else if (buffer.length >= 12 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return 'webp';
    }
  } catch (error) {
    console.error('检测图片类型出错:', error);
  }
  
  return 'unknown';
} 