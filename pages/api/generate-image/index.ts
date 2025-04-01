import type { NextApiRequest, NextApiResponse } from "next";

// API配置
const API_URL = process.env.OPENAI_BASE_URL + "/chat/completions";
const API_TOKEN = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-all";

// 网络请求配置
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 毫秒
const TIMEOUT = 60000; // 60秒超时

// 是否使用测试模式 - 临时设为true进行调试
const USE_MOCK_MODE = true;
const MOCK_IMAGE_URL = "https://placehold.co/512x512/pink/white?text=AI+Generated+Image";

// 定义消息内容类型
type MessageContent = 
  | { type: "text"; text: string } 
  | { type: "image_url"; image_url: { url: string } };

// 延时函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 带重试的fetch函数
async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  try {
    // 添加超时逻辑
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
    
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    if (retries > 0) {
      console.log(`请求失败，${RETRY_DELAY/1000}秒后重试... 剩余重试次数: ${retries-1}`);
      await delay(RETRY_DELAY);
      return fetchWithRetry(url, options, retries - 1);
    } else {
      console.error("已达到最大重试次数，请求彻底失败:", error.message);
      throw new Error(`网络请求失败: ${error.message}`);
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 仅允许POST请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '仅支持POST请求' });
  }

  try {
    const { prompt, image, style } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "提示词不能为空" });
    }

    console.log("接收到图像生成请求:", { prompt, hasImage: !!image, style });

    // 如果使用测试模式，直接返回模拟图片URL
    if (USE_MOCK_MODE) {
      console.log("使用测试模式，返回模拟图片URL");
      // 模拟延迟以模拟真实API调用
      await delay(2000);
      return res.status(200).json({ imageUrl: MOCK_IMAGE_URL });
    }

    // 准备请求内容 - 修改提示词，明确要求返回图片URL
    const enhancedPrompt = `${prompt}\n\n请生成一张图片，并以Markdown格式返回图片链接: ![image](https://example.com/image.jpg)`;
    
    const contentItems: MessageContent[] = [
      {
        type: "text",
        text: enhancedPrompt,
      }
    ];

    // 如果有图片，添加到请求中
    if (image) {
      // 确保图片URL格式正确
      // 图片数据应该是完整的data:URL格式，包括MIME类型和base64编码数据
      let imageUrl = image;
      
      // 确保图片URL遵循正确格式
      if (!image.startsWith('data:image/')) {
        console.log("图片不是有效的data:URL格式，尝试转换...");
        
        // 假设已经是base64编码，但没有前缀
        if (!image.startsWith('data:')) {
          // 尝试检测图像类型
          let imageType = 'image/png'; // 默认为PNG
          if (image.startsWith('/9j/')) {
            imageType = 'image/jpeg';
          } else if (image.startsWith('UklGR')) {
            imageType = 'image/webp';
          } else if (image.startsWith('iVBOR')) {
            imageType = 'image/png';
          } else if (image.startsWith('R0lGOD')) {
            imageType = 'image/gif';
          }
          
          imageUrl = `data:${imageType};base64,${image}`;
          console.log("添加前缀后的图片URL:", imageUrl.substring(0, 50) + "...");
        }
      }

      // 检查base64数据大小，太大可能导致请求失败
      const base64Data = imageUrl.split(',')[1] || '';
      const approximateSize = (base64Data.length * 3) / 4; // 估算字节大小
      console.log(`估计图片数据大小: ${(approximateSize / 1024).toFixed(2)}KB`);
      
      if (approximateSize > 6 * 1024 * 1024) {
        return res.status(400).json({ error: "图片太大，请使用小于6MB的图片" });
      }

      const imageContent: MessageContent = {
        type: "image_url",
        image_url: {
          url: imageUrl
        }
      };
      contentItems.unshift(imageContent); // 将图片放在前面
    }

    // 准备请求数据 - 使用特定的API指令修改
    const requestData = {
      model: MODEL,
      stream: false,
      messages: [
        {
          role: "system",
          content: "你是一个专业的图像生成助手。你的回复应该包含Markdown格式的图片链接: ![image](图片URL)"
        },
        {
          role: "user",
          content: contentItems
        }
      ]
    };

    console.log("发送请求:", JSON.stringify({
      model: requestData.model,
      stream: requestData.stream,
      messagesCount: requestData.messages.length,
      contentItemsCount: contentItems.length
    }));

    try {
      // 带重试的API调用
      console.log("开始调用API...");
      const response = await fetchWithRetry(API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestData),
        cache: 'no-cache',
      });

      // 获取响应文本
      const responseText = await response.text();
      console.log("API响应状态:", response.status, response.statusText);
      
      // 检查响应状态
      if (!response.ok) {
        console.error("API返回错误状态码:", response.status);
        console.error("完整响应内容:", responseText);
        throw new Error(`API调用失败 (${response.status}): ${responseText}`);
      }

      // 解析JSON响应
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (error) {
        console.error("解析响应JSON失败:", error);
        console.error("响应文本:", responseText);
        throw new Error("无法解析API响应数据");
      }

      // 处理响应，提取图片URL - 改进提取逻辑
      let imageUrl = null;
      if (data.choices && data.choices.length > 0) {
        const content = data.choices[0].message.content;
        console.log("API完整响应内容:", content);
        
        // 尝试多种模式匹配图片URL
        // 1. 标准Markdown格式
        const markdownMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
        if (markdownMatch && markdownMatch[1]) {
          imageUrl = markdownMatch[1];
          console.log("找到Markdown格式图片URL:", imageUrl);
        } 
        // 2. 直接URL格式（带图片扩展名）
        else {
          const directUrlMatch = content.match(/(https?:\/\/[^\s"']+\.(jpe?g|png|gif|webp|bmp))/i);
          if (directUrlMatch && directUrlMatch[1]) {
            imageUrl = directUrlMatch[1];
            console.log("找到直接图片URL:", imageUrl);
          }
          // 3. 任何URL格式（可能是图片服务）
          else {
            const anyUrlMatch = content.match(/(https?:\/\/[^\s"']+)/i);
            if (anyUrlMatch && anyUrlMatch[1]) {
              imageUrl = anyUrlMatch[1];
              console.log("找到任意URL (可能是图片):", imageUrl);
            }
            // 4. 如果依然没找到，返回一个备用图像
            else {
              console.log("无法提取任何URL，使用备用图像");
              imageUrl = "https://placehold.co/512x512/pink/white?text=Generated+Image";
            }
          }
        }
      } else {
        console.error("API响应中没有choices数据:", data);
        throw new Error("API响应格式异常，没有choices数据");
      }

      // 返回生成的图片URL
      return res.status(200).json({ imageUrl });
    } catch (fetchError: any) {
      console.error("API调用过程中出错:", fetchError);
      throw new Error(`调用API失败: ${fetchError.message}`);
    }
    
  } catch (error: any) {
    console.error("图片生成失败:", error);
    
    // 提供更详细的错误信息
    let errorMessage = error.message || "未知错误";
    
    return res.status(500).json({ 
      error: `图片生成失败: ${errorMessage}` 
    });
  }
}
