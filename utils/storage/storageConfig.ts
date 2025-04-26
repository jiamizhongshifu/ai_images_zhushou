/**
 * 存储桶配置
 * 集中管理存储桶名称和路径
 */

// 存储桶类型枚举
export enum BucketType {
  IMAGES = 'images',
  TEMP = 'temp',
  AVATARS = 'avatars',
  DOCUMENTS = 'documents'
}

// 存储提供商类型
export enum StorageProvider {
  SUPABASE = 'supabase',
  GOOGLE_CLOUD = 'gcs',
  CUSTOM = 'custom'
}

// 存储桶配置接口
export interface BucketConfig {
  name: string;           // 存储桶名称
  provider: StorageProvider; // 存储提供商
  baseUrl?: string;       // 基础URL（如果适用）
  publicAccess: boolean;  // 是否公开访问
  tempFileTTL?: number;   // 临时文件过期时间（秒）
  allowedFileTypes?: string[]; // 允许的文件类型
  maxFileSize?: number;   // 最大文件大小（字节）
}

// 环境变量映射存储桶
const getEnvBucketName = (bucketType: BucketType): string => {
  const envMap: Record<BucketType, string> = {
    [BucketType.IMAGES]: process.env.STORAGE_BUCKET_IMAGES || 'images',
    [BucketType.TEMP]: process.env.STORAGE_BUCKET_TEMP || 'temp',
    [BucketType.AVATARS]: process.env.STORAGE_BUCKET_AVATARS || 'avatars',
    [BucketType.DOCUMENTS]: process.env.STORAGE_BUCKET_DOCUMENTS || 'documents'
  };
  
  return envMap[bucketType];
};

// 获取存储提供商
const getStorageProvider = (): StorageProvider => {
  const provider = process.env.STORAGE_PROVIDER?.toLowerCase();
  if (provider === 'gcs' || provider === 'google') {
    return StorageProvider.GOOGLE_CLOUD;
  } else if (provider === 'custom') {
    return StorageProvider.CUSTOM;
  }
  return StorageProvider.SUPABASE; // 默认
};

// 存储桶配置映射
export const bucketConfigs: Record<BucketType, BucketConfig> = {
  [BucketType.IMAGES]: {
    name: getEnvBucketName(BucketType.IMAGES),
    provider: getStorageProvider(),
    publicAccess: true,
    allowedFileTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxFileSize: 10 * 1024 * 1024, // 10MB
  },
  [BucketType.TEMP]: {
    name: getEnvBucketName(BucketType.TEMP),
    provider: getStorageProvider(),
    publicAccess: true,
    tempFileTTL: 3600, // 1小时
    allowedFileTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFileSize: 20 * 1024 * 1024, // 20MB
  },
  [BucketType.AVATARS]: {
    name: getEnvBucketName(BucketType.AVATARS),
    provider: getStorageProvider(),
    publicAccess: true,
    allowedFileTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFileSize: 5 * 1024 * 1024, // 5MB
  },
  [BucketType.DOCUMENTS]: {
    name: getEnvBucketName(BucketType.DOCUMENTS),
    provider: getStorageProvider(),
    publicAccess: false,
    allowedFileTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    maxFileSize: 50 * 1024 * 1024, // 50MB
  }
};

/**
 * 获取存储桶配置
 * @param bucketType - 存储桶类型
 * @returns 存储桶配置
 */
export function getBucketConfig(bucketType: BucketType): BucketConfig {
  return bucketConfigs[bucketType];
}

/**
 * 根据URL推断存储桶类型
 * @param url - 存储URL
 * @returns 存储桶类型或undefined
 */
export function inferBucketTypeFromUrl(url: string): BucketType | undefined {
  if (!url) return undefined;
  
  try {
    // 尝试规范化URL
    const normalizedUrl = new URL(url).pathname;
    
    // 检查URL中是否包含存储桶名称
    for (const [type, config] of Object.entries(bucketConfigs)) {
      if (normalizedUrl.includes(`/public/${config.name}/`)) {
        return type as BucketType;
      }
    }
    
    // 如果没有明确匹配，根据路径推断
    if (normalizedUrl.includes('/images/')) {
      return BucketType.IMAGES;
    } else if (normalizedUrl.includes('/temp/')) {
      return BucketType.TEMP;
    } else if (normalizedUrl.includes('/avatars/')) {
      return BucketType.AVATARS;
    } else if (normalizedUrl.includes('/documents/')) {
      return BucketType.DOCUMENTS;
    }
  } catch (error) {
    // URL解析失败时使用简单字符串检查
    for (const [type, config] of Object.entries(bucketConfigs)) {
      if (url.includes(`/${config.name}/`)) {
        return type as BucketType;
      }
    }
  }
  
  // 默认返回图片存储桶
  return BucketType.IMAGES;
}

/**
 * 生成用于存储的文件路径
 * @param fileName - 文件名
 * @param bucketType - 存储桶类型
 * @param subFolder - 子文件夹（可选）
 * @returns 完整的存储路径
 */
export function generateStoragePath(
  fileName: string,
  bucketType: BucketType = BucketType.IMAGES,
  subFolder?: string
): string {
  // 生成基于日期的文件夹结构 yyyy/mm/dd
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  // 生成随机文件名前缀，避免冲突
  const randomPrefix = Math.random().toString(36).substring(2, 10);
  
  // 提取文件扩展名
  const fileExt = fileName.includes('.')
    ? fileName.split('.').pop()
    : 'jpg';
  
  // 构建基本路径
  let basePath = `${year}/${month}/${day}`;
  
  // 如果提供了子文件夹，添加到路径中
  if (subFolder) {
    basePath = `${subFolder}/${basePath}`;
  }
  
  // 返回完整存储路径
  return `${basePath}/${randomPrefix}_${Date.now()}.${fileExt}`;
}

export default {
  BucketType,
  StorageProvider,
  getBucketConfig,
  inferBucketTypeFromUrl,
  generateStoragePath
}; 