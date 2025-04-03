/** @type {import('next').NextConfig} */

// 确保环境变量加载
require('./utils/load-env');

const nextConfig = {
  // 确保环境变量可用于客户端
  env: {
    OPENAI_MODEL: process.env.TUZI_MODEL || 'gpt-4o-all',
  },
  // Next.js配置
  reactStrictMode: true,
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'localhost:3001'],
      bodySizeLimit: '2mb'
    },
  },
}

module.exports = nextConfig 