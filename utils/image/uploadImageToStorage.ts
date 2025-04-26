/**
 * 图片上传工具
 * 将base64编码的图片上传到Supabase存储，返回URL
 */
import { createAdminClient } from '@/utils/supabase/admin';
import { v4 as uuidv4 } from 'uuid';

// 日志工具
const logger = {
  info: (message: string) => console.log(`[图片上传] ${message}`),
  error: (message: string) => console.error(`[图片上传] ${message}`),
  warn: (message: string) => console.warn(`[图片上传] ${message}`),
  debug: (message: string) => console.log(`[图片上传] ${message}`)
};

/**
 * 从base64提取MIME类型
 */
function getMimeTypeFromBase64(base64String: string): string {
  const match = base64String.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
  return match ? match[1] : 'image/png'; // 默认为png
}

/**
 * 从base64提取文件扩展名
 */
function getExtensionFromBase64(base64String: string): string {
  const mime = getMimeTypeFromBase64(base64String);
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp'
  };
  return extensions[mime] || 'png';
}

/**
 * 从base64提取纯数据部分
 */
function extractBase64Data(base64String: string): string {
  const match = base64String.match(/;base64,(.+)$/);
  return match ? match[1] : base64String;
}

/**
 * 将base64编码的图片上传到Supabase存储
 * @param base64Image - 完整的base64编码图片(包含data:image/xxx;base64,前缀)
 * @param userId - 用户ID
 * @returns Promise<string> - 返回上传后的公共URL
 */
export async function uploadImageToStorage(
  base64Image: string,
  userId: string
): Promise<string> {
  try {
    if (!base64Image) {
      throw new Error('base64Image不能为空');
    }

    logger.info(`开始上传base64图片到存储服务`);
    
    // 生成唯一文件名
    const fileExtension = getExtensionFromBase64(base64Image);
    const timestamp = new Date().getTime();
    const randomId = uuidv4().substring(0, 8);
    const filename = `${userId}/${timestamp}-${randomId}.${fileExtension}`;
    const storagePath = `temp-images/${filename}`;
    
    // 获取Supabase管理员客户端
    const supabase = createAdminClient();
    
    // 提取base64数据
    let base64Data = base64Image;
    
    // 处理带有MIME前缀的base64
    if (base64Image.includes(';base64,')) {
      base64Data = extractBase64Data(base64Image);
    }
    
    // 将base64转换为Buffer
    const buffer = Buffer.from(base64Data, 'base64');
    
    // 检查base64数据大小
    const dataSizeInMB = buffer.length / (1024 * 1024);
    logger.info(`图片数据大小: ${dataSizeInMB.toFixed(2)}MB`);
    
    // 如果图片太大，可能导致超时或失败
    if (dataSizeInMB > 8) {
      logger.warn(`图片数据过大(${dataSizeInMB.toFixed(2)}MB)，可能导致上传失败`);
    }
    
    // 尝试获取所有可用的存储桶
    try {
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
      
      if (bucketsError) {
        logger.warn(`获取存储桶列表失败: ${bucketsError.message}`);
      } else {
        const bucketNames = buckets.map(b => b.name).join(', ');
        logger.info(`可用的存储桶: ${bucketNames || '无'}`);
      }
    } catch (bucketsError) {
      logger.warn(`获取存储桶列表时出错: ${bucketsError instanceof Error ? bucketsError.message : String(bucketsError)}`);
    }
    
    // 存储桶名称 - 尝试多个可能的名称
    const bucketCandidates = ['temp', 'images', 'public', 'storage', 'media', 'uploads'];
    let uploadSuccess = false;
    let publicUrl = '';
    let lastError = null;
    
    // 尝试每个候选存储桶
    for (const bucket of bucketCandidates) {
      try {
        logger.info(`尝试上传到存储桶: ${bucket}`);
        
        // 上传到Supabase存储
        const { data, error } = await supabase.storage
          .from(bucket)
          .upload(storagePath, buffer, {
            contentType: getMimeTypeFromBase64(base64Image),
            upsert: true
          });
        
        if (error) {
          logger.warn(`上传到存储桶 ${bucket} 失败: ${error.message}`);
          lastError = error;
          continue; // 尝试下一个存储桶
        }
        
        // 获取公共URL
        const { data: { publicUrl: url } } = supabase.storage
          .from(bucket)
          .getPublicUrl(storagePath);
        
        publicUrl = url;
        uploadSuccess = true;
        logger.info(`图片已成功上传到存储桶 ${bucket}，URL: ${publicUrl}`);
        break; // 成功上传，跳出循环
      } catch (bucketError) {
        logger.warn(`尝试上传到存储桶 ${bucket} 时出错: ${bucketError instanceof Error ? bucketError.message : String(bucketError)}`);
        lastError = bucketError;
      }
    }
    
    if (!uploadSuccess) {
      throw new Error(`上传到所有候选存储桶都失败: ${lastError ? (lastError instanceof Error ? lastError.message : String(lastError)) : '未知错误'}`);
    }
    
    return publicUrl;
  } catch (error) {
    logger.error(`图片上传失败: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * 清理临时图片
 * @param imageUrl - 图片URL
 * @returns Promise<boolean> - 返回是否清理成功
 */
export async function cleanupTemporaryImage(imageUrl: string): Promise<boolean> {
  try {
    // 检查URL是否来自Supabase存储
    if (!imageUrl.includes('storage/v1/object/public/')) {
      return false; // 不是Supabase存储的URL，无需清理
    }
    
    // 从URL提取路径
    const url = new URL(imageUrl);
    const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/(.+)$/);
    
    if (!pathMatch || !pathMatch[1]) {
      return false; // 无法提取路径
    }
    
    const fullPath = decodeURIComponent(pathMatch[1]);
    
    // 提取存储桶名称和文件路径
    const parts = fullPath.split('/');
    const bucketName = parts[0];
    const storagePath = parts.slice(1).join('/');
    
    logger.info(`尝试从存储桶 ${bucketName} 删除文件: ${storagePath}`);
    
    // 获取Supabase管理员客户端
    const supabase = createAdminClient();
    
    // 删除图片
    const { error } = await supabase.storage
      .from(bucketName)
      .remove([storagePath]);
    
    if (error) {
      logger.warn(`删除临时图片失败: ${error.message}`);
      return false;
    }
    
    logger.info(`成功删除临时图片: ${storagePath} (从存储桶 ${bucketName})`);
    return true;
  } catch (error) {
    logger.error(`清理临时图片失败: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
} 