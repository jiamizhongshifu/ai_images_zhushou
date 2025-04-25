#!/usr/bin/env node

import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 使用环境变量中的配置
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-image-1-vip';

if (!OPENAI_API_KEY) {
  console.error('错误: 环境变量缺失。请确保设置了OPENAI_API_KEY');
  process.exit(1);
}

// 创建OpenAI客户端
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
  baseURL: OPENAI_BASE_URL,
});

// 下载图片
async function downloadImage(url, filename) {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream'
    });
    
    const writer = fs.createWriteStream(filename);
    
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (error) {
    console.error('下载图片失败:', error.message);
    throw error;
  }
}

async function testDallE() {
  try {
    console.log('DALL-E API测试工具');
    console.log('------------------');
    console.log(`API端点: ${OPENAI_BASE_URL}`);
    console.log(`API密钥: ${OPENAI_API_KEY.substring(0, 5)}...${OPENAI_API_KEY.substring(OPENAI_API_KEY.length - 4)}`);
    console.log(`模型: ${OPENAI_MODEL}`);
    
    console.log('\n正在生成图像...');
    
    // 测试提示词
    const prompt = process.argv[2] || '一朵美丽的红色玫瑰花';
    
    console.log(`提示词: ${prompt}`);
    
    // 生成图像
    const startTime = Date.now();
    const response = await openai.images.generate({
      model: OPENAI_MODEL,
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      response_format: "url"
    });
    const endTime = Date.now();
    
    console.log(`\n生成完成! 耗时: ${((endTime - startTime) / 1000).toFixed(2)}秒`);
    
    // 输出结果
    const imageUrl = response.data[0].url;
    console.log(`图像URL: ${imageUrl}`);
    
    // 创建输出目录
    const outputDir = path.resolve(__dirname, '../output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 下载图像
    const timestamp = new Date().toISOString().replace(/[:.-]/g, '_');
    const outputFile = path.resolve(outputDir, `dalle_${timestamp}.png`);
    console.log(`\n正在下载图像到: ${outputFile}`);
    
    await downloadImage(imageUrl, outputFile);
    
    console.log('\n下载完成! 测试成功');
    
  } catch (error) {
    console.error('\n测试失败:', error.message);
    
    if (error.response) {
      console.error('API错误详情:');
      console.error(JSON.stringify(error.response.data, null, 2));
    }
    
    process.exit(1);
  }
}

testDallE(); 