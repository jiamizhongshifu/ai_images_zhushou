import React, { useState, useEffect, useRef, ImgHTMLAttributes, useCallback } from 'react';
import { Loader2, ImageIcon } from 'lucide-react';

// 全局预加载队列管理
const PreloadManager = {
  queue: [] as string[],
  inProgress: new Set<string>(),
  maxConcurrent: 5,
  abortControllers: new Map<string, AbortController>(),
  
  add(url: string, priority = false): void {
    if (!url || this.queue.includes(url) || this.inProgress.has(url)) return;
    
    // 高优先级图片添加到队列头部
    if (priority) {
      this.queue.unshift(url);
    } else {
      this.queue.push(url);
    }
    
    // 如果是高优先级且当前加载数未达到上限，立即开始加载
    if (priority && this.inProgress.size < this.maxConcurrent) {
      this.processQueue();
    }
    
    // 使用 requestIdleCallback 在空闲时处理队列
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => this.processQueue());
    } else {
      setTimeout(() => this.processQueue(), 0);
    }
  },
  
  // 处理队列
  processQueue(): void {
    if (this.inProgress.size >= this.maxConcurrent) return;
    
    const url = this.queue.shift();
    if (!url) return;
    
    this.preloadImage(url);
  },
  
  // 预加载图片
  preloadImage(url: string): void {
    // 检查黑名单
    if (ImageBlacklist.has(url)) {
      console.log(`[PreloadManager] 跳过已知失败的图片: ${url}`);
      return;
    }
    
    this.inProgress.add(url);
    
    const controller = new AbortController();
    this.abortControllers.set(url, controller);
    
    // 添加超时处理
    const timeoutId = setTimeout(() => {
      console.warn(`[PreloadManager] 图片加载超时: ${url}`);
      controller.abort();
      this.abortControllers.delete(url);
      this.inProgress.delete(url);
      this.processQueue();
    }, 30000); // 30秒超时
    
    const img = new Image();
    img.src = url;
    
    const handleComplete = () => {
      clearTimeout(timeoutId);
      this.inProgress.delete(url);
      this.abortControllers.delete(url);
      this.processQueue();
      
      // 添加到缓存
      if (img.complete && !img.onerror) {
        ImageCache.add(url, {
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      }
    };
    
    const handleError = () => {
      clearTimeout(timeoutId);
      handleComplete();
      
      // 检查是否为403错误，如果是则直接加入黑名单
      if (url.includes('openai.com')) {
        ImageBlacklist.add(url);
        console.warn(`[PreloadManager] OpenAI图片加载失败，已加入黑名单: ${url}`);
      }
    };
    
    img.onload = handleComplete;
    img.onerror = handleError;
  },
  
  abort(url: string): void {
    const controller = this.abortControllers.get(url);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(url);
    }
    this.queue = this.queue.filter(u => u !== url);
    this.inProgress.delete(url);
  },
  
  abortAll(): void {
    this.abortControllers.forEach(controller => controller.abort());
    this.abortControllers.clear();
    this.queue = [];
    this.inProgress.clear();
  }
};

// LRU缓存实现
class LRUCache<K, V> {
  private capacity: number;
  private cache: Map<K, V>;
  
  constructor(capacity: number) {
    this.capacity = capacity;
    this.cache = new Map();
  }
  
  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;
    
    const value = this.cache.get(key);
    if (value === undefined) return undefined;
    
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }
  
  put(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      const firstKey = Array.from(this.cache.keys())[0];
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }
  
  has(key: K): boolean {
    return this.cache.has(key);
  }
  
  delete(key: K): void {
    this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  getKeys(): K[] {
    return Array.from(this.cache.keys());
  }
}

// 图片缓存管理 - 使用LRU缓存
export interface ImageCacheEntry {
  loaded: boolean;
  timestamp: number;
  width?: number;
  height?: number;
  error?: boolean;
}

export const ImageCache = {
  cache: new LRUCache<string, ImageCacheEntry>(100),
  maxAge: 30 * 60 * 1000, // 缓存30分钟
  
  has(url: string): boolean {
    const entry = this.cache.get(url);
    if (!entry) return false;
    
    const now = Date.now();
    if (now - entry.timestamp > this.maxAge) {
      this.cache.delete(url);
      return false;
    }
    
    return entry.loaded && !entry.error;
  },
  
  add(url: string, metadata?: Partial<ImageCacheEntry>): void {
    this.cache.put(url, {
      loaded: true,
      timestamp: Date.now(),
      ...metadata
    });
  },
  
  getMetadata(url: string): ImageCacheEntry | undefined {
    return this.cache.get(url);
  },
  
  remove(url: string): void {
    this.cache.delete(url);
  },
  
  clear(): void {
    this.cache.clear();
  }
};

// 如果在浏览器环境，设置定期清理缓存
if (typeof window !== 'undefined') {
  // 每5分钟清理过期缓存
  setInterval(() => {
    const now = Date.now();
    const urls = ImageCache.cache.getKeys();
    urls.forEach(url => {
      const entry = ImageCache.cache.get(url);
      if (entry && now - entry.timestamp > ImageCache.maxAge) {
        ImageCache.remove(url);
      }
    });
  }, 5 * 60 * 1000);
  
  // 页面卸载时清理所有预加载任务
  window.addEventListener('beforeunload', () => {
    PreloadManager.abortAll();
  });
  
  // 页面隐藏时暂停预加载
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      PreloadManager.abortAll();
    }
  });
  
  // 网络状态变化时调整预加载策略
  window.addEventListener('online', () => {
    PreloadManager.maxConcurrent = 5;
  });
  
  window.addEventListener('offline', () => {
    PreloadManager.maxConcurrent = 1;
  });
}

// 使用 Intersection Observer Hook
function useIntersectionObserver<T extends Element>(
  elementRef: React.RefObject<T | null>,
  callback: () => void,
  options = {}
) {
  useEffect(() => {
    if (!elementRef.current) return;
    
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        callback();
        observer.disconnect();
      }
    }, options);
    
    observer.observe(elementRef.current);
    
    return () => observer.disconnect();
  }, [elementRef, callback, options]);
}

interface LazyImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'onLoad' | 'onError'> {
  src: string;
  alt: string;
  className?: string;
  placeholderClassName?: string;
  loadingClassName?: string;
  errorClassName?: string;
  loadingElement?: React.ReactNode;
  errorElement?: React.ReactNode;
  onImageLoad?: () => void;
  onImageError?: () => void;
  blurEffect?: boolean;
  fadeIn?: boolean;
  priority?: boolean;
  retryCount?: number;
  retryDelay?: number;
  observerOptions?: IntersectionObserverInit;
}

// 图片黑名单管理器
export const ImageBlacklist = {
  key: 'image_blacklist',
  timeout: 24 * 60 * 60 * 1000, // 24小时后重试
  
  getList(): Set<string> {
    if (typeof window === 'undefined') return new Set();
    
    try {
      const data = localStorage.getItem(this.key);
      if (!data) return new Set();
      
      const items = JSON.parse(data) as Array<{url: string; timestamp: number}>;
      const now = Date.now();
      
      // 清理过期项
      const validItems = items.filter(item => now - item.timestamp < this.timeout);
      if (validItems.length !== items.length) {
        this.saveList(new Set(validItems.map(item => item.url)));
      }
      
      return new Set(validItems.map(item => item.url));
    } catch (e) {
      console.error('[ImageBlacklist] 读取黑名单失败:', e);
      return new Set();
    }
  },
  
  saveList(urls: Set<string>): void {
    if (typeof window === 'undefined') return;
    
    try {
      const items = Array.from(urls).map(url => ({
        url,
        timestamp: Date.now()
      }));
      localStorage.setItem(this.key, JSON.stringify(items));
    } catch (e) {
      console.error('[ImageBlacklist] 保存黑名单失败:', e);
    }
  },
  
  add(url: string): void {
    const list = this.getList();
    list.add(url);
    this.saveList(list);
  },
  
  has(url: string): boolean {
    return this.getList().has(url);
  },
  
  remove(url: string): void {
    const list = this.getList();
    list.delete(url);
    this.saveList(list);
  },
  
  clear(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.key);
  }
};

/**
 * 优化的懒加载图片组件
 * 支持加载状态、错误状态、渐入效果和模糊效果
 */
export function LazyImage({
  src,
  alt,
  className = '',
  placeholderClassName = '',
  loadingClassName = '',
  errorClassName = '',
  loadingElement,
  errorElement,
  onImageLoad,
  onImageError,
  blurEffect = true,
  fadeIn = true,
  priority = false,
  retryCount = 2,
  retryDelay = 2000,
  observerOptions = {},
  ...props
}: LazyImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string | undefined>(undefined);
  const [retries, setRetries] = useState(0);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 指数退避重试延迟计算，添加上限
  const getExponentialDelay = (attempt: number, baseDelay: number): number => {
    return Math.min(baseDelay * Math.pow(1.5, attempt), 10000); // 使用1.5作为基数，最大10秒
  };
  
  // 重试加载图片
  const retryLoadImage = useCallback((url: string) => {
    // 检查黑名单
    if (ImageBlacklist.has(url)) {
      setIsError(true);
      setIsLoading(false);
      onImageError?.();
      return;
    }
    
    if (retries >= retryCount) {
      setIsError(true);
      setIsLoading(false);
      onImageError?.();
      
      // 如果是OpenAI图片且重试失败，加入黑名单
      if (url.includes('openai.com')) {
        ImageBlacklist.add(url);
      }
      return;
    }
    
    const delay = getExponentialDelay(retries, retryDelay);
    setTimeout(() => {
      setRetries(prev => prev + 1);
      setCurrentSrc(undefined);
      setTimeout(() => setCurrentSrc(url), 0);
    }, delay);
  }, [retries, retryCount, retryDelay, onImageError]);
  
  // 加载图片
  const loadImage = useCallback((imageUrl: string | undefined) => {
    if (!imageUrl) return;
    
    // 检查黑名单
    if (ImageBlacklist.has(imageUrl)) {
      setIsError(true);
      setIsLoading(false);
      onImageError?.();
      return;
    }
    
    setIsLoading(true);
    setIsError(false);
    
    // 检查缓存
    if (ImageCache.has(imageUrl)) {
      setIsLoading(false);
      setCurrentSrc(imageUrl);
      onImageLoad?.();
      return;
    }
    
    // 预加载图片
    PreloadManager.add(imageUrl, priority);
    
    const img = new Image();
    
    // 添加超时处理
    const timeoutId = setTimeout(() => {
      console.warn(`[LazyImage] 图片加载超时: ${imageUrl}`);
      img.src = '';
      retryLoadImage(imageUrl);
    }, 30000); // 30秒超时
    
    img.onload = () => {
      clearTimeout(timeoutId);
      setIsLoading(false);
      setCurrentSrc(imageUrl);
      ImageCache.add(imageUrl, {
        width: img.naturalWidth,
        height: img.naturalHeight
      });
      onImageLoad?.();
    };
    
    img.onerror = () => {
      clearTimeout(timeoutId);
      // 如果是OpenAI图片且返回403，直接加入黑名单
      if (imageUrl.includes('openai.com')) {
        ImageBlacklist.add(imageUrl);
        setIsError(true);
        setIsLoading(false);
        onImageError?.();
        return;
      }
      retryLoadImage(imageUrl);
    };
    
    img.src = imageUrl;
  }, [priority, onImageLoad, retryLoadImage, onImageError]);
  
  // 使用 Intersection Observer 处理懒加载
  useIntersectionObserver<HTMLDivElement>(
    containerRef,
    () => loadImage(src),
    observerOptions
  );
  
  // 清理函数
  useEffect(() => {
    return () => {
      if (currentSrc) {
        PreloadManager.abort(currentSrc);
      }
    };
  }, [currentSrc]);
  
  // 渲染加载状态
  if (isLoading) {
    return (
      <div
        ref={containerRef}
        className={`relative ${loadingClassName || placeholderClassName}`}
        style={{ minHeight: '100px' }}
      >
        {loadingElement || (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}
      </div>
    );
  }
  
  // 渲染错误状态
  if (isError) {
    return (
      <div
        ref={containerRef}
        className={`relative ${errorClassName || placeholderClassName}`}
        style={{ minHeight: '100px' }}
      >
        {errorElement || (
          <div className="absolute inset-0 flex items-center justify-center">
            <ImageIcon className="w-6 h-6" />
          </div>
        )}
      </div>
    );
  }
  
  // 渲染图片
  return (
    <div ref={containerRef} className="relative">
      <img
        ref={imageRef}
        src={currentSrc}
        alt={alt}
        className={`
          ${className}
          ${blurEffect ? 'filter blur-0 transition-all duration-300' : ''}
          ${fadeIn ? 'opacity-100 transition-opacity duration-300' : ''}
        `}
        style={{
          opacity: currentSrc ? 1 : 0,
        }}
        {...props}
      />
    </div>
  );
}

/**
 * 优化的背景图片组件
 * 为容器提供懒加载的背景图片，支持加载状态和错误状态
 */
export function LazyBackgroundImage({
  src,
  className = '',
  loadingClassName = '',
  errorClassName = '',
  loadingElement,
  errorElement,
  blurEffect = true,
  fadeIn = true,
  children,
  style,
  priority = false,
  onImageLoad,
  onImageError,
  ...props
}: Omit<LazyImageProps, 'alt'> & { children?: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const imageLoadedRef = useRef<boolean>(false);
  const onImageLoadRef = useRef<(() => void) | undefined>(onImageLoad);
  const onImageErrorRef = useRef<(() => void) | undefined>(onImageError);
  
  const [loaded, setLoaded] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);
  const [inView, setInView] = useState<boolean>(priority);
  
  // 更新回调引用以避免无限循环
  useEffect(() => {
    onImageLoadRef.current = onImageLoad;
    onImageErrorRef.current = onImageError;
  }, [onImageLoad, onImageError]);
  
  // 仅在挂载时检查缓存，避免循环更新
  useEffect(() => {
    if (src && ImageCache.has(src)) {
      if (!imageLoadedRef.current) {
        imageLoadedRef.current = true;
        setLoaded(true);
        
        // 使用引用来调用回调，避免循环更新
        if (onImageLoadRef.current) {
          setTimeout(() => onImageLoadRef.current && onImageLoadRef.current(), 0);
        }
      }
    }
  }, [src]); // 只依赖src变化，不依赖回调函数
  
  // 修改图片加载逻辑，避免重复加载和回调
  useEffect(() => {
    if (!inView || !src || imageLoadedRef.current) return;
    
    if (ImageCache.has(src)) {
      if (!loaded) {
        setLoaded(true);
        imageLoadedRef.current = true;
        
        // 使用引用来调用回调，避免循环更新
        if (onImageLoadRef.current) {
          setTimeout(() => onImageLoadRef.current && onImageLoadRef.current(), 0);
        }
      }
      return;
    }
    
    // 使用预加载管理器
    PreloadManager.add(src);
    
    const img = new Image();
    img.src = src;
    
    const handleLoad = () => {
      if (!imageLoadedRef.current) {
        imageLoadedRef.current = true;
        setLoaded(true);
        setError(false);
        ImageCache.add(src);
        
        // 使用引用来调用回调，避免循环更新
        if (onImageLoadRef.current) {
          setTimeout(() => onImageLoadRef.current && onImageLoadRef.current(), 0);
        }
      }
    };
    
    const handleError = () => {
      setLoaded(false);
      setError(true);
      
      // 使用引用来调用回调，避免循环更新
      if (onImageErrorRef.current) {
        setTimeout(() => onImageErrorRef.current && onImageErrorRef.current(), 0);
      }
    };
    
    img.onload = handleLoad;
    img.onerror = handleError;
    
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [inView, src, loaded]); // 不依赖回调函数，避免循环更新
  
  // 优化交叉观察器
  useEffect(() => {
    if (priority) {
      setInView(true);
      return;
    }
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setInView(true);
          // 一旦元素可见，停止观察
          if (containerRef.current) {
            observer.unobserve(containerRef.current);
          }
        }
      });
    }, {
      rootMargin: '300px',
      threshold: 0.01
    });
    
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    
    observerRef.current = observer;
    
    return () => {
      observer.disconnect();
    };
  }, [priority]); // 仅在priority变化时重新设置观察器
  
  // 样式计算
  const containerStyle: React.CSSProperties = {
    ...style,
    backgroundImage: loaded ? `url(${src})` : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    transition: fadeIn ? 'background-image 0.5s ease-in-out, opacity 0.5s ease-in-out' : 'none',
  };
  
  // 类名生成
  const containerClass = `${className} ${
    loaded ? 'opacity-100' : blurEffect ? 'opacity-90 backdrop-blur-xs' : 'opacity-0'
  }`;
  
  // 默认的加载状态元素
  const defaultLoadingElement = (
    <div className={`absolute inset-0 flex items-center justify-center bg-muted/30 ${loadingClassName}`}>
      <Loader2 className="w-6 h-6 text-primary/60 animate-spin" />
    </div>
  );
  
  // 默认的错误状态元素
  const defaultErrorElement = (
    <div className={`absolute inset-0 flex items-center justify-center bg-muted/30 ${errorClassName}`}>
      <div className="flex flex-col items-center">
        <ImageIcon className="w-6 h-6 text-destructive/60 mb-1" />
        <p className="text-xs text-destructive/80">背景加载失败</p>
      </div>
    </div>
  );
  
  return (
    <div
      ref={containerRef}
      className={containerClass}
      style={containerStyle}
      {...props}
    >
      {/* 加载状态 */}
      {!loaded && inView && (loadingElement || defaultLoadingElement)}
      
      {/* 错误状态 */}
      {error && (errorElement || defaultErrorElement)}
      
      {/* 子元素 */}
      {children}
    </div>
  );
} 