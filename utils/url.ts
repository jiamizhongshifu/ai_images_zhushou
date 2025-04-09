/**
 * URL工具函数
 * 用于获取当前环境的基础URL和构建完整URL
 */

/**
 * 获取当前环境的基础URL
 * 在客户端使用window.location.origin
 * 在服务器端使用环境变量或默认值
 */
export function getBaseUrl() {
  if (typeof window !== 'undefined') {
    // 客户端 - 使用当前窗口的origin
    return window.location.origin;
  }
  // 服务器端 - 使用环境变量或默认值
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
}

/**
 * 构建完整URL
 * @param path 相对路径
 * @returns 完整URL
 */
export function buildUrl(path: string) {
  const base = getBaseUrl();
  // 确保路径以/开头
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

/**
 * 构建相对URL(不包含域名)
 * @param path 路径
 * @param params 查询参数对象
 * @returns 带查询参数的相对URL
 */
export function buildRelativeUrl(path: string, params?: Record<string, string>) {
  // 确保路径以/开头
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // 如果没有参数，直接返回路径
  if (!params || Object.keys(params).length === 0) {
    return normalizedPath;
  }
  
  // 构建查询字符串
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, value);
    }
  });
  
  const queryString = searchParams.toString();
  if (!queryString) {
    return normalizedPath;
  }
  
  return `${normalizedPath}?${queryString}`;
} 