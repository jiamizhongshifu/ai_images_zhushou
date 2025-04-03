#!/usr/bin/env node

/**
 * 简单的OpenAI API测试脚本
 * 使用原生fetch API直接调用OpenAI接口
 * 不使用任何第三方依赖
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 确保能够正确解析相对路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 手动解析.env文件，不使用dotenv
function loadEnvFile() {
  try {
    const envPath = path.join(rootDir, '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    
    // 简单解析.env文件
    envContent.split('\n').forEach(line => {
      // 跳过空行和注释
      if (!line || line.startsWith('#')) return;
      
      // 匹配键值对
      const match = line.match(/^\s*([^=]+?)\s*=\s*(.*)\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2];
        
        // 移除引号
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.substring(1, value.length - 1);
        }
        
        envVars[key] = value;
      }
    });
    
    return envVars;
  } catch (error) {
    console.error('无法读取.env文件:', error.message);
    return {};
  }
}

// 加载环境变量
const env = loadEnvFile();

// 验证环境变量
const apiKey = env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('错误: OPENAI_API_KEY 环境变量未设置');
  process.exit(1);
}

// 检查密钥格式
if (apiKey.includes('\n') || apiKey.includes('\r')) {
  console.warn('警告: API密钥包含换行符，这可能导致问题');
}

// 显示密钥信息
console.log('===== API密钥信息 =====');
console.log(`密钥长度: ${apiKey.length}`);
console.log(`密钥前缀: ${apiKey.substring(0, 10)}...`);
console.log(`密钥后缀: ...${apiKey.substring(apiKey.length - 5)}`);
console.log('----------------------');

// 测试OpenAI模型列表API (不需要额外库)
async function testOpenAIModels() {
  console.log('=== 测试 OpenAI API 连接 ===');
  
  try {
    console.log('正在调用 OpenAI Models API...');
    const startTime = Date.now();
    
    // 添加超时检测
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
    
    try {
      // 简单使用fetch调用OpenAI API
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try {
          errorJson = JSON.parse(errorText);
        } catch (e) {
          errorJson = { raw: errorText };
        }
        
        throw new Error(`API请求失败: ${response.status} ${response.statusText}\n${JSON.stringify(errorJson, null, 2)}`);
      }
      
      const data = await response.json();
      
      console.log(`✅ API调用成功! 耗时: ${duration.toFixed(2)}秒`);
      console.log(`✅ 成功获取模型列表，共${data.data ? data.data.length : '未知'}个模型`);
      
      if (data.data && data.data.length > 0) {
        // 显示前5个模型
        console.log('模型示例:');
        data.data.slice(0, 5).forEach(model => {
          console.log(` - ${model.id}`);
        });
      }
      
      // 测试DALL-E API (简单版)
      console.log('\n正在测试DALL-E API...');
      await testDallE();
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
    
  } catch (error) {
    console.error('❌ API调用失败:', error.message);
    
    // 更多网络诊断
    if (error.name === 'AbortError') {
      console.error('❌ 请求超时：API调用超过30秒未响应');
    } else if (error.code === 'ENOTFOUND') {
      console.error('❌ 无法解析 OpenAI API 域名，请检查您的DNS设置');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('❌ 连接被拒绝，可能是防火墙或代理问题');
    } else if (error.code === 'ECONNRESET') {
      console.error('❌ 连接被重置，可能是网络不稳定');
    } else if (error.message && error.message.includes('authentication')) {
      console.error('❌ 可能是API密钥无效，请检查OPENAI_API_KEY环境变量是否正确设置');
    } else if (error.message && error.message.includes('timeout')) {
      console.error('❌ 请求超时，可能是网络问题');
    } 
    
    // 检查网络连通性
    console.log('\n正在检查网络连通性...');
    checkNetworkConnectivity();
  }
}

// 检查网络连通性
async function checkNetworkConnectivity() {
  try {
    console.log('尝试访问 google.com 以检查基本网络连接...');
    const googleResponse = await fetch('https://www.google.com', { 
      method: 'HEAD',
      timeout: 5000
    }).catch(err => {
      console.error('无法连接到 Google:', err.message);
      return null;
    });
    
    if (googleResponse) {
      console.log('✅ 成功连接到 Google，基本网络连接正常');
    } else {
      console.log('❌ 无法连接到 Google，可能存在网络连接问题');
    }
    
    console.log('尝试访问 openai.com 以检查 OpenAI 域名解析...');
    const openaiResponse = await fetch('https://openai.com', { 
      method: 'HEAD',
      timeout: 5000
    }).catch(err => {
      console.error('无法连接到 OpenAI 网站:', err.message);
      return null;
    });
    
    if (openaiResponse) {
      console.log('✅ 成功连接到 OpenAI 网站，域名解析正常');
    } else {
      console.log('❌ 无法连接到 OpenAI 网站，可能存在 DNS 或连接问题');
    }
    
    console.log('\n可能需要配置代理或网络设置才能访问 OpenAI API');
    console.log('如果您在中国内地，请检查是否需要配置代理服务');
  } catch (error) {
    console.error('网络检查过程中发生错误:', error.message);
  }
}

// 测试DALL-E图像生成
async function testDallE() {
  try {
    const startTime = Date.now();
    
    // 添加超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时 (图像生成可能需要更长时间)
    
    try {
      // 调用DALL-E 3 API
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: "一只小猫，简单的白色背景，测试图像",
          n: 1,
          size: "1024x1024"
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try {
          errorJson = JSON.parse(errorText);
        } catch (e) {
          errorJson = { raw: errorText };
        }
        
        throw new Error(`DALL-E API请求失败: ${response.status} ${response.statusText}\n${JSON.stringify(errorJson, null, 2)}`);
      }
      
      const data = await response.json();
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      
      console.log(`✅ DALL-E API调用成功! 耗时: ${duration.toFixed(2)}秒`);
      
      if (data.data && data.data.length > 0) {
        const imageUrl = data.data[0].url;
        console.log(`✅ 成功获取图像URL: ${imageUrl.substring(0, 60)}...`);
        
        // 保存URL到文件
        const resultsDir = path.join(rootDir, 'test-results');
        if (!fs.existsSync(resultsDir)) {
          fs.mkdirSync(resultsDir, { recursive: true });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const urlFilePath = path.join(resultsDir, `test-image-url-${timestamp}.txt`);
        fs.writeFileSync(urlFilePath, imageUrl);
        
        console.log(`✅ 图像URL已保存到: ${urlFilePath}`);
      } else {
        console.error('❌ DALL-E API调用成功但未返回图像数据:', data);
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (error) {
    console.error('❌ DALL-E API调用失败:', error.message);
    
    // 更详细的错误信息
    if (error.name === 'AbortError') {
      console.error('❌ 请求超时：DALL-E API调用超过60秒未响应');
    }
  }
}

// 执行测试
console.log('开始测试OpenAI API连接...');
testOpenAIModels()
  .then(() => {
    console.log('\n全部测试完成，请检查上述结果');
  })
  .catch(err => {
    console.error('测试过程中发生未处理的错误:', err);
  }); 