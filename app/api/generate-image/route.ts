import { NextRequest } from 'next/server';
import { addBase64Prefix, estimateBase64Size, compressImageServer } from '@/utils/image/image2Base64';
import { OpenAI } from 'openai';
import { getApiConfig, logApiConfig, TuziConfig } from '@/utils/env';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

// 备用API配置（仅在环境变量不可用时使用）
const BACKUP_API_URL = "https://api.tu-zi.com/v1";
const BACKUP_API_KEY = process.env.OPENAI_API_KEY || '';
const BACKUP_MODEL = "gpt-4o-all";

// 网络请求配置
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 毫秒
const TIMEOUT = 180000; // 增加超时时间到3分钟

// 图片处理配置
const MAX_IMAGE_WIDTH = 1024;  // 最大图片宽度
const MAX_IMAGE_HEIGHT = 1024; // 最大图片高度
const IMAGE_QUALITY = 85;     // JPEG压缩质量 (1-100)

// 关闭测试模式，使用真实API调用
const USE_MOCK_MODE = false;
const MOCK_IMAGE_URL = "https://images.unsplash.com/photo-1575936123452-b67c3203c357?q=80&w=1000";

// 当配额超出时的备用图片
const QUOTA_EXCEEDED_IMAGE = "https://images.unsplash.com/photo-1584824486509-112e4181ff6b?q=80&w=1000";

// 当令牌无效时的备用图片
const INVALID_TOKEN_IMAGE = "https://images.unsplash.com/photo-1594322436404-5a0526db4d13?q=80&w=1000";

// 请求性能跟踪
const requestStats = {
  withImage: {
    count: 0,
    totalTime: 0,
    maxTime: 0,
    minTime: Number.MAX_SAFE_INTEGER
  },
  withoutImage: {
    count: 0,
    totalTime: 0,
    maxTime: 0,
    minTime: Number.MAX_SAFE_INTEGER
  },
  
  // 记录请求时间
  recordTime: function(time: number, hasImage: boolean) {
    if (hasImage) {
      this.withImage.count++;
      this.withImage.totalTime += time;
      if (time > this.withImage.maxTime) this.withImage.maxTime = time;
      if (time < this.withImage.minTime) this.withImage.minTime = time;
    } else {
      this.withoutImage.count++;
      this.withoutImage.totalTime += time;
      if (time > this.withoutImage.maxTime) this.withoutImage.maxTime = time;
      if (time < this.withoutImage.minTime) this.withoutImage.minTime = time;
    }
    this.logStats();
  },
  
  // 计算平均值
  getAverage: function(total: number, count: number) {
    return count === 0 ? 0 : total / count;
  },
  
  // 打印统计信息
  logStats: function() {
    console.log("=== API请求统计 ===");
    console.log(`带图片请求: ${this.withImage.count}次, 平均耗时: ${this.getAverage(this.withImage.totalTime, this.withImage.count).toFixed(2)}ms, 最大耗时: ${this.withImage.maxTime}ms, 最小耗时: ${this.withImage.minTime === Number.MAX_SAFE_INTEGER ? 0 : this.withImage.minTime}ms`);
    console.log(`纯文本请求: ${this.withoutImage.count}次, 平均耗时: ${this.getAverage(this.withoutImage.totalTime, this.withoutImage.count).toFixed(2)}ms, 最大耗时: ${this.withoutImage.maxTime}ms, 最小耗时: ${this.withoutImage.minTime === Number.MAX_SAFE_INTEGER ? 0 : this.withoutImage.minTime}ms`);
    console.log("==================");
  }
};

// 定义消息内容类型
type MessageContent = 
  | { type: "text"; text: string } 
  | { type: "image_url"; image_url: { url: string } };

// 延时函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 处理API错误的辅助函数
function handleApiError(error: any): { errorType: string, message: string } {
  console.error("API错误详情:", error);
  
  // 检查是否是OpenAI错误对象
  if (error.error && error.error.message) {
    // 检查是否是配额不足错误
    if (error.error.code === "insufficient_user_quota") {
      return {
        errorType: "quota_exceeded",
        message: "API配额已用完，请联系管理员或等待配额重置。"
      };
    }
    
    // 检查是否是无效令牌错误
    if (error.status === 401 || (error.error.message && error.error.message.includes("无效的令牌"))) {
      return {
        errorType: "invalid_token",
        message: "API密钥无效，请检查密钥格式是否正确，并确保密钥与API地址匹配。"
      };
    }
    
    // 处理其他错误类型
    return {
      errorType: error.error.type || "api_error",
      message: error.error.message || "API调用失败"
    };
  }
  
  // 处理网络错误等
  return {
    errorType: "network_error",
    message: error.message || "网络请求失败"
  };
}

// 提取图片URL的辅助函数
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
    
    // 验证是否是占位图URL或非图片URL
    if (anyUrlMatch[1].includes("placehold.co") || !anyUrlMatch[1].match(/\.(jpe?g|png|gif|webp|bmp|svg)/i)) {
      console.log("URL不是有效图片URL或是占位图");
      return null;
    }
    
    return anyUrlMatch[1];
  }

  console.log("未找到任何可用的URL");
  return null;
}

// 获取API配置，优先使用环境变量，备用使用硬编码值
function getEffectiveApiConfig() {
  // 从环境变量获取配置
  const envConfig = getApiConfig('tuzi') as TuziConfig;
  
  // 记录环境变量中的配置
  logApiConfig(envConfig);
  
  // 如果环境变量配置不完整，使用备用配置
  if (!envConfig.isConfigComplete) {
    console.log("环境变量配置不完整，使用备用配置");
    return {
      apiUrl: BACKUP_API_URL,
      apiKey: BACKUP_API_KEY,
      model: BACKUP_MODEL,
      isConfigComplete: true
    };
  }
  
  return envConfig;
}

// 用户点数操作：扣除或增加点数
async function updateUserCredits(userId: string, action: 'deduct' | 'add', amount = 1): Promise<boolean> {
  try {
    const response = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/credits/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, action, amount }),
    });
    
    if (!response.ok) {
      console.error(`${action === 'deduct' ? '扣除' : '增加'}用户点数失败: HTTP状态码 ${response.status}`);
      return false;
    }
    
    const data = await response.json();
    console.log(`${action === 'deduct' ? '扣除' : '增加'}用户点数操作结果:`, data);
    return data.success;
  } catch (error) {
    console.error(`${action === 'deduct' ? '扣除' : '增加'}用户点数失败:`, error);
    return false;
  }
}

// 保存用户图片生成历史
async function saveImageHistory(
  userId: string, 
  imageUrl: string, 
  prompt: string,
  modelUsed: string = 'gpt-4o-all',
  generationSettings: any = {},
  status: string = 'completed'
): Promise<boolean> {
  try {
    const response = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/history/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        imageUrl,
        prompt,
        modelUsed,
        generationSettings,
        status
      }),
    });
    
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error("保存图片历史记录失败:", error);
    return false;
  }
}

// 添加API请求超时控制函数
async function fetchWithTimeout(url: string, options: any = {}, timeoutMs = TIMEOUT) {
  const controller = new AbortController();
  const { signal } = controller;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      controller.abort();
      reject(new Error(`请求超时（${timeoutMs/1000}秒）`));
    }, timeoutMs);
  });
  
  try {
    const response = await Promise.race([
      fetch(url, { ...options, signal }),
      timeoutPromise
    ]) as Response;
    return response;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`请求超时（${timeoutMs/1000}秒）`);
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  // 记录请求开始时间
  const startTime = Date.now();
  let hasImage = false;
  let requestType = "纯文本请求";
  let userId: string | null = null; // 用户ID
  let creditsDeducted = false; // 标记是否已扣除点数
  let apiRequestSent = false; // 标记是否已发送API请求

  try {
    // 获取当前认证用户
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "用户未认证" }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    
    userId = user.id;

    // 获取并记录API配置
    const { apiUrl, apiKey, model, isConfigComplete } = getEffectiveApiConfig();
    
    // 如果配置不完整，返回错误
    if (!isConfigComplete) {
      return new Response(JSON.stringify({ 
        error: "API配置不完整，请检查环境变量或设置备用配置",
        imageUrl: "https://placehold.co/512x512/red/white?text=API+Configuration+Error"
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    
    const body = await request.json();
    const { prompt, image, style } = body;

    // 记录请求是否包含图片
    hasImage = !!image;
    requestType = hasImage ? "带图片请求" : "纯文本请求";
    
    console.log(`[${requestType}] 开始处理, 时间: ${new Date().toISOString()}`);

    if (!prompt) {
      return new Response(JSON.stringify({ error: "提示词不能为空" }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    console.log(`[${requestType}] 接收到图像生成请求:`, { prompt, hasImage, style });

    // 在扣除用户点数前先检查点数记录是否存在，如果不存在则创建
    const supabaseAdmin = await createAdminClient();
    const { data: existingCredits, error: checkError } = await supabaseAdmin
      .from('ai_images_creator_credits')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (checkError) {
      console.error(`[${requestType}] 检查用户点数记录失败:`, checkError);
    }

    if (!existingCredits) {
      console.log(`[${requestType}] 用户点数记录不存在，创建初始记录`);
      // 如果不存在点数记录，创建一个初始记录
      const { error: insertError } = await supabaseAdmin
        .from('ai_images_creator_credits')
        .insert({
          user_id: userId,
          credits: 5,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        
      if (insertError) {
        console.error(`[${requestType}] 创建用户点数记录失败:`, insertError);
        return new Response(JSON.stringify({ error: "创建用户点数记录失败" }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }
      
      console.log(`[${requestType}] 已成功创建用户点数初始记录，点数: 5`);
    }

    // 扣除用户点数
    const deductedSuccess = await updateUserCredits(userId, 'deduct', 1);
    
    if (!deductedSuccess) {
      console.error(`[${requestType}] 扣除用户点数失败`);
      return new Response(JSON.stringify({ error: "扣除用户点数失败，请重试" }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    
    // 标记已成功扣除点数
    creditsDeducted = true;
    console.log(`[${requestType}] 已扣除用户点数，用户ID: ${userId}`);

    // 如果使用测试模式，直接返回模拟图片URL
    if (USE_MOCK_MODE) {
      console.log("使用测试模式，返回模拟图片URL");
      await delay(2000);
      
      // 根据提示词内容生成对应的模拟图片
      const userPrompt = prompt.toLowerCase();
      let imageColor = "lightblue";
      let imageText = encodeURIComponent(prompt.slice(0, 30));
      
      // 根据提示词内容调整颜色
      if (userPrompt.includes("红") || userPrompt.includes("热情")) {
        imageColor = "lightcoral";
      } else if (userPrompt.includes("绿") || userPrompt.includes("自然")) {
        imageColor = "lightgreen";
      } else if (userPrompt.includes("黄") || userPrompt.includes("温暖")) {
        imageColor = "lightyellow";
      } else if (userPrompt.includes("蓝") || userPrompt.includes("冷静")) {
        imageColor = "lightblue";
      } else if (userPrompt.includes("紫") || userPrompt.includes("神秘")) {
        imageColor = "lavender";
      }
      
      // 构建模拟图片URL
      const mockImageUrl = `https://placehold.co/512x512/${imageColor}/black?text=${imageText}`;
      
      // 保存历史记录
      await saveImageHistory(userId, mockImageUrl, prompt, "mock-model", { style });
      
      return new Response(JSON.stringify({ imageUrl: mockImageUrl }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    // 实际API请求处理
    let responseImageUrl: string | null = null;

    try {
      // 增强提示词
      const enhancedPrompt = `${prompt}。请直接生成一张与描述相符的图片，不要包含任何文字说明，只返回一个图片链接。`;
      
      // 准备消息内容
      const messages: { role: string; content: MessageContent[] }[] = [{
        role: "user",
        content: [{ type: "text", text: enhancedPrompt }]
      }];

      // 如果有图片，添加到请求中
      if (image) {
        let imageUrl = image;
        
        if (!image.startsWith('data:image/')) {
          console.log(`[${requestType}] 图片不是有效的data:URL格式，使用工具函数处理...`);
          imageUrl = addBase64Prefix(image);
          console.log(`[${requestType}] 处理后的图片URL前缀:`, imageUrl.substring(0, 50) + "...");
        }
        
        // 估算原始图片大小
        const originalSize = estimateBase64Size(imageUrl);
        console.log(`[${requestType}] 原始图片大小: ${(originalSize / 1024).toFixed(2)}KB`);
        
        // 如果图片大于1MB，进行压缩
        if (originalSize > 1024 * 1024) {
          console.log(`[${requestType}] 图片大于1MB，开始压缩...`);
          const compressionStart = Date.now();
          
          // 压缩图片
          imageUrl = await compressImageServer(
            imageUrl,
            MAX_IMAGE_WIDTH,
            MAX_IMAGE_HEIGHT,
            IMAGE_QUALITY
          );
          
          // 压缩后大小
          const compressedSize = estimateBase64Size(imageUrl);
          console.log(`[${requestType}] 压缩后图片大小: ${(compressedSize / 1024).toFixed(2)}KB, 压缩比: ${(compressedSize / originalSize * 100).toFixed(1)}%, 耗时: ${Date.now() - compressionStart}ms`);
        }
        
        // 将图片添加到消息中
        messages[0].content.unshift({
          type: "image_url",
          image_url: { url: imageUrl }
        });
      }
      
      // 准备OpenAI客户端配置
      const openaiOptions: any = {
        baseURL: apiUrl,
        apiKey: apiKey,
        timeout: TIMEOUT,
        maxRetries: MAX_RETRIES
      };
      
      // 记录代理设置
      console.log(`[${requestType}] 当前代理设置: HTTP_PROXY=${process.env.HTTP_PROXY || '未设置'}, HTTPS_PROXY=${process.env.HTTPS_PROXY || '未设置'}`);
      // 确保代理设置有效 
      if (!process.env.HTTP_PROXY && !process.env.HTTPS_PROXY) {
        console.log(`[${requestType}] 未检测到代理设置，将尝试使用默认代理`);
        // 设置默认代理（如果没有配置代理环境变量）
        process.env.HTTP_PROXY = 'http://127.0.0.1:7890';
        process.env.HTTPS_PROXY = 'http://127.0.0.1:7890';
      }

      // 创建OpenAI客户端
      const openai = new OpenAI(openaiOptions);
      
      // 配置超时设置
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), TIMEOUT);
      
      console.log(`[${requestType}] 发送API请求中，开始时间: ${new Date().toISOString()}`);
      apiRequestSent = true;

      // 使用带超时的请求
      let completion;
      try {
        // 开始计时
        const requestStart = Date.now();
        
        // 发送API请求
        const response = await openai.chat.completions.create({
          model: model,
          messages: [
            {
              role: "user",
              content: messages[0].content
            }
          ],
          max_tokens: 4096,
          stream: false
        });
        
        // 计算请求耗时
        const requestTime = Date.now() - requestStart;
        requestStats.recordTime(requestTime, hasImage);
        console.log(`[${requestType}] 请求完成，耗时: ${requestTime}ms`);
        
        // 检查响应是否为空
        if (!response.choices || !response.choices[0] || !response.choices[0].message) {
          console.error(`[${requestType}] API返回数据格式不符合预期:`, response);
          throw new Error("API返回数据格式不符合预期");
        }
        
        // 提取返回内容
        const content = response.choices[0].message.content;
        if (!content) {
          console.error(`[${requestType}] API返回内容为空`);
          throw new Error("API返回内容为空");
        }
        
        console.log(`[${requestType}] API返回原始内容:`, content);
        
        // 提取图片URL
        responseImageUrl = extractImageUrl(content);
        
        if (!responseImageUrl) {
          console.error(`[${requestType}] 无法从API响应中提取图片URL或API返回了错误信息`);
          
          // 如果点数已扣除，尝试退还
          if (creditsDeducted) {
            const refundSuccess = await updateUserCredits(userId!, 'add', 1);
            console.log(`[${requestType}] 图片生成失败，尝试退还点数: ${refundSuccess ? '成功' : '失败'}`);
          }
          
          return new Response(JSON.stringify({ 
            error: "图片生成失败，API无法生成有效图片或返回了错误信息，点数已退还" 
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
            },
          });
        }
        
        console.log(`[${requestType}] 成功提取图片URL:`, responseImageUrl);
        
        // 验证URL是否为有效的图片URL，而不是占位图
        if (responseImageUrl.includes("placehold.co")) {
          console.error(`[${requestType}] 提取到的是占位图URL，不是有效的图片`);
          
          // 如果点数已扣除，尝试退还
          if (creditsDeducted) {
            const refundSuccess = await updateUserCredits(userId!, 'add', 1);
            console.log(`[${requestType}] 图片生成失败，尝试退还点数: ${refundSuccess ? '成功' : '失败'}`);
          }
          
          return new Response(JSON.stringify({ 
            error: "图片生成失败，无法生成有效图片，点数已退还" 
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
            },
          });
        }
        
        // 保存历史记录
        await saveImageHistory(userId, responseImageUrl, prompt, model, { style });
        
        // 清除超时计时器
        clearTimeout(timeoutId);
        
        console.log(`[${requestType}] API请求完成，结束时间: ${new Date().toISOString()}`);
        
        // 返回成功响应
        return new Response(JSON.stringify({ imageUrl: responseImageUrl }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
      } catch (error: any) {
        // 清除超时计时器
        clearTimeout(timeoutId);
        
        // 处理中断或超时
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
          console.error(`[${requestType}] API请求超时或被中断`);
          
          // 退还用户点数
          if (creditsDeducted && userId) {
            const refundSuccess = await updateUserCredits(userId, 'add', 1);
            if (refundSuccess) {
              console.log(`[${requestType}] 由于请求超时，已退还用户点数，用户ID: ${userId}`);
            } else {
              console.error(`[${requestType}] 退还用户点数失败，用户ID: ${userId}`);
            }
          }
          
          return new Response(JSON.stringify({ 
            error: "图像生成请求超时，已自动退还点数。请稍后重试。",
            creditsRefunded: true
          }), {
            status: 504,
            headers: {
              'Content-Type': 'application/json',
            },
          });
        }
        
        // 处理其他错误
        const { errorType, message } = handleApiError(error);
        console.error(`[${requestType}] API请求失败，错误类型: ${errorType}, 错误信息: ${message}`);
        
        // 退还用户点数
        if (creditsDeducted && userId) {
          const refundSuccess = await updateUserCredits(userId, 'add', 1);
          if (refundSuccess) {
            console.log(`[${requestType}] 由于API错误，已退还用户点数，用户ID: ${userId}`);
          } else {
            console.error(`[${requestType}] 退还用户点数失败，用户ID: ${userId}`);
          }
        }
        
        // 根据错误类型返回不同的错误图片和消息
        let errorImageUrl = "https://placehold.co/512x512/red/white?text=API+Error";
        
        if (errorType === "quota_exceeded") {
          errorImageUrl = QUOTA_EXCEEDED_IMAGE;
        } else if (errorType === "invalid_token") {
          errorImageUrl = INVALID_TOKEN_IMAGE;
        }
        
        return new Response(JSON.stringify({ 
          error: message,
          errorType: errorType,
          imageUrl: errorImageUrl,
          creditsRefunded: true
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }
      
    } catch (error: any) {
      // 记录错误并计算处理时间
      const processingTime = Date.now() - startTime;
      console.error(`[${requestType}] 处理失败，耗时: ${processingTime}ms, 错误:`, error);
      
      // 如果已扣除点数但请求失败，退还点数
      if (creditsDeducted && userId) {
        const refundSuccess = await updateUserCredits(userId, 'add', 1);
        if (refundSuccess) {
          console.log(`[${requestType}] 由于请求处理失败，已退还用户点数，用户ID: ${userId}`);
        } else {
          console.error(`[${requestType}] 退还用户点数失败，用户ID: ${userId}`);
        }
      }
      
      // 返回错误响应
      return new Response(JSON.stringify({ 
        error: error.message || "图像生成失败",
        creditsRefunded: creditsDeducted
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    
  } catch (error: any) {
    // 记录错误并计算处理时间
    const processingTime = Date.now() - startTime;
    console.error(`[${requestType}] 处理失败，耗时: ${processingTime}ms, 错误:`, error);
    
    // 如果已扣除点数但请求失败，退还点数
    if (creditsDeducted && userId) {
      const refundSuccess = await updateUserCredits(userId, 'add', 1);
      if (refundSuccess) {
        console.log(`[${requestType}] 由于请求处理失败，已退还用户点数，用户ID: ${userId}`);
      } else {
        console.error(`[${requestType}] 退还用户点数失败，用户ID: ${userId}`);
      }
    }
    
    // 返回错误响应
    return new Response(JSON.stringify({ 
      error: error.message || "图像生成失败",
      creditsRefunded: creditsDeducted
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
} 