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
  
  console.log(`[测试] 创建API客户端，使用BASE URL: ${baseURL}`);
  console.log(`[测试] API密钥状态: ${apiKey ? '已配置' : '未配置'} (长度: ${apiKey?.length || 0})`);
  
  if (!apiKey) {
    console.error('[测试] API密钥未配置，请检查环境变量OPENAI_API_KEY');
    throw new Error('API密钥未配置');
  }
  
  // 返回配置的客户端
  return new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
  });
}

export async function GET() {
  try {
    console.log('[测试] 开始测试API连接...');
    const apiClient = createApiClient();
    
    // 获取可用模型列表
    const modelResponse = await apiClient.models.list();
    const modelNames = modelResponse.data.map(model => model.id);
    
    // 检查是否包含DALL-E模型
    const hasDALLE = modelNames.some(name => name.includes('dall-e'));
    const dalleModels = modelNames.filter(name => name.includes('dall-e'));
    
    return NextResponse.json({
      status: 'success',
      message: 'API连接测试成功',
      modelCount: modelResponse.data.length,
      hasDALLE: hasDALLE,
      dalleModels: dalleModels,
      allModels: modelNames,
    });
  } catch (error) {
    console.error('[测试] API连接测试失败:', error);
    
    return NextResponse.json({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      suggestion: '请检查API密钥和BASE URL配置'
    }, { status: 500 });
  }
} 