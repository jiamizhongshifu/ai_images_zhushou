/**
 * 登录路径修复脚本
 * 
 * 这个脚本会拦截所有对/login路径的请求并重定向到/sign-in
 * 用于解决硬编码路径问题
 */

// 监听页面加载完成
document.addEventListener('DOMContentLoaded', function() {
  console.log('[登录修复] 初始化登录路径修复脚本 - 临时授权已禁用');
  
  // 添加会话恢复检测逻辑
  function setupSessionRecoveryDetection() {
    console.log('[登录修复] 临时授权和会话恢复逻辑已禁用');
    
    // 清除之前设置的所有会话恢复和临时授权标记
    document.cookie = 'sb-session-recovery=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
    document.cookie = 'manualAuth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
    localStorage.removeItem('wasAuthenticated');
    sessionStorage.removeItem('wasAuthenticated');
    sessionStorage.removeItem('redirect_attempts');
    sessionStorage.removeItem('redirect_loop_detected');
    
    // 不再记录认证状态 - 使用标准认证流程
    if (window.location.pathname.startsWith('/protected')) {
      console.log('[登录修复] 在受保护页面 - 使用标准认证流程');
    }
  }
  
  // 在页面加载时清除临时授权标记
  setupSessionRecoveryDetection();
  
  // 使用MutationObserver监听DOM变化，可能表示SPA路由变化
  const observer = new MutationObserver(function(mutations) {
    // 检查是否有路由变化
    if (mutations.some(m => m.type === 'childList' && m.addedNodes.length > 0)) {
      // 等待DOM完全更新
      setTimeout(setupSessionRecoveryDetection, 100);
    }
  });
  
  // 开始观察整个文档的变化
  observer.observe(document.body, { childList: true, subtree: true });
  
  // 修补全局fetch函数，拦截对/login的请求
  const originalFetch = window.fetch;
  window.fetch = function(resource, options) {
    if (typeof resource === 'string' && resource.includes('/login')) {
      console.log('[登录修复] 拦截到/login请求，重定向到/sign-in');
      resource = resource.replace('/login', '/sign-in');
    }
    return originalFetch.call(this, resource, options);
  };
  
  // 监听所有导航事件
  window.addEventListener('click', function(event) {
    // 检查点击的元素是否是链接
    const link = event.target.closest('a');
    if (link && link.href && link.href.includes('/login')) {
      console.log('[登录修复] 拦截到/login链接点击，重定向到/sign-in');
      event.preventDefault();
      window.location.href = link.href.replace('/login', '/sign-in');
    }
  }, true);
  
  // 修补history API
  const originalPushState = history.pushState;
  history.pushState = function(state, title, url) {
    if (url && typeof url === 'string' && url.includes('/login')) {
      console.log('[登录修复] 拦截到history.pushState到/login，重定向到/sign-in');
      url = url.replace('/login', '/sign-in');
    }
    return originalPushState.call(this, state, title, url);
  };
  
  // 修补Router的实现（针对React Router或Next.js Router）
  // 这是一个通用方法，会定期检查并替换Router的push方法
  function patchRouter() {
    if (window.router && window.router.push) {
      const originalRouterPush = window.router.push;
      window.router.push = function(path, ...args) {
        if (typeof path === 'string' && path.includes('/login')) {
          console.log('[登录修复] 拦截到router.push到/login，重定向到/sign-in');
          path = path.replace('/login', '/sign-in');
        }
        return originalRouterPush.call(this, path, ...args);
      };
    } else {
      // 尝试查找全局导航对象
      const possibleRouters = ['Router', 'router', 'navigation', 'nav'];
      for (const routerName of possibleRouters) {
        if (window[routerName] && window[routerName].push) {
          const originalPush = window[routerName].push;
          window[routerName].push = function(path, ...args) {
            if (typeof path === 'string' && path.includes('/login')) {
              console.log(`[登录修复] 拦截到${routerName}.push到/login，重定向到/sign-in`);
              path = path.replace('/login', '/sign-in');
            }
            return originalPush.call(this, path, ...args);
          };
        }
      }
    }
    
    // 针对Next.js的特殊处理
    if (window.__NEXT_DATA__ && window.__NEXT_DATA__.buildId) {
      console.log('[登录修复] 检测到Next.js应用，应用特殊修复');
      // 这里可以添加针对Next.js的特殊处理
    }
  }
  
  // 多次尝试修补Router，因为它可能在页面加载后才被初始化
  patchRouter();
  setTimeout(patchRouter, 100);
  setTimeout(patchRouter, 500);
  setTimeout(patchRouter, 1000);
  
  console.log('[登录修复] 登录路径修复脚本加载完成 - 临时授权已禁用');
}); 