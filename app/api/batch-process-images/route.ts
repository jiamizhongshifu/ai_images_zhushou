import { NextRequest, NextResponse } from 'next/server';
import { processAllTemporaryImageUrls } from '@/utils/image/persistImage';

// 日志工具
const logger = {
  info: (message: string) => console.log(`[批量处理API] ${message}`),
  error: (message: string) => console.error(`[批量处理API] ${message}`),
  warn: (message: string) => console.warn(`[批量处理API] ${message}`),
  debug: (message: string) => console.log(`[批量处理API] ${message}`)
};

/**
 * 批量处理图片URL的API端点
 * 用于定期执行的任务，将临时图片URL转存为持久化URL
 */
export async function POST(request: NextRequest) {
  try {
    // 检查是否是内部调用
    const isAuthorized = request.headers.get('authorization') === `Bearer ${process.env.TASK_PROCESS_SECRET_KEY}`;
    
    if (!isAuthorized) {
      logger.warn('未授权访问批量处理API');
      return NextResponse.json(
        { success: false, error: '未授权访问' },
        { status: 401 }
      );
    }
    
    // 获取请求参数
    const params = await request.json().catch(() => ({}));
    const { limit = 100, force = false } = params;
    
    logger.info(`开始批量处理图片URL，限制数量: ${limit}, 强制模式: ${force}`);
    
    // 执行批量处理
    const processedCount = await processAllTemporaryImageUrls();
    
    logger.info(`批量处理完成，成功处理 ${processedCount} 个URL`);
    
    // 返回处理结果
    return NextResponse.json({
      success: true,
      processedCount,
      failedCount: 0, // 当前实现中失败的URL不会计数，默认为0
      hasMore: processedCount >= limit, // 如果处理数量达到限制，可能还有更多
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`批量处理图片URL失败: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { 
        success: false, 
        error: '批量处理失败',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
} 