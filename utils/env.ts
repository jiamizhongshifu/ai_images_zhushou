/**
 * 环境变量加载与验证工具
 * 提供安全获取环境变量的函数，避免直接硬编码API密钥
 */

// 验证环境变量是否存在并返回其值
export function getEnv(name: string, defaultValue?: string): string {
  const value = process.env[name] || defaultValue;
  if (!value) {
    // 在开发环境下，如果环境变量不存在，输出警告
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`警告: 环境变量 ${name} 未设置`);
    }
  }
  return value || '';
}

// 获取API配置相关的环境变量
export function getApiConfig() {
  const apiUrl = getEnv('OPENAI_BASE_URL');
  const apiKey = getEnv('OPENAI_API_KEY');
  const model = getEnv('OPENAI_MODEL', 'gpt-4o-all');
  
  // 检查必要的环境变量是否存在
  const isConfigComplete = !!apiUrl && !!apiKey;
  
  return {
    apiUrl,
    apiKey, 
    model,
    isConfigComplete
  };
}

// 记录API配置信息的工具函数，隐藏敏感信息
export function logApiConfig(config: ReturnType<typeof getApiConfig>) {
  console.log("=== API配置信息 ===");
  console.log(`API URL: ${config.apiUrl || '未设置'}`);
  
  if (config.apiKey) {
    // 只显示密钥的前4位和后4位，中间用星号代替
    const keyPrefix = config.apiKey.substring(0, 4);
    const keySuffix = config.apiKey.substring(config.apiKey.length - 4);
    console.log(`API KEY: ${keyPrefix}...${keySuffix}`);
  } else {
    console.log("API KEY: 未设置");
  }
  
  console.log(`MODEL: ${config.model}`);
  console.log(`配置完整性: ${config.isConfigComplete ? '✅ 完整' : '❌ 不完整'}`);
  console.log("====================");
} 