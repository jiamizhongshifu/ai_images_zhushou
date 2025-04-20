/**
 * 环境配置管理
 */

// 获取当前环境
const getEnvironment = () => {
  if (typeof window === 'undefined') return process.env.NODE_ENV || 'development';
  
  // 根据域名判断环境
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'development';
  if (hostname.includes('-staging')) return 'staging';
  return 'production';
};

// 获取站点URL
export const getSiteUrl = () => {
  const env = getEnvironment();
  
  switch (env) {
    case 'production':
      return process.env.NEXT_PUBLIC_SITE_URL || 'https://your-production-domain.com';
    case 'staging':
      return process.env.NEXT_PUBLIC_STAGING_URL || 'https://staging.your-domain.com';
    default:
      return process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:3000';
  }
};

// Supabase配置
export const getSupabaseConfig = () => {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    // 根据环境设置重定向URL
    redirectUrl: `${getSiteUrl()}/auth/callback`,
    // 邮件确认URL
    emailConfirmationUrl: `${getSiteUrl()}/auth/confirm`,
  };
};

// 导出环境判断函数
export const isProduction = () => getEnvironment() === 'production';
export const isStaging = () => getEnvironment() === 'staging';
export const isDevelopment = () => getEnvironment() === 'development'; 