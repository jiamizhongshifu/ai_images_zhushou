import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { OpenAI } from 'openai';

// API 请求配置
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 毫秒
const TIMEOUT = 60000; // 1分钟超时

// 延时函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 获取有效的API配置
function getEffectiveOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY || '';
  
  if (!apiKey) {
    console.error('OpenAI API Key 未设置');
    return { apiKey: '', isConfigComplete: false };
  }
  
  return {
    apiKey,
    isConfigComplete: true
  };
}

// 更新用户点数
async function updateUserCredits(userId: string, action: 'deduct' | 'add', amount = 1): Promise<boolean> {
  try {
    const supabaseAdmin = createAdminClient();
    
    if (action === 'deduct') {
      // 检查用户是否有足够的点数
      const { data: credits, error: checkError } = await supabaseAdmin
        .from('ai_images_creator_credits')
        .select('credits')
        .eq('user_id', userId)
        .single();
        
      if (checkError || !credits || credits.credits < amount) {
        console.error('检查点数失败或点数不足:', checkError || '点数不足');
        return false;
      }
    }
    
    // 更新点数
    const { error } = await supabaseAdmin
      .from('ai_images_creator_credits')
      .update({ 
        credits: action === 'deduct' 
          ? supabaseAdmin.rpc('decrement', { x: amount }) 
          : supabaseAdmin.rpc('increment', { x: amount }),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);
      
    if (error) {
      console.error(`${action === 'deduct' ? '扣除' : '添加'}点数失败:`, error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('更新用户点数时出错:', error);
    return false;
  }
}

// 保存图片历史记录
async function saveImageHistory(
  userId: string, 
  imageUrl: string, 
  prompt: string,
  modelUsed: string = 'dall-e-3',
  generationSettings: any = {},
  status: string = 'completed'
): Promise<boolean> {
  try {
    const supabaseAdmin = createAdminClient();
    
    const { error } = await supabaseAdmin
      .from('ai_images_creator_history')
      .insert({
        user_id: userId,
        image_url: imageUrl,
        prompt,
        model: modelUsed,
        settings: generationSettings,
        status,
        created_at: new Date().toISOString()
      });
      
    if (error) {
      console.error('保存图片历史记录失败:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('保存历史记录时出错:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let userId = '';  // 初始化为空字符串，而不是null
  let creditsDeducted = false;
  
  try {
    // 获取当前认证用户
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "用户未认证" }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    userId = user.id;
    
    // 获取API配置
    const { apiKey, isConfigComplete } = getEffectiveOpenAIConfig();
    
    if (!isConfigComplete) {
      return new Response(JSON.stringify({ 
        error: "OpenAI API配置不完整，请检查环境变量",
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 解析请求体
    const body = await request.json();
    const { prompt, size = '1024x1024', n = 1, style = 'vivid' } = body;
    
    if (!prompt) {
      return new Response(JSON.stringify({ error: "提示词不能为空" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    console.log('收到图片生成请求:', { prompt, size, style });
    
    // 在扣除用户点数前先检查点数记录是否存在，如果不存在则创建
    const supabaseAdmin = createAdminClient();
    const { data: existingCredits, error: checkError } = await supabaseAdmin
      .from('ai_images_creator_credits')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
      
    if (checkError) {
      console.error('检查用户点数记录失败:', checkError);
    }
    
    if (!existingCredits) {
      console.log('用户点数记录不存在，创建初始记录');
      const { error: insertError } = await supabaseAdmin
        .from('ai_images_creator_credits')
        .insert({
          user_id: userId,
          credits: 5,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        
      if (insertError) {
        console.error('创建用户点数记录失败:', insertError);
        return new Response(JSON.stringify({ error: "创建用户点数记录失败" }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      
      console.log('已成功创建用户点数初始记录，点数: 5');
    }
    
    // 扣除用户点数
    const deductedSuccess = await updateUserCredits(userId, 'deduct', 1);
    
    if (!deductedSuccess) {
      console.error('扣除用户点数失败');
      return new Response(JSON.stringify({ error: "扣除用户点数失败，请重试" }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // 标记已成功扣除点数
    creditsDeducted = true;
    console.log('已扣除用户点数，用户ID:', userId);
    
    // 创建OpenAI客户端
    const openai = new OpenAI({
      apiKey: apiKey
    });
    
    console.log('发送OpenAI图像生成请求中，开始时间:', new Date().toISOString());
    
    // 配置超时设置
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), TIMEOUT);
    
    try {
      // 开始计时
      const requestStart = Date.now();
      
      // 调用OpenAI API生成图片
      const response = await openai.images.generate({
        prompt: prompt,
        n: n,
        size: size as "256x256" | "512x512" | "1024x1024",
        style: style as "vivid" | "natural",
        response_format: 'url'
      });
      
      // 清除超时计时器
      clearTimeout(timeoutId);
      
      // 计算请求耗时
      const requestTime = Date.now() - requestStart;
      console.log('请求完成，耗时:', requestTime + 'ms');
      
      // 检查响应是否为空
      if (!response.data || response.data.length === 0) {
        console.error('API返回数据格式不符合预期:', response);
        throw new Error("API返回数据格式不符合预期");
      }
      
      // 获取图片URL
      const imageUrl = response.data[0].url;
      
      if (!imageUrl) {
        console.error('API未返回有效的图片URL');
        throw new Error("API未返回有效的图片URL");
      }
      
      console.log('成功获取图片URL:', imageUrl);
      
      // 保存历史记录
      await saveImageHistory(userId, imageUrl, prompt, 'dall-e-3', { size, style });
      
      console.log('API请求完成，结束时间:', new Date().toISOString());
      
      // 返回成功响应
      return new Response(JSON.stringify({ imageUrl: imageUrl }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      // 清除超时计时器
      clearTimeout(timeoutId);
      
      // 处理中断或超时
      if (error.name === 'AbortError' || (error.message && error.message.includes('timeout'))) {
        console.error('API请求超时或被中断');
        
        // 退还用户点数
        if (creditsDeducted) {
          const refundSuccess = await updateUserCredits(userId, 'add', 1);
          if (refundSuccess) {
            console.log('由于请求超时，已退还用户点数，用户ID:', userId);
          } else {
            console.error('退还用户点数失败，用户ID:', userId);
          }
        }
        
        return new Response(JSON.stringify({ 
          error: "图像生成请求超时，已自动退还点数。请稍后重试。",
          creditsRefunded: true
        }), {
          status: 504,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      
      // 处理其他错误
      console.error('API请求失败，错误信息:', error.message || '未知错误');
      
      // 退还用户点数
      if (creditsDeducted) {
        const refundSuccess = await updateUserCredits(userId, 'add', 1);
        if (refundSuccess) {
          console.log('由于API错误，已退还用户点数，用户ID:', userId);
        } else {
          console.error('退还用户点数失败，用户ID:', userId);
        }
      }
      
      return new Response(JSON.stringify({ 
        error: error.message || "图像生成失败",
        creditsRefunded: creditsDeducted
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error: any) {
    // 记录错误并计算处理时间
    const processingTime = Date.now() - startTime;
    console.error(`处理失败，耗时: ${processingTime}ms, 错误:`, error);
    
    // 如果已扣除点数但请求失败，退还点数
    if (creditsDeducted && userId) {
      const refundSuccess = await updateUserCredits(userId, 'add', 1);
      if (refundSuccess) {
        console.log('由于请求处理失败，已退还用户点数，用户ID:', userId);
      } else {
        console.error('退还用户点数失败，用户ID:', userId);
      }
    }
    
    return new Response(JSON.stringify({ 
      error: error.message || "处理请求时出错",
      creditsRefunded: creditsDeducted
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
} 