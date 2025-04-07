/**
 * 日期格式化工具函数
 */

/**
 * 格式化相对时间，例如"1小时前"
 */
export function formatRelative(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);
  
  // 格式化具体时间
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  
  // 当前年份不显示年
  const dateStr = year === now.getFullYear() 
    ? `${month}-${day} ${hours}:${minutes}`
    : `${year}-${month}-${day} ${hours}:${minutes}`;
  
  // 根据时间差返回不同的格式
  if (diffSec < 60) {
    return `刚刚 (${dateStr})`;
  } else if (diffMin < 60) {
    return `${diffMin}分钟前 (${dateStr})`;
  } else if (diffHour < 24) {
    return `${diffHour}小时前 (${dateStr})`;
  } else if (diffDay < 30) {
    return `${diffDay}天前 (${dateStr})`;
  } else {
    return dateStr;
  }
}

/**
 * 格式化日期为YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * 格式化日期时间为YYYY-MM-DD HH:MM:SS
 */
export function formatDateTime(date: Date): string {
  const dateStr = formatDate(date);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  
  return `${dateStr} ${hours}:${minutes}:${seconds}`;
}

/**
 * 将ISO格式字符串转换为友好的日期显示
 */
export function formatISOString(isoString: string): string {
  try {
    const date = new Date(isoString);
    return formatRelative(date);
  } catch (error) {
    console.error('日期格式化错误:', error);
    return isoString;
  }
} 