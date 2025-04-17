/**
 * 内存存储系统 - 用于在无法访问原生存储时作为备用
 * 
 * 这个模块提供了一个内存中的存储替代品，解决以下问题：
 * 1. 浏览器隐私模式下localStorage/sessionStorage不可用
 * 2. Safari的ITP (Intelligent Tracking Prevention) 限制第三方Cookie和存储
 * 3. 浏览器扩展或设置禁用Cookie和存储的情况
 */

// 内存存储对象
const memoryStorage: Record<string, string> = {};

// 存储可用性状态
let storageAvailable = {
  localStorage: false,
  sessionStorage: false,
  checked: false
};

// 调试模式
const DEBUG = process.env.NODE_ENV !== 'production';

// 模拟 localStorage API
export const mockLocalStorage = {
  getItem: (key: string): string | null => {
    if (DEBUG) console.log(`[MockStorage] 读取内存项: ${key}`);
    return key in memoryStorage ? memoryStorage[key] : null;
  },
  setItem: (key: string, value: string): void => {
    if (DEBUG) console.log(`[MockStorage] 写入内存项: ${key}`);
    memoryStorage[key] = value;
  },
  removeItem: (key: string): void => {
    if (DEBUG) console.log(`[MockStorage] 删除内存项: ${key}`);
    delete memoryStorage[key];
  },
  clear: (): void => {
    if (DEBUG) console.log(`[MockStorage] 清空内存存储`);
    Object.keys(memoryStorage).forEach(key => {
      delete memoryStorage[key];
    });
  },
  key: (index: number): string | null => {
    return index >= 0 && index < Object.keys(memoryStorage).length 
      ? Object.keys(memoryStorage)[index] 
      : null;
  },
  length: Object.keys(memoryStorage).length
};

/**
 * 检测原生存储是否可用
 */
export function isStorageAvailable(type: 'localStorage' | 'sessionStorage'): boolean {
  // 如果已经检查过，直接返回缓存结果
  if (storageAvailable.checked) {
    return type === 'localStorage' ? storageAvailable.localStorage : storageAvailable.sessionStorage;
  }
  
  if (typeof window === 'undefined') {
    return false;
  }
  
  try {
    const storage = window[type];
    const testKey = `__storage_test__${Date.now()}`;
    
    if (!storage) {
      if (DEBUG) console.warn(`[MockStorage] ${type} 对象不存在`);
      return false;
    }
    
    storage.setItem(testKey, testKey);
    const testResult = storage.getItem(testKey) === testKey;
    storage.removeItem(testKey);
    
    // 缓存检查结果
    if (type === 'localStorage') {
      storageAvailable.localStorage = testResult;
    } else {
      storageAvailable.sessionStorage = testResult;
    }
    
    if (DEBUG) console.log(`[MockStorage] ${type} ${testResult ? '可用' : '不可用'}`);
    return testResult;
  } catch (e) {
    console.warn(`[MockStorage] 检测 ${type} 可用性时出错:`, e);
    
    // 缓存检查结果
    if (type === 'localStorage') {
      storageAvailable.localStorage = false;
    } else {
      storageAvailable.sessionStorage = false;
    }
    
    return false;
  } finally {
    // 标记为已检查
    storageAvailable.checked = true;
  }
}

/**
 * 获取最适合的存储对象 - 优先使用原生存储，降级到内存存储
 */
export function getStorage(): Storage {
  if (typeof window === 'undefined') {
    if (DEBUG) console.log(`[MockStorage] 服务器端环境，使用内存存储`);
    return mockLocalStorage as unknown as Storage;
  }
  
  // 检查并获取存储可用性
  if (isStorageAvailable('localStorage')) {
    if (DEBUG) console.log(`[MockStorage] 使用原生 localStorage`);
    return window.localStorage;
  }
  
  if (DEBUG) console.log(`[MockStorage] localStorage 不可用，降级到内存存储`);
  return mockLocalStorage as unknown as Storage;
}

/**
 * 安全获取存储项
 */
export function safeGetItem(key: string): string | null {
  try {
    if (DEBUG) console.log(`[MockStorage] 安全获取: ${key}`);
    return getStorage().getItem(key);
  } catch (error) {
    console.warn(`[MockStorage] 安全获取${key}失败:`, error);
    // 降级到内存存储
    return mockLocalStorage.getItem(key);
  }
}

/**
 * 安全设置存储项
 */
export function safeSetItem(key: string, value: string): void {
  try {
    if (DEBUG) console.log(`[MockStorage] 安全设置: ${key}`);
    getStorage().setItem(key, value);
    
    // 同步更新内存中的副本以提高容错性
    mockLocalStorage.setItem(key, value);
  } catch (error) {
    console.warn(`[MockStorage] 安全设置${key}失败:`, error);
    // 降级到内存存储
    mockLocalStorage.setItem(key, value);
  }
}

/**
 * 安全删除存储项
 */
export function safeRemoveItem(key: string): void {
  try {
    if (DEBUG) console.log(`[MockStorage] 安全删除: ${key}`);
    getStorage().removeItem(key);
    
    // 同步更新内存中的副本
    mockLocalStorage.removeItem(key);
  } catch (error) {
    console.warn(`[MockStorage] 安全删除${key}失败:`, error);
    // 降级到内存存储，确保至少从内存中删除
    mockLocalStorage.removeItem(key);
  }
}

/**
 * 初始化存储系统
 */
export function initStorage(): void {
  if (typeof window !== 'undefined') {
    console.log(`[MockStorage] 初始化安全存储系统`);
    
    // 在window对象上添加安全存储接口
    (window as any).safeStorage = {
      getItem: safeGetItem,
      setItem: safeSetItem,
      removeItem: safeRemoveItem,
      isAvailable: () => isStorageAvailable('localStorage')
    };
    
    // 存储测试
    try {
      const testKey = `__storage_test__${Date.now()}`;
      safeSetItem(testKey, 'test_value');
      const testValue = safeGetItem(testKey);
      safeRemoveItem(testKey);
      
      if (testValue === 'test_value') {
        console.log('[MockStorage] 存储系统测试成功');
      } else {
        console.warn('[MockStorage] 存储系统测试失败');
      }
    } catch (error) {
      console.error('[MockStorage] 存储系统测试出错:', error);
    }
  }
}

// 自动初始化存储系统
if (typeof window !== 'undefined') {
  initStorage();
} 