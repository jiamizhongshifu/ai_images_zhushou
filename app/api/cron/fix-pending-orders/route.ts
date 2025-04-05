import { NextRequest, NextResponse } from 'next/server';
import { createTransactionalAdminClient } from '@/utils/supabase/admin';
import { handleError, ErrorLevel } from '@/utils/error-handler';

/**
 * 定时任务API，用于自动检查并修复悬挂的支付订单
 * 
 * 查询参数:
 * - key: 安全密钥，必须匹配环境变量中的设置 (必填)
 * - hours: 查询几小时内的订单，默认24小时
 * - limit: 每次处理的订单数量，默认10条
 * 
 * 返回:
 * - success: 是否执行成功
 * - processed: 处理的订单数量
 * - results: 各订单处理结果
 */
export async function GET(request: NextRequest) {
  try {
    // 检查密钥，确保只有授权请求可以执行
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    
    // TASK_PROCESS_SECRET_KEY应在环境变量中设置
    if (key !== process.env.TASK_PROCESS_SECRET_KEY) {
      return NextResponse.json({
        success: false,
        error: '未授权访问'
      }, { status: 403 });
    }
    
    // 获取参数
    const hoursParam = url.searchParams.get('hours');
    const hours = hoursParam ? parseInt(hoursParam, 10) : 24;
    
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 10;
    
    // 查找指定时间范围内创建的pending订单
    const adminClient = await createTransactionalAdminClient();
    const now = new Date();
    // 至少1小时前创建的订单
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    // 不超过指定小时数
    const timeAgo = new Date(now.getTime() - hours * 60 * 60 * 1000);
    
    // 使用事务执行查询
    const pendingOrders = await adminClient.executeTransaction(async (client) => {
      // 查询符合条件的pending订单
      const { data, error } = await client
        .from('ai_images_creator_payments')
        .select('order_no')
        .eq('status', 'pending')
        .lt('created_at', oneHourAgo.toISOString()) // 至少1小时前创建
        .gt('created_at', timeAgo.toISOString())    // 不早于指定时间
        .limit(limit);
      
      if (error) {
        throw new Error(`查询悬挂订单失败: ${error.message}`);
      }
      
      return data || [];
    });
    
    if (pendingOrders.length === 0) {
      return NextResponse.json({
        success: true,
        message: '没有需要处理的悬挂订单'
      });
    }
    
    // 记录开始处理
    console.log(`开始处理${pendingOrders.length}条悬挂订单`);
    
    // 逐个检查并尝试修复
    const results = [];
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    
    for (const order of pendingOrders) {
      try {
        console.log(`处理订单 ${order.order_no}...`);
        
        // 调用修复接口
        const fixResponse = await fetch(
          `${siteUrl}/api/payment/fix-public?order_no=${order.order_no}`,
          { 
            method: 'GET',
            // 增加超时设置
            signal: AbortSignal.timeout(10000) // 10秒超时
          }
        );
        
        const responseText = await fixResponse.text();
        console.log(`订单 ${order.order_no} 响应: ${responseText.substring(0, 100)}...`);
        
        let fixResult;
        try {
          fixResult = JSON.parse(responseText);
        } catch (parseError) {
          console.error(`解析订单 ${order.order_no} 响应失败:`, parseError);
          results.push({
            order_no: order.order_no,
            success: false,
            error: `解析响应失败: ${parseError.message}，原始响应: ${responseText.substring(0, 200)}`
          });
          continue;
        }
        
        if (fixResponse.ok) {
          results.push({
            order_no: order.order_no,
            success: fixResult.success,
            result: fixResult.success ? fixResult.result : fixResult.error,
            error: fixResult.success ? undefined : (fixResult.error || '未知错误')
          });
        } else {
          results.push({
            order_no: order.order_no,
            success: false,
            error: `HTTP错误: ${fixResponse.status}，响应: ${JSON.stringify(fixResult)}`
          });
        }
      } catch (error) {
        // 捕获并记录详细错误
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        const errorStack = error instanceof Error ? error.stack : '';
        
        console.error(`处理订单 ${order.order_no} 时发生错误:`, errorMessage);
        if (errorStack) {
          console.error(`错误堆栈:`, errorStack);
        }
        
        handleError(
          error,
          '修复悬挂订单',
          { orderNo: order.order_no },
          ErrorLevel.WARNING
        );
        
        results.push({
          order_no: order.order_no,
          success: false,
          error: `请求错误: ${errorMessage}`
        });
      }
      
      // 请求之间添加短暂延迟，避免过快请求
      await new Promise(resolve => setTimeout(resolve, 500)); // 增加到500ms
    }
    
    // 记录处理结果
    console.log(`悬挂订单处理完成，成功: ${results.filter(r => r.success).length}/${results.length}`);
    
    return NextResponse.json({
      success: true,
      processed: results.length,
      results
    });
  } catch (error) {
    // 使用统一的错误处理
    const errorInfo = handleError(
      error,
      '定时处理悬挂订单',
      { url: request.url },
      ErrorLevel.ERROR
    );
    
    return NextResponse.json({
      success: false,
      error: errorInfo.message
    }, { status: 500 });
  }
} 