/**
 * 图片压缩工具
 * 用于前端压缩图片大小，减少上传数据量
 */

// 默认压缩参数
const DEFAULT_MAX_WIDTH = 1024;  // 最大宽度
const DEFAULT_MAX_HEIGHT = 1024; // 最大高度
const DEFAULT_QUALITY = 0.8;     // 默认质量(0-1)
const MIME_TYPE = 'image/jpeg';  // 输出格式

/**
 * 图片压缩选项
 */
export interface CompressOptions {
  maxWidth?: number;    // 最大宽度
  maxHeight?: number;   // 最大高度
  quality?: number;     // 质量(0-1)
  mimeType?: string;    // 输出MIME类型
}

/**
 * 压缩图片
 * @param imageBase64 - 源图片Base64字符串
 * @param options - 压缩选项
 * @returns 压缩后的Base64字符串
 */
export async function compressImage(
  imageBase64: string,
  options: CompressOptions = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // 设置默认参数
      const maxWidth = options.maxWidth || DEFAULT_MAX_WIDTH;
      const maxHeight = options.maxHeight || DEFAULT_MAX_HEIGHT;
      const quality = options.quality !== undefined 
        ? Math.max(0, Math.min(1, options.quality)) // 确保quality在0-1之间
        : DEFAULT_QUALITY;
      const mimeType = options.mimeType || MIME_TYPE;
      
      // 创建图片元素
      const img = new Image();
      img.onload = () => {
        try {
          // 计算新尺寸，保持原始宽高比
          let width = img.width;
          let height = img.height;
          let resizeNeeded = false;
          
          // 检查是否需要调整大小
          if (width > maxWidth || height > maxHeight) {
            resizeNeeded = true;
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
          }
          
          // 创建canvas并设置尺寸
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          
          // 绘制图片到canvas
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('无法创建Canvas 2D上下文');
          }
          
          // 绘制图片
          ctx.drawImage(img, 0, 0, width, height);
          
          // 将canvas转换为base64
          const compressedBase64 = canvas.toDataURL(mimeType, quality);
          
          // 记录压缩结果
          console.log(
            `图片压缩完成: ${resizeNeeded ? '已调整尺寸' : '尺寸未变'}，` +
            `原始大小: ${img.width}x${img.height}，` +
            `新大小: ${width}x${height}，` +
            `质量: ${quality}`
          );
          
          resolve(compressedBase64);
        } catch (error) {
          console.error('压缩图片过程中出错:', error);
          reject(error);
        }
      };
      
      // 图片加载错误处理
      img.onerror = (error) => {
        console.error('加载图片失败:', error);
        reject(new Error('加载图片失败'));
      };
      
      // 设置图片源
      img.src = imageBase64;
    } catch (error) {
      console.error('压缩图片初始化失败:', error);
      reject(error);
    }
  });
}

/**
 * 渐进式压缩图片 - 根据目标大小(KB)自动调整质量
 * 
 * @param imageBase64 - 源图片Base64字符串
 * @param targetSizeKB - 目标大小(KB)
 * @param initialOptions - 初始压缩选项
 * @param maxAttempts - 最大尝试次数
 * @returns 压缩后的Base64字符串
 */
export async function compressToTargetSize(
  imageBase64: string,
  targetSizeKB: number,
  initialOptions: CompressOptions = {},
  maxAttempts: number = 5
): Promise<string> {
  // 计算基本大小
  const base64Size = estimateBase64Size(imageBase64);
  console.log(`原始图片估计大小: ${Math.round(base64Size)}KB，目标大小: ${targetSizeKB}KB`);
  
  // 如果原始图片已经小于目标大小，直接返回
  if (base64Size <= targetSizeKB) {
    console.log('图片已经小于目标大小，无需压缩');
    return imageBase64;
  }
  
  // 设置初始选项
  const options: CompressOptions = {
    maxWidth: initialOptions.maxWidth || DEFAULT_MAX_WIDTH,
    maxHeight: initialOptions.maxHeight || DEFAULT_MAX_HEIGHT,
    quality: initialOptions.quality || DEFAULT_QUALITY,
    mimeType: initialOptions.mimeType || MIME_TYPE
  };
  
  // 计算质量递减步长
  const qualityStep = 0.1;
  let currentQuality = options.quality || DEFAULT_QUALITY;
  let bestResult = imageBase64;
  let bestSize = base64Size;
  let attempts = 0;
  
  // 优先尝试调整尺寸
  if (base64Size > targetSizeKB * 3) {
    // 如果图片大小超过目标的3倍，先尝试调整尺寸
    const sizeRatio = Math.sqrt(targetSizeKB / base64Size);
    options.maxWidth = Math.floor((options.maxWidth || DEFAULT_MAX_WIDTH) * sizeRatio);
    options.maxHeight = Math.floor((options.maxHeight || DEFAULT_MAX_HEIGHT) * sizeRatio);
    
    console.log(`调整最大尺寸至: ${options.maxWidth}x${options.maxHeight}`);
    
    // 第一次压缩 - 调整尺寸
    bestResult = await compressImage(imageBase64, options);
    bestSize = estimateBase64Size(bestResult);
    attempts++;
    
    console.log(`尺寸调整后大小: ${Math.round(bestSize)}KB`);
  }
  
  // 如果尺寸调整后仍然大于目标，尝试降低质量
  while (bestSize > targetSizeKB && attempts < maxAttempts) {
    // 降低质量
    currentQuality = Math.max(0.1, currentQuality - qualityStep);
    options.quality = currentQuality;
    
    console.log(`尝试第${attempts + 1}次，质量: ${currentQuality.toFixed(2)}`);
    
    // 压缩
    const compressed = await compressImage(bestResult, options);
    const compressedSize = estimateBase64Size(compressed);
    
    console.log(`压缩后大小: ${Math.round(compressedSize)}KB`);
    
    // 更新最佳结果
    bestResult = compressed;
    bestSize = compressedSize;
    attempts++;
    
    // 如果已经达到目标或者质量已经很低，停止压缩
    if (compressedSize <= targetSizeKB || currentQuality <= 0.2) {
      break;
    }
  }
  
  console.log(`压缩完成，最终大小: ${Math.round(bestSize)}KB，` +
    `压缩率: ${Math.round((1 - bestSize / base64Size) * 100)}%，` +
    `尝试次数: ${attempts}/${maxAttempts}`);
  
  return bestResult;
}

/**
 * 估算Base64图片大小(KB)
 * @param base64String - Base64字符串
 * @returns 估算大小(KB)
 */
export function estimateBase64Size(base64String: string): number {
  // 移除前缀 (如 "data:image/jpeg;base64,")
  const base64Data = base64String.includes(',') 
    ? base64String.split(',')[1] 
    : base64String;
  
  // 计算字节数 (Base64数据的长度 * 3/4，因为每4个Base64字符表示3个字节)
  const sizeInBytes = Math.floor(base64Data.length * 0.75);
  
  // 转换为KB
  return sizeInBytes / 1024;
}

/**
 * 检查图片是否需要压缩
 * @param base64String - Base64字符串
 * @param maxSizeKB - 最大大小(KB)
 * @returns 是否需要压缩
 */
export function needsCompression(base64String: string, maxSizeKB: number): boolean {
  const sizeKB = estimateBase64Size(base64String);
  return sizeKB > maxSizeKB;
}

/**
 * 获取图片宽高
 * @param base64String - Base64字符串
 * @returns Promise<{width: number, height: number}>
 */
export function getImageDimensions(base64String: string): Promise<{width: number, height: number}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.width,
        height: img.height
      });
    };
    img.onerror = () => {
      reject(new Error('加载图片失败'));
    };
    img.src = base64String;
  });
} 