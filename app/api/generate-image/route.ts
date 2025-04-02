import { NextRequest } from 'next/server';
import { addBase64Prefix, estimateBase64Size } from '@/utils/image/image2Base64';
import { OpenAI } from 'openai';

// 直接配置Tu-Zi API（从.env文件中获取的值）
const API_URL = "https://api.tu-zi.com/v1";
const API_KEY = "sk-RQiRhGQHfgT0Cjk7RQTZE8iNf192x6IdHKYlfWJfPVcNeChE";
const MODEL = "gpt-4o-all";

// 网络请求配置
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 毫秒
const TIMEOUT = 180000; // 3分钟超时

// 关闭测试模式，使用真实API调用
const USE_MOCK_MODE = false;
const MOCK_IMAGE_URL = "https://placehold.co/512x512/pink/white?text=AI+Generated+Image";

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

// 开始API调用前记录完整信息
function logAPIInfo() {
  // 检查当前环境
  console.log("=== 环境信息 ===");
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`当前时间: ${new Date().toISOString()}`);
  
  console.log("=== API调用信息 ===");
  console.log(`API URL: ${API_URL}`);
  if (API_KEY) {
    console.log(`API KEY: ${API_KEY.substring(0, 4)}...${API_KEY.substring(API_KEY.length - 4)}`);
  } else {
    console.log("API KEY: 未设置");
  }
  console.log(`MODEL: ${MODEL}`);
  console.log(`测试模式: ${USE_MOCK_MODE ? "开启" : "关闭"}`);
  console.log("===================");
  
  return {
    apiUrl: API_URL,
    apiKey: API_KEY,
    model: MODEL,
    isConfigComplete: !!API_URL && !!API_KEY
  };
}

export async function POST(request: NextRequest) {
  try {
    // 记录API调用信息
    const { apiUrl, apiKey, model, isConfigComplete } = logAPIInfo();
    
    if (!isConfigComplete) {
      return new Response(JSON.stringify({ error: "API配置不完整" }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
    
    const body = await request.json();
    const { prompt, image, style } = body;

    if (!prompt) {
      return new Response(JSON.stringify({ error: "提示词不能为空" }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    console.log("接收到图像生成请求:", { prompt, hasImage: !!image, style });

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
        console.log("图片不是有效的data:URL格式，使用工具函数处理...");
        imageUrl = addBase64Prefix(image);
        console.log("处理后的图片URL前缀:", imageUrl.substring(0, 50) + "...");
      }

      const approximateSize = estimateBase64Size(imageUrl);
      console.log(`估计图片数据大小: ${(approximateSize / 1024).toFixed(2)}KB`);
      
      if (approximateSize > 6 * 1024 * 1024) {
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
      console.log("开始调用Tu-Zi API...");
      
      // 直接使用固定的Tu-Zi API密钥和URL
      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: apiUrl,
      });
      
      console.log("OpenAI SDK初始化完成，开始调用...");
      
      // 使用SDK进行API调用
      const response = await openai.chat.completions.create({
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
      
      console.log("API调用成功，开始处理响应...");
      
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
      console.error("API调用过程中出错:", error);
      
      const errorInfo = handleApiError(error);
      
      // 如果是配额不足或令牌无效，返回特定错误
      if (errorInfo.errorType === "quota_exceeded") {
        return new Response(JSON.stringify({ 
          imageUrl: `https://placehold.co/512x512/orange/black?text=API配额已用完`,
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
          imageUrl: `https://placehold.co/512x512/red/black?text=API密钥无效`,
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
    console.error("图片生成失败:", error);
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
  }
} 