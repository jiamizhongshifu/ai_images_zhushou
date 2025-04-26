/**
 * 图片上传工具
 * 将base64编码的图片上传到存储，返回URL
 */
import { createAdminClient } from '@/utils/supabase/admin';
import { v4 as uuidv4 } from 'uuid';
import { createLogger, createSafeSummary } from '@/utils/logger';
import { 
  BucketType, 
  StorageProvider, 
  getBucketConfig, 
  generateStoragePath 
} from '@/utils/storage/storageConfig';

// 创建专用日志记录器
const logger = createLogger('图片上传');

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
 * 将base64编码的图片上传到存储服务
 * @param base64Image - 完整的base64编码图片(包含data:image/xxx;base64,前缀)
 * @param userId - 用户ID
 * @param bucketType - 存储桶类型，默认为临时存储
 * @returns Promise<string> - 返回上传后的公共URL
 */
export async function uploadImageToStorage(
  base64Image: string,
  userId: string,
  bucketType: BucketType = BucketType.TEMP
): Promise<string> {
  try {
    if (!base64Image) {
      throw new Error('base64Image不能为空');
    }

    logger.info(`开始上传用户图片到存储服务`);
    
    // 安全记录图片信息，避免记录完整base64内容
    const mimeType = getMimeTypeFromBase64(base64Image);
    const fileExtension = getExtensionFromBase64(base64Image);
    logger.debug(`图片信息: 类型=${mimeType}, 扩展名=${fileExtension}`);
    
    // 获取目标存储桶配置
    const bucketConfig = getBucketConfig(bucketType);
    logger.debug(`使用存储桶: ${bucketConfig.name}`);
    
    // 检查文件类型是否允许
    if (bucketConfig.allowedFileTypes && !bucketConfig.allowedFileTypes.includes(mimeType)) {
      logger.warn(`不支持的文件类型: ${mimeType}, 允许的类型: ${bucketConfig.allowedFileTypes.join(', ')}`);
      throw new Error(`不支持的文件类型: ${mimeType}`);
    }
    
    // 生成唯一文件名和存储路径
    const timestamp = new Date().getTime();
    const randomId = uuidv4().substring(0, 8);
    const filename = `${timestamp}-${randomId}.${fileExtension}`;
    const storagePath = generateStoragePath(filename, bucketType, userId);
    
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
    
    // 检查图片是否超过最大允许大小
    if (bucketConfig.maxFileSize && buffer.length > bucketConfig.maxFileSize) {
      logger.warn(`图片大小(${dataSizeInMB.toFixed(2)}MB)超过最大允许值(${bucketConfig.maxFileSize / (1024 * 1024)}MB)`);
      throw new Error(`图片大小(${dataSizeInMB.toFixed(2)}MB)超过最大允许值(${bucketConfig.maxFileSize / (1024 * 1024)}MB)`);
    }
    
    // 记录开始时间用于性能监控
    const startTime = Date.now();
    
    // 上传到存储服务
    let publicUrl = '';
    
    if (bucketConfig.provider === StorageProvider.SUPABASE) {
      // 上传到Supabase存储
      const { data, error } = await supabase.storage
        .from(bucketConfig.name)
        .upload(storagePath, buffer, {
          contentType: mimeType,
          upsert: true
        });
      
      if (error) {
        throw error;
      }
      
      // 获取公共URL
      const { data: { publicUrl: url } } = supabase.storage
        .from(bucketConfig.name)
        .getPublicUrl(storagePath);
      
      publicUrl = url;
    } else if (bucketConfig.provider === StorageProvider.GOOGLE_CLOUD) {
      // 未来实现Google Cloud Storage上传
      logger.warn('Google Cloud Storage上传尚未实现，将尝试使用Supabase');
      // 回退到Supabase
      const { data, error } = await supabase.storage
        .from(bucketConfig.name)
        .upload(storagePath, buffer, {
          contentType: mimeType,
          upsert: true
        });
      
      if (error) {
        throw error;
      }
      
      // 获取公共URL
      const { data: { publicUrl: url } } = supabase.storage
        .from(bucketConfig.name)
        .getPublicUrl(storagePath);
      
      publicUrl = url;
    } else {
      // 自定义或未知提供商
      throw new Error(`不支持的存储提供商: ${bucketConfig.provider}`);
    }
    
    // 记录成功上传的性能信息
    const uploadTime = Date.now() - startTime;
    logger.info(`图片已成功上传，耗时: ${uploadTime}ms`);
    logger.debug(`上传详情: 存储桶=${bucketConfig.name}, 路径=${storagePath}`);
    
    return publicUrl;
  } catch (error) {
    logger.error(`图片上传失败: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * 从URL推断存储桶类型
 * @param url - 图片URL
 * @returns 推断的存储桶类型，如果无法推断则返回null
 */
function inferBucketTypeFromUrl(url: string): BucketType | null {
  try {
    if (!url) return null;
    
    // 尝试从URL路径中提取关键词来推断桶类型
    const urlLower = url.toLowerCase();
    
    // 按优先级检查各种桶类型特征
    if (urlLower.includes('/temp-') || urlLower.includes('/temp/') || urlLower.includes('-temp/')) {
      return BucketType.TEMP;
    } else if (urlLower.includes('/avatar') || urlLower.includes('/profile')) {
      return BucketType.AVATARS;
    } else if (urlLower.includes('/doc') || urlLower.includes('/pdf') || urlLower.includes('/file')) {
      return BucketType.DOCUMENTS;
    } else {
      // 默认为图片桶
      return BucketType.IMAGES;
    }
  } catch (error) {
    logger.warn(`从URL推断桶类型失败: ${error instanceof Error ? error.message : String(error)}`);
    return BucketType.IMAGES; // 默认返回图片桶
  }
}

/**
 * 清理临时图片
 * @param imageUrl - 图片URL
 * @returns Promise<boolean> - 返回是否清理成功
 */
export async function cleanupTemporaryImage(imageUrl: string): Promise<boolean> {
  try {
    // 安全检查：确保URL不为空且是字符串类型
    if (!imageUrl || typeof imageUrl !== 'string') {
      logger.warn(`无效的图片URL: ${imageUrl}`);
      return false;
    }

    // 规范化URL，移除查询参数和片段
    let normalizedUrl = imageUrl;
    try {
      // 尝试解析和规范化URL
      const urlObj = new URL(imageUrl);
      // 移除查询参数和片段
      normalizedUrl = `${urlObj.origin}${urlObj.pathname}`;
      logger.debug(`规范化URL: ${normalizedUrl}`);
    } catch (parseError) {
      // URL解析失败，使用简单的字符串处理
      logger.warn(`URL解析失败，使用简单处理: ${imageUrl}`);
      const questionMarkIndex = imageUrl.indexOf('?');
      if (questionMarkIndex > 0) {
        normalizedUrl = imageUrl.substring(0, questionMarkIndex);
      }
    }
    
    // 从URL推断存储桶类型
    const bucketType = inferBucketTypeFromUrl(normalizedUrl);
    if (!bucketType) {
      logger.debug(`无法从URL推断存储桶类型: ${normalizedUrl}`);
      return false;
    }
    
    // 获取存储桶配置
    const bucketConfig = getBucketConfig(bucketType);
    
    // 检查URL是否来自当前存储提供商
    const storagePatterns = [
      /storage\/v1\/object\/public\/(.+)$/,  // Supabase标准模式
      /storage\.googleapis\.com\/(.+)$/,     // Google Cloud Storage
      /supabase\.co\/storage\/v1\/object\/public\/(.+)$/,  // supabase.co域名
      /supabase\.in\/storage\/v1\/object\/public\/(.+)$/   // supabase.in域名
    ];
    
    let matchedPattern = null;
    let matchResult = null;
    
    for (const pattern of storagePatterns) {
      matchResult = normalizedUrl.match(pattern);
      if (matchResult && matchResult[1]) {
        matchedPattern = pattern;
        break;
      }
    }
    
    if (!matchResult || !matchResult[1]) {
      logger.debug(`非存储URL，无需清理: ${normalizedUrl}`);
      return false; // 不是识别的存储URL，无需清理
    }
    
    // 提取路径
    let fullPath;
    try {
      fullPath = decodeURIComponent(matchResult[1]);
    } catch (decodeError) {
      // 解码失败时使用原始路径
      logger.warn(`URL解码失败: ${matchResult[1]}`);
      fullPath = matchResult[1];
    }
    
    // 提取存储桶名称和文件路径
    let bucketName, storagePath;
    
    const pathParts = fullPath.split('/');
    if (pathParts.length < 2) {
      logger.warn(`无效的存储路径: ${fullPath}`);
      return false;
    }
    
    // 根据不同的URL模式处理
    if (matchedPattern === storagePatterns[0] || // Supabase标准模式
        matchedPattern === storagePatterns[2] || // supabase.co域名
        matchedPattern === storagePatterns[3]) { // supabase.in域名
      bucketName = pathParts[0];
      storagePath = pathParts.slice(1).join('/');
    } else {
      // 对于其他模式，使用配置中的桶名
      bucketName = bucketConfig.name;
      storagePath = fullPath;
    }
    
    // 安全检查：路径不能为空
    if (!storagePath || storagePath.trim() === '') {
      logger.warn(`存储路径为空: ${fullPath}`);
      return false;
    }
    
    logger.debug(`准备清理图片: 存储桶=${bucketName}, 路径=${storagePath}`);
    
    // 获取Supabase管理员客户端
    const supabase = createAdminClient();
    
    // 记录开始时间
    const startTime = Date.now();
    
    // 使用错误处理和重试逻辑删除图片
    let retryCount = 0;
    let lastError = null;
    
    while (retryCount < 2) { // 最多重试2次
      try {
        // 删除图片
        const { error } = await supabase.storage
          .from(bucketName)
          .remove([storagePath]);
        
        if (error) {
          // 如果是"不存在"错误，算作成功（幂等性）
          if (error.message && (
              error.message.includes('not found') || 
              error.message.includes('does not exist')
            )) {
            logger.debug(`文件已不存在: ${storagePath}`);
            return true;
          }
          
          // 其他错误进行重试
          lastError = error;
          throw error;
        }
        
        // 记录清理结果和耗时
        const cleanupTime = Date.now() - startTime;
        logger.info(`成功清理图片，耗时: ${cleanupTime}ms`);
        
        return true;
      } catch (error) {
        retryCount++;
        if (retryCount >= 2) break;
        
        // 小等待后重试
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, retryCount)));
        logger.debug(`删除重试(${retryCount}/2): ${storagePath}`);
      }
    }
    
    // 达到最大重试次数
    if (lastError) {
      logger.warn(`删除图片失败: ${lastError.message}`);
    }
    
    return false;
  } catch (error) {
    logger.error(`清理图片时出错: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
} 