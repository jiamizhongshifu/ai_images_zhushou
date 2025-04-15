#!/usr/bin/env node

/**
 * 图片URL持久化处理脚本
 * 用于定期处理OpenAI等服务的临时URL，将其转存到Supabase存储
 * 
 * 使用方法:
 * 1. node scripts/process-temporary-urls.js
 * 或
 * 2. 设置为定时任务: 0 12 * * * node /path/to/scripts/process-temporary-urls.js
 *    (每12小时执行一次)
 */

// 导入必要的模块
require('dotenv').config();
const fetch = require('node-fetch');

// 日志工具
const logger = {
  info: (message) => console.log(`[临时URL处理] ${message}`),
  error: (message) => console.error(`[临时URL处理] ${message}`),
  warn: (message) => console.warn(`[临时URL处理] ${message}`),
  debug: (message) => console.log(`[临时URL处理] ${message}`)
};

async function main() {
  logger.info('开始处理临时图片URL...');
  
  // 当前应用URL
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const endpoint = `${appUrl}/api/batch-process-images`;
  
  try {
    // 调用批量处理API
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}`
      },
      body: JSON.stringify({
        limit: 100, // 一次处理100个任务
        force: false // 不强制处理非临时URL
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API请求失败: HTTP ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      logger.info(`成功处理 ${result.processedCount} 个临时URL`);
      logger.info(`失败 ${result.failedCount} 个`);
      
      if (result.processedCount > 0 && result.hasMore) {
        logger.info('还有更多临时URL需要处理，将在下次执行时处理');
      }
    } else {
      logger.error(`处理失败: ${result.error}`);
    }
  } catch (error) {
    logger.error(`执行过程中出错: ${error.message}`);
  }
  
  logger.info('处理完成');
}

// 执行主函数
main().catch(error => {
  logger.error(`脚本执行失败: ${error}`);
  process.exit(1);
}); 