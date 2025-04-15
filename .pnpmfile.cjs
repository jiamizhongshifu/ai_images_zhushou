module.exports = {
  hooks: {
    readPackage(pkg) {
      // 允许sharp包运行安装脚本
      if (pkg.name === 'sharp') {
        pkg.scripts = {
          ...pkg.scripts,
          install: 'node-gyp rebuild'
        };
      }
      return pkg;
    }
  }
}; 