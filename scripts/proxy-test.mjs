#!/usr/bin/env node

/**
 * 使用HTTP代理的OpenAI API测试脚本
 * 需要配置HTTP_PROXY环境变量
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Agent as HttpProxyAgent } from 'node:http';
import { Agent as HttpsProxyAgent } from 'node:https';

// 确保能够正确解析相对路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 手动解析.env文件
function loadEnvFile() {
  try {
    const envPath = path.join(rootDir, '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
      if (!line || line.startsWith('#')) return;
      const match = line.match(/^\s*([^=]+?)\s*=\s*(.*)\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2];
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

// 获取代理配置
function getProxyConfig() {
  // 首先检查环境变量
  const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || '';
  
  if (proxyUrl) {
    console.log(`已从环境变量中检测到代理配置: ${proxyUrl}`);
    return proxyUrl;
  }
  
  // 其次询问用户输入
  console.log('\n未检测到代理配置，请手动输入HTTP代理服务器地址');
  console.log('格式: http://127.0.0.1:7890 或 http://username:password@hostname:port');
  console.log('（按Enter键跳过代理设置）');
  
  // 使用ES模块方式导入readline
  return new Promise(async resolve => {
    // 动态导入readline
    const { createInterface } = await import('node:readline');
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    readline.question('代理地址: ', (answer) => {
      readline.close();
      if (answer && answer.trim()) {
        console.log(`使用用户输入的代理配置: ${answer.trim()}`);
        return resolve(answer.trim());
      }
      console.log('未提供代理配置，将尝试直接连接');
      resolve('');
    });
  });
}

// 创建HTTP/HTTPS请求代理
function createFetchOptions(proxyUrl) {
  if (!proxyUrl) return {};
  
  try {
    const url = new URL(proxyUrl);
    
    // 创建代理agent
    const httpAgent = new HttpProxyAgent({
      host: url.hostname,
      port: url.port,
      username: url.username,
      password: url.password
    });
    
    const httpsAgent = new HttpsProxyAgent({
      host: url.hostname,
      port: url.port,
      username: url.username,
      password: url.password
    });
    
    return {
      dispatcher: {
        dispatch: (options, handler) => {
          const agent = options.protocol === 'https:' ? httpsAgent : httpAgent;
          return agent.dispatch(options, handler);
        }
      }
    };
  } catch (error) {
    console.error('创建代理配置失败:', error.message);
    return {};
  }
}

// 主函数
async function main() {
  // 加载环境变量
  const env = loadEnvFile();
  
  // 验证API密钥
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('错误: OPENAI_API_KEY 环境变量未设置');
    process.exit(1);
  }
  
  // 显示API密钥信息
  console.log('===== API密钥信息 =====');
  console.log(`密钥长度: ${apiKey.length}`);
  console.log(`密钥前缀: ${apiKey.substring(0, 10)}...`);
  console.log(`密钥后缀: ...${apiKey.substring(apiKey.length - 5)}`);
  console.log('----------------------');
  
  // 获取代理配置
  const proxyUrl = await getProxyConfig();
  const fetchOptions = createFetchOptions(proxyUrl);
  
  // 测试OpenAI API
  await testOpenAIModels(apiKey, fetchOptions, proxyUrl);
}

// 测试OpenAI模型列表API
async function testOpenAIModels(apiKey, fetchOptions, proxyUrl) {
  console.log('\n=== 测试 OpenAI API 连接 ===');
  console.log(`${proxyUrl ? '使用代理: ' + proxyUrl : '直接连接 (无代理)'}`);
  
  try {
    console.log('正在调用 OpenAI Models API...');
    const startTime = Date.now();
    
    // 添加超时检测
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
    
    try {
      // 使用配置的代理调用API
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal,
        ...fetchOptions
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
      
      // 测试DALL-E API
      console.log('\n正在测试DALL-E API...');
      await testDallE(apiKey, fetchOptions);
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
    
  } catch (error) {
    console.error('❌ API调用失败:', error.message);
    
    if (error.name === 'AbortError') {
      console.error('❌ 请求超时：API调用超过30秒未响应');
    } else if (error.cause && error.cause.code === 'ENOTFOUND') {
      console.error('❌ 无法解析 OpenAI API 域名，请检查您的DNS设置');
    } else if (error.cause && error.cause.code === 'ECONNREFUSED') {
      console.error('❌ 连接被拒绝，可能是防火墙或代理问题');
    } else if (error.cause && error.cause.code === 'ECONNRESET') {
      console.error('❌ 连接被重置，可能是网络不稳定');
    } else if (error.message && error.message.includes('authentication')) {
      console.error('❌ 可能是API密钥无效');
    }
    
    if (!proxyUrl) {
      console.log('\n建议：');
      console.log('- 您可能需要配置HTTP代理才能访问OpenAI API');
      console.log('- 在终端设置环境变量后重试: export HTTP_PROXY=http://127.0.0.1:端口号');
      console.log('- 或者使用带有代理功能的VPN工具');
    } else {
      console.log('\n建议：');
      console.log('- 请检查您的代理配置是否正确');
      console.log('- 确认代理服务器是否正常运行');
      console.log('- 尝试其他代理服务器地址');
    }
  }
}

// 测试DALL-E图像生成
async function testDallE(apiKey, fetchOptions) {
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
        signal: controller.signal,
        ...fetchOptions
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
    
    if (error.name === 'AbortError') {
      console.error('❌ 请求超时：DALL-E API调用超过60秒未响应');
    }
  }
}

// 执行主函数
main().catch(err => {
  console.error('程序执行过程中发生未处理的错误:', err);
  process.exit(1);
}); 