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
    if (base64String.startsWith('data:')) {
        return base64String;
    }
    
    // 根据base64编码的开头几个字符推断图片类型
    let mimeType = 'image/png'; // 默认为PNG
    
    if (base64String.startsWith('/9j/')) {
        mimeType = 'image/jpeg';
    } else if (base64String.startsWith('UklGR')) {
        mimeType = 'image/webp';
    } else if (base64String.startsWith('iVBOR')) {
        mimeType = 'image/png';
    } else if (base64String.startsWith('R0lGOD')) {
        mimeType = 'image/gif';
    } else if (base64String.startsWith('PHN2Zz')) {
        mimeType = 'image/svg+xml';
    }
    
    return `data:${mimeType};base64,${base64String}`;
}

/**
 * 估算base64编码数据大小
 * @param base64String base64编码字符串
 * @returns 估算的字节大小
 */
export function estimateBase64Size(base64String: string): number {
    // 如果包含前缀，提取实际的base64部分
    const actualBase64 = base64String.split(',')[1] || base64String;
    // base64编码会使数据增大约33%，所以实际大小约为编码长度的3/4
    return Math.ceil((actualBase64.length * 3) / 4);
}

/**
 * 浏览器环境中将File对象转换为base64
 * @param file 文件对象
 * @returns Promise，解析为base64编码的data:URL
 */
export function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
            } else {
                reject(new Error('FileReader结果不是字符串'));
            }
        };
        reader.onerror = () => {
            reject(new Error('读取文件失败'));
        };
        reader.readAsDataURL(file);
    });
} 