/** @type {import('next').NextConfig} */

// 确保环境变量加载
require('./utils/load-env');

const nextConfig = {
  // 确保环境变量可用于客户端
  env: {
    OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-all',
    NEXT_PUBLIC_ZPAY_PID: process.env.ZPAY_PID || "2025040215385823",
  },
  // Next.js配置
  reactStrictMode: true,
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'localhost:3001'],
      bodySizeLimit: '2mb'
    },
    proxyTimeout: 60000, // 增加代理超时时间到60秒
  },
  // 添加Supabase认证代理
  async rewrites() {
    return [
      {
        source: '/auth/:path*',
        destination: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/:path*`,
      }
    ]
  },
  // 配置允许的图片域名
  images: {
    domains: ['filesystem.site', 'oaiusercontent.com', 'cdn.openai.com', 'cdn-uploads.huggingface.co'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'filesystem.site',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: '*.filesystem.site',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.openai.com',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: '*.openai.com',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: 'cdn-uploads.huggingface.co',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: '*.huggingface.co',
        pathname: '**',
      }
    ],
    unoptimized: true,
  },
  // 添加安全头部和CSP配置
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: `
              default-src 'self';
              script-src 'self' 'unsafe-inline' 'unsafe-eval';
              style-src 'self' 'unsafe-inline';
              img-src 'self' data: blob: https://filesystem.site https://*.filesystem.site https://cdn.openai.com https://*.openai.com https://cdn-uploads.huggingface.co https://*.huggingface.co;
              font-src 'self';
              connect-src 'self' https://*.supabase.co https://api.openai.com https://*.openai.com https://filesystem.site https://*.filesystem.site https://*.huggingface.co;
              frame-src 'self';
              media-src 'self';
            `.replace(/\s+/g, ' ').trim(),
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig 