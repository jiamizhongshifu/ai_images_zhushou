import fs from 'fs';

/**
 * 将本地图片文件转换为base64编码
 * 注意：此方法仅在Node.js环境下有效，浏览器环境请使用fileToBase64
 * @param imagePath 图片文件路径
 * @returns base64编码的字符串(不包含前缀)
 */
export function image2Base64(imagePath: string): string {
    try {
        const image = fs.readFileSync(imagePath);
        return image.toString('base64');
    } catch (error) {
        console.error('读取图片文件失败:', error);
        throw new Error(`无法读取图片文件: ${imagePath}`);
    }
}

/**
 * 检测图片类型并添加适当的data:URL前缀
 * @param base64String 原始base64字符串
 * @returns 添加了适当前缀的完整data:URL
 */
export function addBase64Prefix(base64String: string): string {
    // 如果已经有前缀，直接返回
    if (base64String.startsWith('data:image/')) {
        return base64String;
    }
    
    // 检测图像类型
    let imageType = 'image/png'; // 默认为PNG
    if (base64String.startsWith('/9j/')) {
        imageType = 'image/jpeg';
    } else if (base64String.startsWith('UklGR')) {
        imageType = 'image/webp';
    } else if (base64String.startsWith('iVBOR')) {
        imageType = 'image/png';
    } else if (base64String.startsWith('R0lGOD')) {
        imageType = 'image/gif';
    }
    
    return `data:${imageType};base64,${base64String}`;
}

/**
 * 估算base64编码图片的大小（KB）
 * @param base64String base64编码的图片
 * @returns 估算大小（KB）
 */
export function estimateBase64Size(base64String: string): number {
    try {
        // 移除base64前缀
        const base64 = base64String.includes(',') 
            ? base64String.split(',')[1] 
            : base64String;
        
        // base64编码会将3字节数据编码为4字节
        // 所以实际大小约为编码大小的3/4
        return Math.ceil((base64.length * 3) / 4 / 1024);
    } catch (error) {
        console.error('估算base64大小出错:', error);
        return 0; // 出错时返回0
    }
}

/**
 * 将URL图片转换为base64
 * @param imageUrl 图片URL
 * @returns Promise<string> base64字符串
 */
export async function urlToBase64(imageUrl: string): Promise<string> {
    try {
        // 获取图片
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        
        // 转换为base64
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                resolve(base64String);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('URL转base64失败:', error);
        throw error;
    }
}

/**
 * 将File对象转换为base64
 * @param file File对象
 * @returns Promise<string> base64字符串
 */
export function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * 检查图片大小是否超过限制
 * @param base64String base64编码的图片
 * @param maxSizeKB 最大大小（KB）
 * @returns 是否超过限制
 */
export function isImageTooLarge(base64String: string, maxSizeKB: number): boolean {
    const size = estimateBase64Size(base64String);
    return size > maxSizeKB;
}

/**
 * 获取图片类型
 * @param base64String base64编码的图片
 * @returns 图片MIME类型
 */
export function getImageType(base64String: string): string {
    try {
        const matches = base64String.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
        return matches ? matches[1] : 'image/jpeg'; // 默认为JPEG
    } catch (error) {
        console.error('获取图片类型出错:', error);
        return 'image/jpeg'; // 默认为JPEG
    }
}

/**
 * 压缩图片
 * @param base64Image 原始base64图片
 * @param maxWidth 最大宽度
 * @param maxHeight 最大高度
 * @param quality 压缩质量 (0-1)
 * @returns Promise，解析为压缩后的base64字符串
 */
export function compressImage(
    base64Image: string, 
    maxWidth = 800, 
    maxHeight = 800, 
    quality = 0.8
): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            // 创建图片元素
            const img = new Image();
            img.src = base64Image;
            
            img.onload = () => {
                // 计算新尺寸，保持纵横比
                let width = img.width;
                let height = img.height;
                console.log(`原始图片尺寸: ${width}x${height}`);
                
                // 如果图片已经小于最大尺寸，无需调整大小
                if (width <= maxWidth && height <= maxHeight) {
                    console.log('图片尺寸已经在范围内，保持原样');
                    resolve(base64Image);
                    return;
                }
                
                // 计算缩放比例
                let ratio = 1;
                if (width > maxWidth) {
                    ratio = maxWidth / width;
                }
                if (height * ratio > maxHeight) {
                    ratio = maxHeight / height;
                }
                
                width = Math.floor(width * ratio);
                height = Math.floor(height * ratio);
                console.log(`调整后的尺寸: ${width}x${height}, 缩放比例: ${ratio}`);
                
                // 创建canvas进行绘制
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                if (!ctx) {
                    reject(new Error('无法创建2D上下文'));
                    return;
                }
                
                // 绘制调整大小的图像
                ctx.drawImage(img, 0, 0, width, height);
                
                // 提取图片类型
                const mimeType = base64Image.split(';')[0].split(':')[1] || 'image/jpeg';
                
                // 转换为base64
                const compressedBase64 = canvas.toDataURL(mimeType, quality);
                
                // 计算压缩比例
                const originalSize = estimateBase64Size(base64Image);
                const compressedSize = estimateBase64Size(compressedBase64);
                console.log(`压缩结果: ${(originalSize/1024).toFixed(2)}KB -> ${(compressedSize/1024).toFixed(2)}KB, 压缩率: ${(100 - compressedSize / originalSize * 100).toFixed(2)}%`);
                
                resolve(compressedBase64);
            };
            
            img.onerror = () => {
                reject(new Error('图片加载失败'));
            };
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * 在服务器端压缩图片
 * 注意：此函数仅适用于服务器端环境，需要安装sharp库
 * @param base64Image 原始base64图片
 * @param maxWidth 最大宽度
 * @param maxHeight 最大高度
 * @param quality 压缩质量 (1-100)
 * @returns Promise，解析为压缩后的base64字符串
 */
export async function compressImageServer(
    base64Image: string,
    maxWidth = 800,
    maxHeight = 800,
    quality = 80
): Promise<string> {
    try {
        // 提取base64数据和MIME类型
        const matches = base64Image.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            throw new Error('无效的base64图片');
        }
        
        // 动态导入sharp库
        let sharp;
        try {
            const sharpModule = await import('sharp');
            sharp = sharpModule.default;
        } catch (err) {
            console.warn('无法加载sharp库，将返回原始图像:', err);
            return base64Image;
        }
        
        const mimeType = matches[1];
        const base64Data = matches[2];
        
        // 转换为Buffer
        const buffer = Buffer.from(base64Data, 'base64');
        
        // 使用sharp处理图片
        const result = await sharp(buffer)
            .resize(maxWidth, maxHeight, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality }) // 或.png(), .webp()等
            .toBuffer();
        
        // 转回base64
        const compressedBase64 = `data:${mimeType};base64,${result.toString('base64')}`;
        
        return compressedBase64;
    } catch (error) {
        console.error('服务器端图片压缩失败:', error);
        // 压缩失败则返回原图
        return base64Image;
    }
} 