import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { getApiConfig } from '@/utils/env';

interface TuziConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  isConfigComplete: boolean;
}

// 创建API客户端
function createApiClient() {
  // 获取环境配置
  const apiConfig = getApiConfig('tuzi') as TuziConfig;
  
  // 优先使用环境变量中的配置
  const apiKey = apiConfig.apiKey || process.env.OPENAI_API_KEY;
  const baseURL = apiConfig.apiUrl || process.env.OPENAI_BASE_URL || "https://api.tu-zi.com/v1/chat/completions";
  const model = process.env.OPENAI_MODEL || "gpt-4o-image-vip";
  
  console.log(`[测试生成] 创建API客户端，使用BASE URL: ${baseURL}`);
  console.log(`[测试生成] API密钥状态: ${apiKey ? '已配置' : '未配置'} (长度: ${apiKey?.length || 0})`);
  console.log(`[测试生成] 使用模型: ${model}`);
  
  if (!apiKey) {
    console.error('[测试生成] API密钥未配置，请检查环境变量OPENAI_API_KEY');
    throw new Error('API密钥未配置');
  }
  
  // 返回配置的客户端
  return new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
  });
}

export async function POST(request: NextRequest) {
  try {
    console.log('[测试生成] 开始测试图像生成...');
    
    // 从请求中获取prompt
    const { prompt } = await request.json().catch(() => ({ prompt: '一朵简单的红色玫瑰花' }));
    
    const finalPrompt = prompt || '一朵简单的红色玫瑰花';
    console.log(`[测试生成] 使用提示词: ${finalPrompt}`);
    
    const apiClient = createApiClient();
    
    // 使用当前环境中配置的模型生成图像
    const response = await apiClient.images.generate({
      model: process.env.OPENAI_MODEL || "dall-e-3",
      prompt: finalPrompt,
      n: 1,
      size: "1024x1024",
      response_format: "url"
    });
    
    console.log('[测试生成] 图像生成成功!');
    
    return NextResponse.json({
      status: 'success',
      message: '图像生成成功',
      imageUrl: response.data[0].url,
      model: process.env.OPENAI_MODEL || "dall-e-3"
    });
  } catch (error) {
    console.error('[测试生成] 图像生成失败:', error);
    
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
      model: process.env.OPENAI_MODEL || "dall-e-3"
    }, { status: 500 });
  }
} 