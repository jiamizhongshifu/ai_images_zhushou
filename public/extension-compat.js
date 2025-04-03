/**
 * 浏览器扩展兼容性脚本 - 增强版
 * 用于过滤和处理来自浏览器扩展的冲突和错误
 */

(function() {
  // 防止脚本多次执行
  if (window.__extensionCompatLoaded) {
    console.log('[Extension Compat] 扩展兼容性脚本已加载，跳过重复执行');
    return;
  }

  window.__extensionCompatLoaded = true;
  console.log('[Extension Compat] 扩展兼容性处理已启用');

  // 防递归调用保护
  let recursionCounter = 0;
  const MAX_RECURSION = 5;
  
  // 递归保护装饰器
  function withRecursionProtection(fn, fnName) {
    return function(...args) {
      recursionCounter++;
      
      if (recursionCounter > MAX_RECURSION) {
        recursionCounter--;
        console.warn(`[Extension Compat] 检测到可能的递归调用: ${fnName}，已阻止`);
        return undefined;
      }
      
      try {
        return fn.apply(this, args);
      } finally {
        recursionCounter--;
      }
    };
  }

  // 已知的浏览器扩展ID列表
  const knownExtensionIds = [
    'pejdijmoenmkgeppbflobdenhhabjlaj',  // 可能是Chrome的某个扩展
    'nkbihfbeogaeaoehlefnkodbefgpgknn',  // MetaMask
    'ejbalbakoplchlghecdalmeeeajnimhm',  // MetaMask Flask
    'cfhdojbkjhnklbpkdaibdccddilifddb',  // AdBlock Plus
    'gighmmpiobklfepjocnamgkkbiglidom',  // AdBlock
    'cjpalhdlnbpafiamejdnhcphjbkeiagm',  // uBlock Origin
    'pkehgijcmpdhfbdbbnkijodmdjhbjlgp'   // Privacy Badger
  ];

  // 原始console方法
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  
  // 检查消息是否来自已知的扩展
  function isExtensionMessage(message) {
    if (typeof message !== 'string') return false;
    
    // 检查是否包含扩展ID
    return knownExtensionIds.some(id => message.includes(id));
  }
  
  // 检查消息是否是无关紧要的浏览器扩展错误
  function isIgnorableExtensionMessage(message) {
    if (typeof message !== 'string') return false;
    
    const ignorablePatterns = [
      'extension.js',
      'MetaMask',
      'content.js',
      'content-script',
      'extension://',
      'chrome-extension://',
      'Cannot read properties of undefined',
      'lockdown.js',
      'Failed to fetch',
      'ERR_FILE_NOT_FOUND',
      'firewall.bundle.js',
      'chrome.runtime',
      'resource://',
      'extensionState.js',
      'bundle.js',
      '扩展兼容'
    ];
    
    return ignorablePatterns.some(pattern => message.includes(pattern));
  }

  // 覆盖console.error以过滤扩展错误
  console.error = withRecursionProtection(function(...args) {
    // 过滤掉可忽略的扩展错误
    if (args.length > 0 && isIgnorableExtensionMessage(String(args[0]))) {
      return;
    }
    originalConsoleError.apply(console, args);
  }, 'console.error');

  // 覆盖console.warn以过滤扩展警告
  console.warn = withRecursionProtection(function(...args) {
    // 过滤掉可忽略的扩展警告
    if (args.length > 0 && isIgnorableExtensionMessage(String(args[0]))) {
      return;
    }
    originalConsoleWarn.apply(console, args);
  }, 'console.warn');

  // 安全的属性访问器，防止递归
  function safeDefineProperty(obj, prop, descriptor) {
    if (!obj || typeof obj !== 'object' || obj.__handledByExtensionCompat) return;
    
    try {
      const original = Object.getOwnPropertyDescriptor(obj, prop);
      if (!original) return;
      
      if (original.get) {
        const originalGetter = original.get;
        
        original.get = withRecursionProtection(function() {
          return originalGetter.call(this);
        }, `getter_${prop}`);
      }
      
      if (original.set) {
        const originalSetter = original.set;
        
        original.set = withRecursionProtection(function(val) {
          return originalSetter.call(this, val);
        }, `setter_${prop}`);
      }
      
      // 标记已处理
      obj.__handledByExtensionCompat = true;
      
      Object.defineProperty(obj, prop, original);
    } catch (e) {
      // 忽略无法修改的属性
    }
  }

  // 保护Object.defineProperty，捕获递归定义
  const originalDefineProperty = Object.defineProperty;
  Object.defineProperty = withRecursionProtection(function(obj, prop, descriptor) {
    // 阻止可能导致递归的defineProperty调用
    if (recursionCounter > 2 && 
        obj && typeof obj === 'object' && 
        (descriptor.get || descriptor.set)) {
      console.warn(`[Extension Compat] 阻止可能导致递归的Object.defineProperty: ${prop}`);
      return obj;
    }
    
    return originalDefineProperty.call(this, obj, prop, descriptor);
  }, 'Object.defineProperty');

  // 保护window对象上的关键属性
  window.addEventListener('load', () => {
    // 防止扩展修改关键API
    for (const key of ['fetch', 'XMLHttpRequest', 'WebSocket']) {
      safeDefineProperty(window, key);
    }
  });

  // 全局错误处理
  window.addEventListener('error', function(event) {
    // 过滤掉扩展相关错误
    if (isIgnorableExtensionMessage(event.message)) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
  }, true);

  // 全局未处理的Promise rejection处理
  window.addEventListener('unhandledrejection', function(event) {
    // 过滤掉扩展相关错误
    if (event.reason && isIgnorableExtensionMessage(String(event.reason))) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
  }, true);

  console.log('[Extension Compat] 扩展兼容性处理初始化完成');
})(); 