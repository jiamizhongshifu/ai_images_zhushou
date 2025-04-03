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

// 获取TUZI API配置相关的环境变量
export function getApiConfig() {
  // 优先使用TUZI专用的环境变量，如果不存在则回退到旧的OPENAI环境变量
  const apiUrl = getEnv('TUZI_BASE_URL') || getEnv('OPENAI_BASE_URL');
  const apiKey = getEnv('TUZI_API_KEY') || getEnv('OPENAI_API_KEY');
  const model = getEnv('TUZI_MODEL') || getEnv('OPENAI_MODEL', 'gpt-4o-all');
  
  // 检查必要的环境变量是否存在
  const isConfigComplete = !!apiUrl && !!apiKey;
  
  return {
    apiUrl,
    apiKey, 
    model,
    isConfigComplete
  };
}

// 获取OpenAI官方API配置
export function getOfficialOpenAIConfig() {
  const apiKey = getEnv('OPENAI_API_KEY');
  
  // 检查必要的环境变量是否存在
  const isConfigComplete = !!apiKey;
  
  return {
    apiKey,
    isConfigComplete
  };
}

// 获取API偏好设置
export function getApiPreference() {
  // 默认优先使用官方API，如果设置了USE_TUZI_API=true则使用TUZI
  const useTuziApi = getEnv('USE_TUZI_API', 'false').toLowerCase() === 'true';
  
  // 检查两种API配置是否完整
  const tuziConfig = getApiConfig();
  const openaiConfig = getOfficialOpenAIConfig();
  
  // 如果用户指定了TUZI API且配置完整，则使用TUZI
  if (useTuziApi && tuziConfig.isConfigComplete) {
    return {
      preferTuzi: true,
      tuziConfigComplete: tuziConfig.isConfigComplete,
      openaiConfigComplete: openaiConfig.isConfigComplete
    };
  }
  
  // 如果OpenAI官方API配置完整，优先使用官方API
  if (openaiConfig.isConfigComplete) {
    return {
      preferTuzi: false,
      tuziConfigComplete: tuziConfig.isConfigComplete,
      openaiConfigComplete: openaiConfig.isConfigComplete
    };
  }
  
  // 如果官方API不完整但TUZI配置完整，则使用TUZI
  if (tuziConfig.isConfigComplete) {
    return {
      preferTuzi: true,
      tuziConfigComplete: tuziConfig.isConfigComplete,
      openaiConfigComplete: openaiConfig.isConfigComplete
    };
  }
  
  // 两种配置都不完整，返回默认值
  return {
    preferTuzi: false,
    tuziConfigComplete: false,
    openaiConfigComplete: false
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