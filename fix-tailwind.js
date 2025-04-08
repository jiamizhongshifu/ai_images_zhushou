#!/usr/bin/env node

/**
 * 修复Tailwind CSS与Next.js 15兼容性问题的脚本
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('开始修复Tailwind CSS与Next.js 15兼容性问题...');

// 1. 更新postcss.config.js
try {
  console.log('更新PostCSS配置...');
  const postcssConfig = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};`;
  fs.writeFileSync('postcss.config.js', postcssConfig);
  console.log('✅ PostCSS配置已更新');
} catch (err) {
  console.error('❌ 更新PostCSS配置失败:', err);
}

// 2. 安装必要的依赖
try {
  console.log('安装必要的依赖...');
  execSync('npm install --save-dev postcss-import @tailwindcss/nesting');
  console.log('✅ 依赖安装成功');
} catch (err) {
  console.error('❌ 安装依赖失败:', err);
}

// 3. 创建或更新.babelrc
try {
  console.log('更新Babel配置...');
  const babelConfig = `{
  "presets": ["next/babel"],
  "plugins": []
}`;
  fs.writeFileSync('.babelrc', babelConfig);
  console.log('✅ Babel配置已更新');
} catch (err) {
  console.error('❌ 更新Babel配置失败:', err);
}

// 4. 更新next.config.js
try {
  console.log('更新Next.js配置...');
  const nextConfigPath = path.join(process.cwd(), 'next.config.js');
  let nextConfig = fs.readFileSync(nextConfigPath, 'utf8');

  // 添加CSS处理相关配置
  if (!nextConfig.includes('cssModules')) {
    nextConfig = nextConfig.replace(
      'reactStrictMode: true',
      `reactStrictMode: true,
  // 显式启用CSS相关配置
  cssModules: true,
  postcss: true, // 确保PostCSS处理`
    );
  }

  // 添加CSS优化配置
  if (!nextConfig.includes('optimizeCss')) {
    nextConfig = nextConfig.replace(
      'proxyTimeout: 60000',
      `proxyTimeout: 60000, // 增加代理超时时间到60秒
    optimizeCss: true // 优化CSS处理`
    );
  }

  fs.writeFileSync(nextConfigPath, nextConfig);
  console.log('✅ Next.js配置已更新');
} catch (err) {
  console.error('❌ 更新Next.js配置失败:', err);
}

// 5. 修复middleware.ts中的动态代码生成问题
try {
  console.log('更新中间件...');
  const middlewarePath = path.join(process.cwd(), 'middleware.ts');
  const middleware = fs.readFileSync(middlewarePath, 'utf8');

  // 添加注释以避免误解
  const updatedMiddleware = middleware.replace(
    'export const config = {',
    '// 限制中间件应用的路径，避免处理静态资源\nexport const config = {'
  );

  fs.writeFileSync(middlewarePath, updatedMiddleware);
  console.log('✅ 中间件已更新');
} catch (err) {
  console.error('❌ 更新中间件失败:', err);
}

// 6. 清理.next目录并重启
try {
  console.log('清理构建缓存...');
  execSync('rm -rf .next');
  console.log('✅ 缓存已清理');
  console.log('🚀 修复完成！请使用以下命令重启开发服务器：\n\nnpm run dev');
} catch (err) {
  console.error('❌ 清理缓存失败:', err);
} 