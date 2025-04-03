#!/usr/bin/env node

/**
 * 测试 undici 库的导入和代理配置
 */

import path from 'path';

const HTTP_PROXY = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';

async function testUndici() {
  console.log('开始测试 undici 库...');
  console.log(`使用代理: ${HTTP_PROXY}`);
  
  // 尝试从不同路径导入
  try {
    console.log('1. 尝试直接导入 undici...');
    try {
      const undici = await import('undici');
      console.log('成功导入 undici!');
      console.log('导出的内容:', Object.keys(undici));
      
      if (undici.Agent) {
        console.log('Agent 类可用!');
        
        try {
          // 测试代理创建
          const proxyAgent = new undici.Agent({
            connect: {
              proxy: {
                uri: HTTP_PROXY
              }
            }
          });
          
          console.log('成功创建代理实例!', proxyAgent);
          
          // 测试使用代理发送请求
          console.log('尝试使用代理发送请求到 https://api.openai.com...');
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          
          const response = await fetch('https://api.openai.com/v1/models', {
            headers: {
              'Content-Type': 'application/json'
            },
            dispatcher: proxyAgent,
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          console.log(`响应状态: ${response.status}`);
          if (response.ok) {
            console.log('请求成功!');
            const data = await response.json();
            console.log('响应数据:', data);
          } else {
            console.log('请求失败，但连接成功');
            console.log('响应内容:', await response.text());
          }
        } catch (proxyError) {
          console.error('代理创建或请求失败:', proxyError);
        }
      } else {
        console.error('undici 中没有 Agent 类');
      }
    } catch (importErr) {
      console.error('直接导入 undici 失败:', importErr);
    }
    
    console.log('\n2. 尝试从本地路径导入...');
    try {
      const undiciPath = path.join(process.cwd(), 'node_modules', 'undici');
      console.log(`本地路径: ${undiciPath}`);
      
      const fileUrl = `file://${undiciPath}/index.js`;
      console.log(`文件URL: ${fileUrl}`);
      
      const undici = await import(fileUrl);
      console.log('成功从本地路径导入!');
      console.log('导出的内容:', Object.keys(undici));
      
      if (undici.Agent) {
        console.log('本地路径 Agent 类可用!');
      } else {
        console.error('本地导入中没有 Agent 类');
      }
    } catch (localErr) {
      console.error('从本地路径导入失败:', localErr);
    }
  } catch (error) {
    console.error('测试过程中出错:', error);
  }
}

// 执行测试
testUndici().catch(console.error); 