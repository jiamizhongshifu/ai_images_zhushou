/**
 * 环境变量管理工具
 * 提供统一的环境变量获取和验证方法
 */

/**
 * 安全获取环境变量
 * @param name 环境变量名
 * @param defaultValue 默认值
 * @param required 是否必需
 * @returns 环境变量值或默认值
 * @throws 如果是必需的环境变量但未设置，会在开发环境抛出错误
 */
export function getEnv(
  name: string, 
  defaultValue: string = '', 
  required: boolean = false
): string {
  const value = process.env[name] || defaultValue;
  
  if (required && !value) {
    // 在开发环境抛出错误，生产环境记录警告
    if (process.env.NODE_ENV === 'development') {
      throw new Error(`必需的环境变量 ${name} 未设置`);
    } else {
      console.warn(`警告: 必需的环境变量 ${name} 未设置`);
    }
  }
  
  return value;
}

/**
 * 获取数据库连接配置
 * @returns 数据库连接配置对象
 */
export function getDbConfig() {
  return {
    url: getEnv('NEXT_PUBLIC_SUPABASE_URL', '', true),
    anonKey: getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '', true),
    serviceKey: getEnv('SUPABASE_SERVICE_ROLE_KEY', '', true)
  };
}

/**
 * 图资API配置接口
 */
export interface TuziConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  isConfigComplete: boolean;
}

/**
 * 安全配置类型
 */
type SecurityConfig = {
  cronApiKey: string;
  paymentWebhookSecret: string;
  maxRequestSize: number;
  maxUploadSize: number;
};

/**
 * 获取API安全与配置信息
 * @param type 可选的配置类型，默认为'security'
 * @returns API配置对象
 */
export function getApiConfig(type: 'security' | 'tuzi' | 'all' = 'security'): SecurityConfig | TuziConfig | {
  tuzi: TuziConfig;
  cronApiKey: string;
  paymentWebhookSecret: string;
  maxRequestSize: number;
  maxUploadSize: number;
} {
  // 基础安全配置
  const securityConfig: SecurityConfig = {
    cronApiKey: getEnv('CRON_API_KEY', ''),
    paymentWebhookSecret: getEnv('PAYMENT_WEBHOOK_SECRET', ''),
    maxRequestSize: parseInt(getEnv('MAX_REQUEST_SIZE', '10485760')), // 默认10MB
    maxUploadSize: parseInt(getEnv('MAX_UPLOAD_SIZE', '5242880')),   // 默认5MB
  };

  // 如果只需要安全配置，直接返回
  if (type === 'security') {
    return securityConfig;
  }

  // TUZI API配置
  const tuziConfig: TuziConfig = {
    apiKey: getEnv('OPENAI_API_KEY'),
    apiUrl: getEnv('OPENAI_BASE_URL') || 'https://api.tu-zi.com/v1',
    model: getEnv('OPENAI_MODEL') || getEnv('OPENAI_MODEL', 'gpt-4o-image-vip'),
    isConfigComplete: !!getEnv('OPENAI_API_KEY') && !!getEnv('OPENAI_BASE_URL')
  };
  
  // 检查TUZI配置完整性
  tuziConfig.isConfigComplete = !!tuziConfig.apiUrl && !!tuziConfig.apiKey;

  // 如果只需要TUZI配置，直接返回
  if (type === 'tuzi') {
    return tuziConfig;
  }

  // 返回所有配置
  return {
    ...securityConfig,
    tuzi: tuziConfig
  };
}

/**
 * 获取OpenAI官方API配置
 * @returns OpenAI配置对象
 */
export function getOfficialOpenAIConfig() {
  const apiKey = getEnv('OPENAI_API_KEY');
  
  // 检查必要的环境变量是否存在
  const isConfigComplete = !!apiKey;
  
  return {
    apiKey,
    isConfigComplete
  };
}

/**
 * 获取API偏好设置
 * @returns API偏好配置对象
 */
export function getApiPreference() {
  // 默认优先使用官方API，如果设置了USE_TUZI_API=true则使用TUZI
  const useTuziApi = getEnv('USE_TUZI_API', 'false').toLowerCase() === 'true';
  
  // 检查两种API配置是否完整
  const tuziConfig = getApiConfig('tuzi') as TuziConfig;
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

/**
 * 获取特定环境的变量值
 * 根据当前环境选择使用 development 或 production 的值
 * @param envVar 环境变量对象，包含dev和prod属性
 * @returns 当前环境对应的值
 */
export function getEnvValue<T>(envVar: { dev: T, prod: T }): T {
  const isProd = process.env.NODE_ENV === 'production';
  return isProd ? envVar.prod : envVar.dev;
}

/**
 * 检查是否为开发环境
 * @returns boolean 是否为开发环境
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * 检查必需的环境变量是否已设置
 * @param envVars 要检查的环境变量名数组
 * @returns 是否所有环境变量都已设置
 */
export function checkRequiredEnvVars(envVars: string[]): boolean {
  const missing = envVars.filter(name => !process.env[name]);
  
  if (missing.length > 0) {
    const message = `缺少必要的环境变量: ${missing.join(', ')}`;
    
    if (isDevelopment()) {
      throw new Error(message);
    } else {
      console.error(`警告: ${message}`);
    }
    
    return false;
  }
  
  return true;
}

/**
 * 验证必要的环境变量
 * 执行此函数以确保所有必要的环境变量都已设置
 */
export function validateRequiredEnvVars(): void {
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  
  checkRequiredEnvVars(requiredVars);
}

/**
 * 记录API配置信息的工具函数，隐藏敏感信息
 * @param config API配置对象
 */
export function logApiConfig(config: {apiUrl?: string, apiKey?: string, model?: string, isConfigComplete?: boolean}) {
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
  
  console.log(`MODEL: ${config.model || '未设置'}`);
  console.log(`配置完整性: ${config.isConfigComplete ? '✅ 完整' : '❌ 不完整'}`);
  console.log("====================");
} 