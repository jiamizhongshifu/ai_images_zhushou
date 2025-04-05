import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { handleError, ErrorLevel } from '@/utils/error-handler';
import { withPaymentRetry, processBatchOrders } from '@/utils/payment-retry';

/**
 * 定时任务：自动检查并修复悬挂的支付订单
 * 
 * 查询参数：
 * - key: 安全密钥，必须匹配环境变量 TASK_PROCESS_SECRET_KEY
 * - hours: 要检查的小时数，默认为1（即检查1小时内的未完成订单）
 * - limit: 最多处理的订单数，默认为50
 * 
 * 返回：
 * - 处理结果摘要
 */
export async function GET(request: NextRequest) {
  try {
    // 验证安全密钥
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    
    if (!key || key !== process.env.TASK_PROCESS_SECRET_KEY) {
      console.warn('定时任务API访问：密钥验证失败');
      
      return NextResponse.json({
        success: false,
        error: '无效的访问密钥'
      }, { status: 403 });
    }
    
    // 获取参数
    const hours = parseInt(searchParams.get('hours') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    
    // 获取当前时间和截止时间
    const now = new Date();
    const checkBeforeTime = new Date(now.getTime() - (hours * 60 * 60 * 1000));
    const checkBeforeTimeString = checkBeforeTime.toISOString();
    
    console.log(`开始处理 ${checkBeforeTimeString} 后的未完成订单，最多处理 ${limit} 条`);
    
    // 创建数据库管理客户端
    const adminClient = createAdminClient();
    
    // 1. 查询未完成的订单
    const { data: pendingOrders, error: queryError } = await adminClient
      .from('ai_images_creator_payments')
      .select('order_no, user_id, created_at, amount, credits')
      .eq('status', 'pending')
      .gt('created_at', checkBeforeTimeString)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (queryError) {
      throw new Error(`查询未完成订单失败: ${queryError.message}`);
    }
    
    // 如果没有待处理的订单，直接返回
    if (!pendingOrders || pendingOrders.length === 0) {
      return NextResponse.json({
        success: true,
        message: '没有需要处理的悬挂订单'
      });
    }
    
    console.log(`找到 ${pendingOrders.length} 个未完成的订单，即将开始处理`);
    
    // 提取订单号列表
    const orderNos = pendingOrders.map(order => order.order_no);
    
    // 记录任务开始日志
    await logTaskExecution('fix-pending-orders', 'start', {
      orderCount: pendingOrders.length,
      orders: orderNos,
      queryParams: {
        hours,
        limit
      }
    });
    
    // 2. 批量处理订单，使用新的批处理功能
    const result = await processBatchOrders(
      orderNos,
      // 单个订单处理函数
      async (orderNo) => {
        console.log(`正在处理订单: ${orderNo}`);
        const response = await fetch(
          `${getServerBaseUrl(request)}/api/payment/fix-public?order_no=${orderNo}`,
          { method: 'GET' }
        );
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`处理订单 ${orderNo} 失败: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(`处理订单 ${orderNo} 失败: ${data.error || '未知错误'}`);
        }
        
        console.log(`成功处理订单 ${orderNo}: ${JSON.stringify(data.result)}`);
        return data.result;
      },
      // 批处理配置
      {
        concurrency: 3, // 最多同时处理3个订单
        onProgress: (orderNo, result, completed, total) => {
          const status = result.success ? '✅ 成功' : '❌ 失败';
          console.log(`[${completed}/${total}] 处理订单 ${orderNo} ${status}`);
        }
      }
    );
    
    // 记录任务完成日志
    await logTaskExecution('fix-pending-orders', 'complete', {
      orderCount: pendingOrders.length,
      processedCount: result.successful + result.failed,
      successfulCount: result.successful,
      failedCount: result.failed,
      results: result.results
    });
    
    // 返回处理结果
    return NextResponse.json({
      success: true,
      message: `共处理了 ${result.total} 个订单，成功 ${result.successful} 个，失败 ${result.failed} 个`,
      processingResults: result.results
    });
  } catch (error) {
    // 记录错误
    console.error('定时任务异常:', error);
    
    // 使用统一的错误处理机制
    const errorInfo = handleError(
      error,
      '定时任务-修复未完成订单',
      { request: request.url },
      ErrorLevel.ERROR
    );
    
    try {
      // 记录任务失败日志
      await logTaskExecution('fix-pending-orders', 'error', {
        error: errorInfo
      });
    } catch (logError) {
      console.error('记录任务失败日志出错:', logError);
    }
    
    // 返回错误信息
    return NextResponse.json({
      success: false,
      error: errorInfo.message,
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}

/**
 * 获取服务器基本URL
 */
function getServerBaseUrl(request: NextRequest): string {
  // 生产环境使用环境变量定义的URL
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  
  // 开发环境根据请求推断
  const proto = request.headers.get('x-forwarded-proto') || 'http';
  const host = request.headers.get('host') || 'localhost:3000';
  
  return `${proto}://${host}`;
}

/**
 * 记录任务执行日志
 */
async function logTaskExecution(
  taskName: string,
  status: 'start' | 'complete' | 'error',
  data: any
): Promise<void> {
  try {
    const adminClient = createAdminClient();
    
    await adminClient
      .from('ai_images_creator_task_logs')
      .insert({
        task_name: taskName,
        status,
        data,
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.error('记录任务执行日志失败:', error);
    // 记录失败不影响主流程，只记录错误日志
  }
} 