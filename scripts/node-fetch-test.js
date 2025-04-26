#!/usr/bin/env node

/**
 * 使用node-fetch测试OpenAI API连接
 * 支持HTTP代理
 */

const fs = require('fs');
const path = require('path');
const ProxyAgent = require('proxy-agent');
const fetch = require('node-fetch');

// 读取.env文件
function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
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
  
  // 获取代理URL
  const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || '';
  if (proxyUrl) {
    console.log(`使用代理: ${proxyUrl}`);
  } else {
    console.log('未使用代理，将直接连接');
  }
  
  // 创建代理代理
  const agent = proxyUrl ? new ProxyAgent(proxyUrl) : null;
  
  // 测试OpenAI API连接
  await testOpenAIModels(apiKey, agent);
}

// 测试OpenAI模型列表API
async function testOpenAIModels(apiKey, agent) {
  console.log('\n=== 测试 OpenAI API 连接 ===');
  
  try {
    console.log('正在调用 OpenAI Models API...');
    const startTime = Date.now();
    
    // 设置超时
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    // 调用API
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      agent,
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
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
    await testDallE(apiKey, agent);
    
  } catch (error) {
    console.error('❌ API调用失败:', error.message);
    
    // 检查具体错误类型
    if (error.name === 'AbortError') {
      console.error('❌ 请求超时：API调用超过30秒未响应');
    } else if (error.code === 'ENOTFOUND') {
      console.error('❌ 无法解析 OpenAI API 域名，请检查您的DNS设置');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('❌ 连接被拒绝，可能是防火墙或代理问题');
    } else if (error.code === 'ECONNRESET') {
      console.error('❌ 连接被重置，可能是网络不稳定');
    } else if (error.message && error.message.includes('authentication')) {
      console.error('❌ 可能是API密钥无效');
    }
  }
}

// 测试DALL-E图像生成
async function testDallE(apiKey, agent) {
  try {
    const startTime = Date.now();
    
    // 设置超时
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    
    // 调用API
    const response = await fetch(`${apiUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-image-vip",
        prompt: "可爱的卡通猫，简单白色背景，测试图像",
        n: 1,
        size: "1024x1024",
        response_format: "url"
      })
    });
    
    clearTimeout(timeout);
    
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
      
      throw new Error(`DALL-E API请求失败: ${response.status} ${response.statusText}\n${JSON.stringify(errorJson, null, 2)}`);
    }
    
    const data = await response.json();
    
    console.log(`✅ DALL-E API调用成功! 耗时: ${duration.toFixed(2)}秒`);
    
    if (data.data && data.data.length > 0) {
      const imageUrl = data.data[0].url;
      console.log(`✅ 成功获取图像URL: ${imageUrl.substring(0, 60)}...`);
      
      // 保存URL到文件
      const resultsDir = path.join(__dirname, '..', 'test-results');
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