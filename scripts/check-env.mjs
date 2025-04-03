#!/usr/bin/env node

/**
 * 环境变量检查脚本
 * 用于验证.env文件中的环境变量是否被正确读取
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 确保能够正确解析相对路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 加载环境变量
dotenv.config({ path: path.join(rootDir, '.env') });

// 检查并打印OPENAI_API_KEY
function checkApiKey() {
  console.log('=== 环境变量检查 ===');
  
  // 检查OPENAI_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.error('❌ OPENAI_API_KEY 未设置或读取失败');
  } else {
    // 只显示密钥的前10位和后5位，中间用星号代替
    const keyStart = openaiKey.substring(0, 10);
    const keyEnd = openaiKey.substring(openaiKey.length - 5);
    const maskedKey = `${keyStart}${'*'.repeat(20)}${keyEnd}`;
    
    console.log(`✅ OPENAI_API_KEY 已成功读取: ${maskedKey}`);
    console.log(`   长度: ${openaiKey.length} 字符`);
    
    // 检查密钥格式
    if (openaiKey.startsWith('sk-')) {
      console.log('✅ 密钥格式正确 (以 sk- 开头)');
    } else {
      console.warn('⚠️ 密钥格式异常 (未以 sk- 开头)');
    }
    
    // 检查是否有换行符或空格
    if (openaiKey.includes('\n') || openaiKey.includes('\r')) {
      console.error('❌ 警告: 密钥中包含换行符，可能导致API调用失败');
    }
    if (openaiKey.includes(' ')) {
      console.error('❌ 警告: 密钥中包含空格，可能导致API调用失败');
    }
  }
  
  // 检查其他API配置
  console.log('\n--- 其他相关API配置 ---');
  
  // 检查TUZI API配置
  const tuziKey = process.env.TUZI_API_KEY;
  const tuziBaseUrl = process.env.TUZI_BASE_URL;
  const tuziModel = process.env.TUZI_MODEL;
  const useTuziApi = process.env.USE_TUZI_API;
  
  console.log(`TUZI_API_KEY: ${tuziKey ? '✅ 已设置' : '❌ 未设置'}`);
  console.log(`TUZI_BASE_URL: ${tuziBaseUrl ? '✅ 已设置' : '❌ 未设置'}`);
  console.log(`TUZI_MODEL: ${tuziModel ? '✅ 已设置' : '❌ 未设置'}`);
  console.log(`USE_TUZI_API: ${useTuziApi !== undefined ? '✅ 已设置' : '❌ 未设置'} (值: ${useTuziApi})`);
  
  // 检查任务处理器配置
  const taskProcessKey = process.env.TASK_PROCESS_SECRET_KEY;
  console.log(`TASK_PROCESS_SECRET_KEY: ${taskProcessKey ? '✅ 已设置' : '❌ 未设置'}`);
  
  console.log('\n结论: ' + (openaiKey && !openaiKey.includes('\n') && !openaiKey.includes('\r') && !openaiKey.includes(' ') 
    ? '✅ OPENAI_API_KEY 配置正常，应该可以被正确读取' 
    : '❌ OPENAI_API_KEY 配置存在问题，可能无法被正确读取'));
}

// 执行检查
checkApiKey(); 