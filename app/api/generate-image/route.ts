import { NextRequest } from 'next/server';
import { addBase64Prefix, estimateBase64Size, compressImageServer } from '@/utils/image/image2Base64';
import { OpenAI } from 'openai';
import { getApiConfig, logApiConfig } from '@/utils/env';

// 备用API配置（仅在环境变量不可用时使用）
const BACKUP_API_URL = "https://api.tu-zi.com/v1";
const BACKUP_API_KEY = "sk-RQiRhGQHfgT0Cjk7RQTZE8iNf192x6IdHKYlfWJfPVcNeChE";
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
  
  // 1. 尝试提取Markdown格式的图片URL
  const markdownMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  if (markdownMatch && markdownMatch[1]) {
    console.log("找到Markdown格式图片URL:", markdownMatch[1]);
    return markdownMatch[1];
  }

  // 2. 尝试提取直接URL格式（带图片扩展名）
  const directUrlMatch = content.match(/(https?:\/\/[^\s"']+\.(jpe?g|png|gif|webp|bmp))/i);
  if (directUrlMatch && directUrlMatch[1]) {
    console.log("找到直接图片URL:", directUrlMatch[1]);
    return directUrlMatch[1];
  }

  // 3. 尝试提取任何URL格式
  const anyUrlMatch = content.match(/(https?:\/\/[^\s"'<>]+)/i);
  if (anyUrlMatch && anyUrlMatch[1]) {
    console.log("找到任意URL:", anyUrlMatch[1]);
    return anyUrlMatch[1];
  }

  // 4. 如果内容不为空，使用文本内容生成占位图
  if (content.trim().length > 0) {
    const encodedText = encodeURIComponent(content.slice(0, 50) + "...");
    const placeholderUrl = `https://placehold.co/512x512/lightblue/black?text=${encodedText}`;
    console.log("使用文本内容生成占位图:", placeholderUrl);
    return placeholderUrl;
  }

  console.log("未找到任何可用的URL");
  return null;
}

// 获取API配置，优先使用环境变量，备用使用硬编码值
function getEffectiveApiConfig() {
  // 从环境变量获取配置
  const envConfig = getApiConfig();
  
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

export async function POST(request: NextRequest) {
  // 记录请求开始时间
  const startTime = Date.now();
  let hasImage = false;
  let requestType = "纯文本请求";

  try {
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
      return new Response(JSON.stringify({ imageUrl: mockImageUrl }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    // 准备请求内容
    const enhancedPrompt = `${prompt}。请直接生成一张与描述相符的图片，不要包含任何文字说明，只返回一个图片链接。`;
    
    const contentItems: MessageContent[] = [
      {
        type: "text",
        text: enhancedPrompt,
      }
    ];

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
        try {
          const compressStart = Date.now();
          
          // 压缩图片
          imageUrl = await compressImageServer(
            imageUrl, 
            MAX_IMAGE_WIDTH, 
            MAX_IMAGE_HEIGHT, 
            IMAGE_QUALITY
          );
          
          // 计算压缩后大小
          const compressedSize = estimateBase64Size(imageUrl);
          const compressTime = Date.now() - compressStart;
          
          console.log(`[${requestType}] 图片压缩完成，耗时: ${compressTime}ms`);
          console.log(`[${requestType}] 压缩前 ${(originalSize/1024).toFixed(2)}KB -> 压缩后 ${(compressedSize/1024).toFixed(2)}KB，压缩率: ${(100 - compressedSize/originalSize*100).toFixed(2)}%`);
        } catch (error) {
          console.warn(`[${requestType}] 图片压缩失败:`, error);
          // 压缩失败仍继续使用原图
        }
      }
      
      // 再次检查大小，确保不超过限制
      const finalSize = estimateBase64Size(imageUrl);
      console.log(`[${requestType}] 最终图片大小: ${(finalSize / 1024).toFixed(2)}KB`);
      
      if (finalSize > 6 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: "图片太大，请使用小于6MB的图片" }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }

      const imageContent: MessageContent = {
        type: "image_url",
        image_url: {
          url: imageUrl
        }
      };
      contentItems.unshift(imageContent);
    }

    try {
      console.log("开始调用API...", new Date().toISOString());
      
      // 使用环境变量或备用配置创建OpenAI客户端
      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: apiUrl,
        timeout: TIMEOUT, // 添加超时设置
        maxRetries: MAX_RETRIES, // 设置最大重试次数
      });
      
      console.log("OpenAI SDK初始化完成，开始调用...", new Date().toISOString());
      
      // 创建超时Promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`API请求超时 (${TIMEOUT/1000}秒)`)), TIMEOUT);
      });
      
      // 创建API调用Promise
      const apiCallPromise = openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: "system",
            content: "你是一个AI图像生成助手。用户会给你提供图像描述，你需要生成相应的图像。请直接返回图像URL，不要有任何解释文字。"
          },
          {
            role: "user",
            content: contentItems
          }
        ]
      });
      
      // 使用Promise.race竞争，谁先完成用谁的结果
      const response = await Promise.race([
        apiCallPromise,
        timeoutPromise
      ]) as any;
      
      console.log("API调用成功，开始处理响应...", new Date().toISOString());
      
      let imageUrl = null;
      if (response.choices && response.choices.length > 0) {
        const content = response.choices[0].message.content || "";
        console.log("API完整响应内容:", content);
        
        imageUrl = extractImageUrl(content);
      } else {
        console.error("API响应中没有choices数据:", response);
        imageUrl = "https://placehold.co/512x512/pink/white?text=Error:No+Choices+In+API+Response";
      }

      return new Response(JSON.stringify({ 
        imageUrl: imageUrl || "https://placehold.co/512x512/pink/white?text=Fallback+Image",
        apiResponse: response
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (error: any) {
      console.error(`[${requestType}] API调用过程中出错:`, error);
      
      const errorInfo = handleApiError(error);
      
      // 如果是配额不足或令牌无效，返回特定错误
      if (errorInfo.errorType === "quota_exceeded") {
        return new Response(JSON.stringify({ 
          imageUrl: QUOTA_EXCEEDED_IMAGE,
          error: errorInfo.message,
          errorType: errorInfo.errorType
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      } else if (errorInfo.errorType === "invalid_token") {
        return new Response(JSON.stringify({ 
          imageUrl: INVALID_TOKEN_IMAGE,
          error: errorInfo.message,
          errorType: errorInfo.errorType
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }
      
      return new Response(JSON.stringify({ 
        imageUrl: "https://placehold.co/512x512/red/white?text=API+Error",
        error: `调用API失败: ${errorInfo.message}`,
        errorType: errorInfo.errorType
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    
  } catch (error: any) {
    console.error(`[${requestType}] 图片生成失败:`, error);
    let errorMessage = error.message || "未知错误";
    
    return new Response(JSON.stringify({ 
      imageUrl: `https://placehold.co/512x512/orange/white?text=Error:${encodeURIComponent(errorMessage.slice(0, 50))}`,
      error: `图片生成失败: ${errorMessage}` 
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } finally {
    // 计算请求总耗时并记录
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    console.log(`[${requestType}] 请求处理完成, 总耗时: ${processingTime}ms`);
    
    // 记录到统计数据
    requestStats.recordTime(processingTime, hasImage);
  }
} 