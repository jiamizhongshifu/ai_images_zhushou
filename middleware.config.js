// middleware.config.js
module.exports = {
  // 增加API路由的请求体大小限制
  api: {
    bodyParser: {
      sizeLimit: '16mb', // 设置较大的请求体大小限制，允许上传较大图片
    },
    responseLimit: false, // 禁用响应大小限制
  },
  // 图像优化配置
  images: {
    // 允许的优化图像大小范围
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    // 允许的图像宽度
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384, 512, 1024, 2048],
    // 允许的图像域名
    domains: ['filesystem.site', 'images.unsplash.com'],
    // 最大尺寸限制
    minimumCacheTTL: 60, // 缓存时间（秒）
  },
}; 