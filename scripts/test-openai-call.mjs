#!/usr/bin/env node

/**
 * OpenAI API调用测试脚本
 * 用于验证OPENAI_API_KEY是否可以正常调用API生成图像
 */

import dotenv from 'dotenv';
import { OpenAI } from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

// 确保能够正确解析相对路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 加载环境变量
dotenv.config({ path: path.join(rootDir, '.env') });

// 输出代理设置信息
console.log("环境变量中的代理设置:");
console.log(`HTTP_PROXY: ${process.env.HTTP_PROXY || '未设置'}`);
console.log(`HTTPS_PROXY: ${process.env.HTTPS_PROXY || '未设置'}`);
console.log(`http_proxy: ${process.env.http_proxy || '未设置'}`);
console.log(`https_proxy: ${process.env.https_proxy || '未设置'}`);

// 清空代理环境变量，确保我们只使用我们手动设置的代理
console.log("\n清空环境变量中的代理设置...");
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.http_proxy;
delete process.env.https_proxy;

// 手动创建代理Agent
const proxyUrl = "http://127.0.0.1:7890";
console.log(`\n将使用直接配置的代理: ${proxyUrl}`);

// 解析代理URL
const proxyUrlObj = new URL(proxyUrl);

// 创建HTTP和HTTPS代理
const httpAgent = new http.Agent();
const httpsAgent = new https.Agent();

// 验证环境变量
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('错误: OPENAI_API_KEY 环境变量未设置');
  process.exit(1);
}

// 创建自定义fetch方法，手动设置代理
const customFetch = async (url, options = {}) => {
  console.log(`正在请求: ${url} (使用手动配置的代理)`);
  
  // 手动添加代理请求头
  options.headers = options.headers || {};
  options.headers['Host'] = new URL(url).host;
  
  const proxyConnectOptions = {
    host: proxyUrlObj.hostname,
    port: proxyUrlObj.port || 7890,
    method: 'CONNECT',
    path: new URL(url).host
  };
  
  return new Promise((resolve, reject) => {
    // 使用原生fetch，但通过代理
    const originalFetch = fetch;
    
    // 我们直接使用环境变量方式设置代理，这是fetch的标准方式
    process.env.HTTP_PROXY = proxyUrl;
    process.env.HTTPS_PROXY = proxyUrl;
    
    originalFetch(url, options)
      .then(resolve)
      .catch(reject)
      .finally(() => {
        // 清空环境变量
        delete process.env.HTTP_PROXY;
        delete process.env.HTTPS_PROXY;
      });
  });
};

// 创建OpenAI客户端
const openai = new OpenAI({
  apiKey: apiKey,
  timeout: 60000, // 设置60秒超时
  maxRetries: 3,   // 最多重试3次
  fetch: customFetch // 使用自定义fetch方法
});

console.log("OpenAI客户端配置完成，使用直接配置的代理");

// 测试生成图像
async function testImageGeneration() {
  console.log('=== 测试 OpenAI API 图像生成 ===');
  console.log('创建 OpenAI 客户端...');
  
  try {
    console.log('正在调用 DALL-E API 生成测试图像...');
    console.log(`使用的API密钥: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 5)}`);
    
    const startTime = Date.now();
    
    // 调用图像生成API
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: "一只可爱的卡通猫，简单的白色背景，测试图像",
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "vivid"
    });
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log(`✅ API调用成功! 耗时: ${duration.toFixed(2)}秒`);
    
    if (response.data && response.data.length > 0) {
      const imageUrl = response.data[0].url;
      console.log(`✅ 成功获取图像URL: ${imageUrl}`);
      
      // 创建results目录
      const resultsDir = path.join(rootDir, 'test-results');
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }
      
      // 保存URL到文件
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const urlFilePath = path.join(resultsDir, `test-image-url-${timestamp}.txt`);
      fs.writeFileSync(urlFilePath, imageUrl);
      
      console.log(`✅ 图像URL已保存到: ${urlFilePath}`);
      console.log('您可以在浏览器中打开此URL查看生成的图像');
    } else {
      console.error('❌ API调用成功但未返回图像数据');
    }
  } catch (error) {
    console.error('❌ API调用失败:', error);
    
    // 输出详细错误信息
    if (error.response) {
      console.error('错误状态码:', error.response.status);
      console.error('错误响应数据:', error.response.data);
    } else if (error.message) {
      console.error('错误信息:', error.message);
    }
    
    // 检查常见错误
    if (error.message && error.message.includes('authentication')) {
      console.error('可能是API密钥无效，请检查OPENAI_API_KEY环境变量是否正确设置');
    } else if (error.message && error.message.includes('timeout')) {
      console.error('请求超时，可能是网络问题，请检查您的网络连接或代理设置');
    }
  }
}

// 执行测试
console.log('开始测试 OpenAI API...');
testImageGeneration()
  .then(() => {
    console.log('测试完成');
  })
  .catch(err => {
    console.error('测试过程中发生未处理的错误:', err);
  }); 