import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { getApiConfig } from '@/utils/env';

interface TuziConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  isConfigComplete: boolean;
}

// 创建OpenAI API客户端
function createApiClient() {
  // 获取环境配置
  const apiConfig = getApiConfig('tuzi') as TuziConfig;
  
  // 优先使用环境变量中的配置
  const apiKey = apiConfig.apiKey || process.env.OPENAI_API_KEY;
  const baseURL = apiConfig.apiUrl || process.env.OPENAI_BASE_URL || "https://api.tu-zi.com/v1";
  
  // 图像生成模型 - 按优先级获取
  // 1. 专用图像模型配置 OPENAI_IMAGE_MODEL
  // 2. 通用模型配置（如果不是文本聊天模型）
  // 3. 固定使用dall-e-3作为默认值
  const imageModel = process.env.OPENAI_IMAGE_MODEL || 
                     (process.env.OPENAI_MODEL && process.env.OPENAI_MODEL !== 'gpt-4o-all' ? process.env.OPENAI_MODEL : null) || 
                     "dall-e-3";
  
  console.log(`[测试] 创建API客户端，使用BASE URL: ${baseURL}`);
  console.log(`[测试] API密钥状态: ${apiKey ? '已配置' : '未配置'} (长度: ${apiKey?.length || 0})`);
  console.log(`[测试] 使用图像模型: ${imageModel}`);
  
  if (!apiKey) {
    console.error('[测试] API密钥未配置，请检查环境变量OPENAI_API_KEY');
    throw new Error('API密钥未配置');
  }
  
  // 返回配置的客户端和模型
  return {
    client: new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL,
    }),
    imageModel: imageModel
  };
}

export async function GET() {
  try {
    console.log('[测试] 开始测试DALL-E API连接...');
    const { client: apiClient, imageModel } = createApiClient();
    
    console.log(`[测试] 使用模型: ${imageModel} 生成图像`);
    
    // 尝试创建一个简单的图像生成请求
    const response = await apiClient.images.generate({
      model: imageModel,
      prompt: "一朵简单的红色玫瑰花",
      n: 1,
      size: "1024x1024",
      response_format: "url"
    });
    
    return NextResponse.json({
      status: 'success',
      message: 'DALL-E API连接测试成功',
      imageUrl: response.data[0].url,
      model: imageModel
    });
  } catch (error) {
    console.error('[测试] DALL-E API连接测试失败:', error);
    
    // 详细提取错误信息
    let errorMessage = '';
    let errorDetails = {};
    
    if (error instanceof Error) {
      errorMessage = error.message;
      // 尝试提取OpenAI错误详情
      if ('error' in (error as any)) {
        const openaiError = (error as any).error;
        errorDetails = {
          type: openaiError.type,
          code: openaiError.code,
          param: openaiError.param,
          message: openaiError.message
        };
      }
    } else {
      errorMessage = String(error);
    }
    
    return NextResponse.json({
      status: 'failed',
      error: errorMessage,
      details: errorDetails,
      model: process.env.OPENAI_MODEL || "dall-e-3",
      suggestion: '请检查API密钥、BASE URL配置和模型可用性'
    }, { status: 500 });
  }
} 