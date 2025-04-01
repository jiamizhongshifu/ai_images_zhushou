import { NextResponse } from "next/server";

// Tu-Zi API配置
const API_URL = "https://api.tu-zi.com/v1/chat/completions";
const API_TOKEN = "sk-jITadcbUQUAvg5vVb4XoVqPvabBKZ9ZrDB63GFvMfy7XudFG";
const MODEL = "gpt-4o-all";

// 网络请求配置
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 毫秒
const TIMEOUT = 60000; // 60秒超时

// 是否使用测试模式（返回模拟图片而不实际调用API）
// 如果API调用持续失败，可以设置为true进行功能测试
const USE_MOCK_MODE = false;
// 使用placehold.co作为更稳定的占位图服务
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
    // 添加超时
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
      console.log(`请求失败，${retries}秒后重试... 剩余重试次数: ${retries-1}`);
      await delay(RETRY_DELAY);
      return fetchWithRetry(url, options, retries - 1);
    } else {
      console.error("已达到最大重试次数，请求彻底失败:", error.message);
      throw new Error(`网络请求失败: ${error.message}`);
    }
  }
}

export async function POST(request: Request) {
  try {
    const { prompt, image, style } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: "提示词不能为空" }, { status: 400 });
    }

    console.log("接收到图像生成请求:", { prompt, hasImage: !!image, style });

    // 如果使用测试模式，直接返回模拟图片URL
    if (USE_MOCK_MODE) {
      console.log("使用测试模式，返回模拟图片URL");
      // 模拟延迟以模拟真实API调用
      await delay(2000);
      return NextResponse.json({ imageUrl: MOCK_IMAGE_URL });
    }

    // 准备请求内容
    const contentItems: MessageContent[] = [
      {
        type: "text",
        text: prompt,
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
        return NextResponse.json({ error: "图片太大，请使用小于6MB的图片" }, { status: 400 });
      }

      const imageContent: MessageContent = {
        type: "image_url",
        image_url: {
          url: imageUrl
        }
      };
      contentItems.push(imageContent);
    }

    // 准备请求数据 - 确保结构与PHP示例完全一致
    const requestData = {
      model: MODEL,
      stream: false,
      messages: [
        {
          role: "user",
          content: contentItems
        }
      ]
    };

    console.log("发送到Tu-Zi的请求数据结构:", JSON.stringify({
      model: requestData.model,
      stream: requestData.stream,
      messagesCount: requestData.messages.length,
      contentItemsCount: contentItems.length
    }));

    try {
      // 带重试的API调用
      console.log("开始调用Tu-Zi API...");
      const response = await fetchWithRetry(API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestData),
        cache: 'no-cache',
      });

      // 先获取响应文本
      const responseText = await response.text();
      console.log("Tu-Zi API响应状态:", response.status, response.statusText);
      
      // 记录响应头
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      console.log("Tu-Zi API响应头:", JSON.stringify(headers));
      
      // 记录响应数据（部分）
      console.log("Tu-Zi API响应数据(前200字符):", responseText.substring(0, 200));

      // 检查响应状态
      if (!response.ok) {
        console.error("Tu-Zi API返回错误状态码:", response.status);
        console.error("完整响应内容:", responseText);
        throw new Error(`Tu-Zi API调用失败 (${response.status}): ${responseText}`);
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

      // 处理响应，提取图片URL
      let imageUrl = null;
      if (data.choices && data.choices.length > 0) {
        const content = data.choices[0].message.content;
        console.log("提取到的内容:", content);
        
        // 使用与PHP示例相同的正则表达式提取图片URL
        const imgUrlMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
        if (imgUrlMatch && imgUrlMatch[1]) {
          imageUrl = imgUrlMatch[1];
          console.log("找到图片URL:", imageUrl);
        } else {
          // 尝试其他可能的提取方式
          console.log("无法使用标准Markdown格式提取图片URL，尝试其他格式...");
          
          // 尝试使用简单的URL提取
          const urlMatch = content.match(/(https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp))/i);
          if (urlMatch && urlMatch[1]) {
            imageUrl = urlMatch[1];
            console.log("使用简单URL匹配找到图片:", imageUrl);
          } else {
            console.error("所有URL提取方法都失败。完整内容:", content);
          }
        }
      } else {
        console.error("API响应中没有choices数据:", data);
      }

      if (!imageUrl) {
        throw new Error("未能从响应中提取到图片URL");
      }

      // 返回生成的图片URL
      return NextResponse.json({ imageUrl });
    } catch (fetchError: any) {
      console.error("API调用过程中出错:", fetchError);
      throw new Error(`调用Tu-Zi API失败: ${fetchError.message}`);
    }
    
  } catch (error: any) {
    console.error("图片生成失败:", error);
    
    // 提供更详细的错误信息
    let errorMessage = error.message || "未知错误";
    let errorDetails = error.stack || "";
    
    return NextResponse.json(
      { 
        error: `图片生成失败: ${errorMessage}`,
        details: errorDetails 
      },
      { status: 500 }
    );
  }
} 