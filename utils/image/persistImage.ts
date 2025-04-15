/**
 * 图片URL持久化工具
 * 将OpenAI等服务的临时URL转换为持久化URL
 */
import { createAdminClient } from '@/utils/supabase/admin';

// 日志工具
const logger = {
  info: (message: string) => console.log(`[图片持久化] ${message}`),
  error: (message: string) => console.error(`[图片持久化] ${message}`),
  warn: (message: string) => console.warn(`[图片持久化] ${message}`),
  debug: (message: string) => console.log(`[图片持久化] ${message}`)
};

/**
 * 判断URL是否来自OpenAI服务
 */
export function isOpenAIUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname.includes('openai.com') || 
           parsedUrl.hostname.includes('oaiusercontent.com');
  } catch (e) {
    return false;
  }
}

/**
 * 检查URL是否是临时URL
 */
export function isTemporaryUrl(url: string): boolean {
  // 检查URL是否包含典型的临时访问参数
  return url.includes('st=') && url.includes('se=') && 
         (url.includes('sig=') || url.includes('token=') || url.includes('expire='));
}

/**
 * 将图片URL转存到Supabase存储
 */
export async function persistImageUrl(
  imageUrl: string, 
  taskId: string, 
  userId: string
): Promise<string> {
  try {
    // 检查是否需要持久化处理
    if (!isOpenAIUrl(imageUrl) && !isTemporaryUrl(imageUrl)) {
      logger.info(`图片URL不需要持久化处理: ${imageUrl.substring(0, 50)}...`);
      return imageUrl; // 返回原始URL
    }

    logger.info(`开始将临时URL转存为持久URL: ${imageUrl.substring(0, 50)}...`);
    
    // 生成存储路径
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${userId}/${taskId}-${timestamp}.png`;
    const storagePath = `ai-images/${filename}`;
    
    // 获取Supabase管理员客户端
    const supabase = createAdminClient();
    
    // 从URL获取图片数据
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      throw new Error(`获取图片数据失败: HTTP ${response.status}`);
    }
    
    // 获取blob数据
    const imageBlob = await response.blob();
    
    // 上传到Supabase存储
    const { data, error } = await supabase.storage
      .from('public')
      .upload(storagePath, imageBlob, {
        contentType: 'image/png',
        upsert: true
      });
    
    if (error) {
      throw new Error(`上传图片到存储失败: ${error.message}`);
    }
    
    // 获取公共URL
    const { data: { publicUrl } } = supabase.storage
      .from('public')
      .getPublicUrl(storagePath);
    
    logger.info(`图片已成功持久化，新URL: ${publicUrl}`);
    
    // 更新数据库中的图片URL
    const { error: updateError } = await supabase
      .from('image_tasks')
      .update({
        image_url: publicUrl,
        original_image_url: imageUrl, // 保存原始URL作为参考
        updated_at: new Date().toISOString()
      })
      .eq('task_id', taskId);
    
    if (updateError) {
      logger.warn(`更新任务图片URL失败: ${updateError.message}，但图片已持久化`);
    } else {
      logger.info(`已更新任务${taskId}的图片URL为持久URL`);
    }
    
    // 同时更新历史记录表中的URL
    try {
      await supabase
        .from('ai_images_creator_history')
        .update({
          image_url: publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('task_id', taskId);
    } catch (historyErr) {
      logger.warn(`更新历史记录图片URL失败: ${historyErr instanceof Error ? historyErr.message : String(historyErr)}`);
    }
    
    return publicUrl;
  } catch (error) {
    logger.error(`图片持久化失败: ${error instanceof Error ? error.message : String(error)}`);
    // 返回原始URL，做为兜底
    return imageUrl;
  }
}

/**
 * 检查并处理所有临时URL
 * 用于定期运行的任务
 */
export async function processAllTemporaryImageUrls(): Promise<number> {
  try {
    logger.info('开始处理所有临时图片URL');
    
    // 获取Supabase管理员客户端
    const supabase = createAdminClient();
    
    // 查找所有含有临时URL的图片任务
    const { data, error } = await supabase
      .from('image_tasks')
      .select('task_id, user_id, image_url')
      .eq('status', 'completed')
      .is('original_image_url', null)  // 只处理尚未持久化的图片
      .limit(100);  // 一次处理有限数量，避免超时
    
    if (error) {
      throw new Error(`查询任务失败: ${error.message}`);
    }
    
    if (!data || data.length === 0) {
      logger.info('没有发现需要处理的临时URL');
      return 0;
    }
    
    // 筛选包含临时URL的任务
    const tasksWithTemporaryUrls = data.filter(task => 
      task.image_url && (isOpenAIUrl(task.image_url) || isTemporaryUrl(task.image_url))
    );
    
    if (tasksWithTemporaryUrls.length === 0) {
      logger.info('没有发现临时URL');
      return 0;
    }
    
    logger.info(`发现${tasksWithTemporaryUrls.length}个临时URL需要处理`);
    
    // 处理每个临时URL
    let processedCount = 0;
    
    interface TaskWithUrl {
      task_id: string;
      user_id: string;
      image_url: string;
    }
    
    for (const task of tasksWithTemporaryUrls as TaskWithUrl[]) {
      try {
        await persistImageUrl(task.image_url, task.task_id, task.user_id);
        processedCount++;
      } catch (taskError) {
        logger.error(`处理任务${task.task_id}的临时URL失败: ${taskError instanceof Error ? taskError.message : String(taskError)}`);
      }
    }
    
    logger.info(`成功处理了${processedCount}个临时URL`);
    return processedCount;
  } catch (error) {
    logger.error(`批量处理临时URL失败: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  }
} 