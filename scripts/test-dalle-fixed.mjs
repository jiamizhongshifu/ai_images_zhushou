#!/usr/bin/env node

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 创建readline接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 问题封装成Promise
function question(query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => resolve(answer));
  });
}

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

async function testGenerateImage() {
  try {
    console.log('图像生成测试工具（修复版）');
    console.log('----------------------');
    console.log('使用固定的gpt-4o-image-vip模型，忽略环境变量设置\n');
    
    // 获取提示词
    const defaultPrompt = '一朵美丽的红色玫瑰花';
    const prompt = process.argv[2] || await question(`请输入提示词 (默认: "${defaultPrompt}"): `) || defaultPrompt;
    
    console.log(`\n使用提示词: "${prompt}"`);
    console.log('正在生成图像...');
    
    // 调用修复后的API
    const startTime = Date.now();
    const response = await axios.post('http://localhost:3000/api/test/generate-image-fixed', {
      prompt: prompt
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const endTime = Date.now();
    
    if (response.data.status !== 'success') {
      throw new Error(response.data.error || '生成失败，未知错误');
    }
    
    console.log(`\n生成完成! 耗时: ${((endTime - startTime) / 1000).toFixed(2)}秒`);
    console.log(`使用模型: ${response.data.model}`);
    
    // 获取生成的图像URL
    const imageUrl = response.data.imageUrl;
    console.log(`图像URL: ${imageUrl}`);
    
    // 创建输出目录
    const outputDir = path.resolve(__dirname, '../output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 下载图像
    const timestamp = new Date().toISOString().replace(/[:.-]/g, '_');
    const outputFile = path.resolve(outputDir, `dalle_fixed_${timestamp}.png`);
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
  } finally {
    rl.close();
  }
}

testGenerateImage(); 