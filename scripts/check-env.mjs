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
  const tuziKey = process.env.OPENAI_API_KEY;
  const tuziBaseUrl = process.env.OPENAI_BASE_URL;
  const tuziModel = process.env.OPENAI_MODEL;
  const useTuziApi = process.env.USE_TUZI_API;
  
  console.log(`OPENAI_API_KEY: ${tuziKey ? '✅ 已设置' : '❌ 未设置'}`);
  console.log(`OPENAI_BASE_URL: ${tuziBaseUrl ? '✅ 已设置' : '❌ 未设置'}`);
  console.log(`OPENAI_MODEL: ${tuziModel ? '✅ 已设置' : '❌ 未设置'}`);
  console.log(`USE_TUZI_API: ${useTuziApi !== undefined ? '✅ 已设置' : '❌ 未设置'} (值: ${useTuziApi})`);
  
  // 检查任务处理器配置
  const taskProcessKey = process.env.TASK_PROCESS_SECRET_KEY;
  console.log(`TASK_PROCESS_SECRET_KEY: ${taskProcessKey ? '✅ 已设置' : '❌ 未设置'}`);
  
  console.log('\n结论: ' + (openaiKey && !openaiKey.includes('\n') && !openaiKey.includes('\r') && !openaiKey.includes(' ') 
    ? '✅ OPENAI_API_KEY 配置正常，应该可以被正确读取' 
    : '❌ OPENAI_API_KEY 配置存在问题，可能无法被正确读取'));
}

// 增加任务处理器认证检查
function checkTaskProcessAuth() {
  console.log('\n=== 任务处理器认证配置检查 ===');
  
  // 检查主要密钥
  const taskProcessKey = process.env.TASK_PROCESS_SECRET_KEY;
  const internalApiKey = process.env.INTERNAL_API_KEY;
  const apiSecretKey = process.env.API_SECRET_KEY;
  
  // 检查TASK_PROCESS_SECRET_KEY
  if (!taskProcessKey) {
    console.error('❌ TASK_PROCESS_SECRET_KEY 未设置，任务进度更新将失败');
  } else {
    // 掩码显示密钥
    const maskedKey = maskKey(taskProcessKey);
    console.log(`✅ TASK_PROCESS_SECRET_KEY 已设置: ${maskedKey}`);
    console.log(`   长度: ${taskProcessKey.length} 字符`);
  }
  
  // 检查备用密钥
  console.log('\n--- 备用认证密钥检查 ---');
  console.log(`INTERNAL_API_KEY: ${internalApiKey ? '✅ 已设置' : '❌ 未设置'}`);
  console.log(`API_SECRET_KEY: ${apiSecretKey ? '✅ 已设置' : '❌ 未设置'}`);
  
  // 综合评估
  const hasMainKey = !!taskProcessKey;
  const hasBackupKey = !!internalApiKey || !!apiSecretKey;
  
  console.log('\n认证配置评估:');
  if (hasMainKey) {
    console.log('✅ 主认证密钥已配置');
  } else if (hasBackupKey) {
    console.log('⚠️ 主认证密钥未配置，但有备用密钥可用');
  } else {
    console.log('❌ 严重错误: 所有认证密钥均未配置，任务进度更新将全部失败');
  }
  
  // 测试密钥一致性
  if (hasMainKey && hasBackupKey) {
    if (taskProcessKey === internalApiKey || (apiSecretKey && taskProcessKey === apiSecretKey)) {
      console.log('✅ 主密钥与至少一个备用密钥匹配，认证将正常工作');
    } else {
      console.warn('⚠️ 密钥不一致警告: 主密钥与备用密钥不匹配，建议使相同值以增强兼容性');
    }
  }
}

// 掩码显示密钥函数
function maskKey(key) {
  if (!key || key.length <= 8) return '***';
  const start = key.substring(0, 4);
  const end = key.substring(key.length - 4);
  return `${start}${'*'.repeat(Math.min(10, key.length - 8))}${end}`;
}

// 检查所有Supabase配置
function checkSupabaseConfig() {
  console.log('\n=== Supabase配置检查 ===');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  console.log(`NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? '✅ 已设置' : '❌ 未设置'}`);
  console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY: ${supabaseAnonKey ? '✅ 已设置' : '❌ 未设置'}`);
  console.log(`SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceKey ? '✅ 已设置' : '❌ 未设置'}`);
  
  if (supabaseUrl && supabaseAnonKey && supabaseServiceKey) {
    console.log('✅ Supabase配置完整');
  } else {
    console.error('❌ Supabase配置不完整，部分功能可能无法正常工作');
  }
}

// 主函数
function main() {
  console.log('=====================================================');
  console.log('🔍 开始检查环境变量配置');
  console.log('=====================================================\n');
  
  checkApiKey();
  checkTaskProcessAuth();
  checkSupabaseConfig();
  
  console.log('\n=====================================================');
  console.log('✨ 环境变量检查完成');
  console.log('=====================================================');
}

// 执行主函数
main(); 