// 确保环境变量加载
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// 加载环境变量
function loadEnv() {
  // 项目根目录的.env文件路径
  const envPath = path.resolve(process.cwd(), '.env');
  
  // 检查.env文件是否存在
  if (fs.existsSync(envPath)) {
    console.log('[环境变量] 加载.env文件:', envPath);
    
    // 解析.env文件并设置环境变量
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    
    // 将解析的环境变量设置到process.env中
    for (const key in envConfig) {
      if (Object.prototype.hasOwnProperty.call(envConfig, key)) {
        process.env[key] = envConfig[key];
        console.log(`[环境变量] 设置 ${key}=${envConfig[key].substring(0, 3)}...`);
      }
    }
    
    console.log('[环境变量] .env文件加载完成');
    
    // 验证关键环境变量
    validateEnv();
  } else {
    console.warn('[环境变量] 警告: .env文件不存在');
  }
}

// 验证关键环境变量
function validateEnv() {
  const requiredEnvVars = ['TUZI_API_KEY', 'TUZI_BASE_URL'];
  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.warn(`[环境变量] 警告: 以下环境变量未设置: ${missing.join(', ')}`);
  } else {
    console.log('[环境变量] 所有必需的环境变量已设置');
  }
  
  // 打印部分环境变量信息以确认（隐藏敏感信息）
  if (process.env.TUZI_API_KEY) {
    const apiKey = process.env.TUZI_API_KEY;
    const maskedKey = `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
    console.log(`[环境变量] TUZI_API_KEY=${maskedKey}`);
  }
  
  console.log(`[环境变量] TUZI_BASE_URL=${process.env.TUZI_BASE_URL || '未设置'}`);
  console.log(`[环境变量] TUZI_MODEL=${process.env.TUZI_MODEL || '未设置'}`);
}

// 立即执行环境变量加载
loadEnv();

module.exports = { loadEnv }; 