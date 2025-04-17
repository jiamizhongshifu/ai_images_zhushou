import React, { useState, useEffect, useRef, ImgHTMLAttributes } from 'react';
import { Loader2, ImageIcon } from 'lucide-react';

// 全局预加载队列管理
const PreloadManager = {
  queue: [] as string[],
  inProgress: new Set<string>(),
  maxConcurrent: 5,
  abortControllers: new Map<string, AbortController>(),
  
  // 添加到预加载队列
  add(url: string): void {
    if (!url || this.queue.includes(url) || this.inProgress.has(url)) return;
    this.queue.push(url);
    this.processQueue();
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
    this.inProgress.add(url);
    
    const controller = new AbortController();
    this.abortControllers.set(url, controller);
    
    const img = new Image();
    img.src = url;
    
    const handleComplete = () => {
      this.inProgress.delete(url);
      this.abortControllers.delete(url);
      this.processQueue();
    };
    
    img.onload = handleComplete;
    img.onerror = handleComplete;
  },
  
  // 清理指定URL的预加载
  abort(url: string): void {
    const controller = this.abortControllers.get(url);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(url);
    }
    this.queue = this.queue.filter(u => u !== url);
    this.inProgress.delete(url);
  },
  
  // 清理所有预加载
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
const ImageCache = {
  cache: new LRUCache<string, {loaded: boolean, timestamp: number}>(100), // 最多缓存100张图片
  maxAge: 30 * 60 * 1000, // 缓存30分钟
  
  has(url: string): boolean {
    const entry = this.cache.get(url);
    if (!entry) return false;
    
    const now = Date.now();
    if (now - entry.timestamp > this.maxAge) {
      this.cache.delete(url);
      return false;
    }
    
    return entry.loaded;
  },
  
  add(url: string): void {
    this.cache.put(url, {loaded: true, timestamp: Date.now()});
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
  priority?: boolean; // 高优先级图片，立即加载
  retryCount?: number; // 加载失败重试次数
  retryDelay?: number; // 重试延迟(毫秒)
}

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
  retryCount = 2, // 默认重试2次
  retryDelay = 2000, // 默认延迟2秒
  ...props
}: LazyImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const imageLoadedRef = useRef<boolean>(false);
  const onImageLoadRef = useRef<(() => void) | undefined>(onImageLoad);
  const onImageErrorRef = useRef<(() => void) | undefined>(onImageError);
  const retryAttemptsRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const [loaded, setLoaded] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);
  const [inView, setInView] = useState<boolean>(priority);
  const [imageSrc, setImageSrc] = useState<string>(src);
  
  // 当src变化时，重置状态
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    imageLoadedRef.current = false;
    retryAttemptsRef.current = 0;
    setLoaded(false);
    setError(false);
    setImageSrc(src);
    
    // 如果图片已在视口内，立即尝试加载
    if (inView) {
      loadImage(src);
    }
  }, [src]);
  
  // 更新回调引用以避免无限循环
  useEffect(() => {
    onImageLoadRef.current = onImageLoad;
    onImageErrorRef.current = onImageError;
  }, [onImageLoad, onImageError]);
  
  // 计算指数退避延迟
  const getExponentialDelay = (attempt: number, baseDelay: number): number => {
    return Math.min(baseDelay * Math.pow(2, attempt - 1), 10000); // 最大延迟10秒
  };
  
  // 修改retryLoadImage函数
  const retryLoadImage = (url: string) => {
    if (retryAttemptsRef.current < retryCount) {
      retryAttemptsRef.current += 1;
      console.log(`[LazyImage] 图片加载失败，第 ${retryAttemptsRef.current} 次重试: ${url}`);
      
      // 使用指数退避延迟
      const currentDelay = getExponentialDelay(retryAttemptsRef.current, retryDelay);
      
      setTimeout(() => {
        // 尝试使用图片代理
        if (retryAttemptsRef.current > 1 && url.includes('openai.com')) {
          const proxyUrl: string = `/api/image-proxy?url=${encodeURIComponent(url)}&source=openai`;
          console.log(`[LazyImage] 尝试使用代理URL: ${proxyUrl}`);
          setImageSrc(proxyUrl);
          loadImage(proxyUrl);
        } else {
          // 添加时间戳防止缓存
          const cacheBustUrl: string = url.includes('?') ? 
            `${url}&_retry=${Date.now()}` : 
            `${url}?_retry=${Date.now()}`;
          setImageSrc(cacheBustUrl);
          loadImage(cacheBustUrl);
        }
      }, currentDelay);
    } else {
      setError(true);
      if (onImageErrorRef.current) {
        onImageErrorRef.current();
      }
    }
  };
  
  // 加载图片的核心函数
  const loadImage = (imageUrl: string | undefined) => {
    if (!imageUrl) return;
    
    // 如果已经加载完成，不再重复加载
    if (imageLoadedRef.current) return;
    
    // 检查缓存
    if (ImageCache.has(imageUrl)) {
      console.log(`[LazyImage] 使用缓存的图片: ${imageUrl}`);
      setLoaded(true);
      imageLoadedRef.current = true;
      if (onImageLoadRef.current) {
        setTimeout(() => onImageLoadRef.current && onImageLoadRef.current(), 0);
      }
      return;
    }
    
    // 创建新的abort controller
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    // 添加到预加载队列
    PreloadManager.add(imageUrl);
    
    // 创建新的Image元素
    const img = new Image();
    imageRef.current = img;
    
    img.onload = () => {
      if (imageLoadedRef.current) return;
      
      console.log(`[LazyImage] 图片加载成功: ${imageUrl}`);
      imageLoadedRef.current = true;
      setLoaded(true);
      setError(false);
      ImageCache.add(imageUrl);
      
      if (onImageLoadRef.current) {
        setTimeout(() => onImageLoadRef.current && onImageLoadRef.current(), 0);
      }
    };
    
    img.onerror = () => {
      console.error(`[LazyImage] 图片加载失败: ${imageUrl}`);
      
      // 尝试重试
      retryLoadImage(imageUrl);
    };
    
    img.src = imageUrl;
  };
  
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
      rootMargin: '300px', // 提前300px开始加载
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
  
  // 当元素进入视口时加载图片
  useEffect(() => {
    if (inView && !imageLoadedRef.current && !error) {
      loadImage(imageSrc);
    }
  }, [inView, imageSrc, error]);
  
  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      if (imageRef.current) {
        imageRef.current.onload = null;
        imageRef.current.onerror = null;
      }
      
      if (src) {
        PreloadManager.abort(src);
      }
    };
  }, [src]);
  
  // 基础图片样式
  const baseImageClass = `${className} ${fadeIn ? 'transition-opacity duration-500' : ''}`;
  
  // 图片加载状态样式
  const imageClass = `${baseImageClass} ${
    !loaded ? 'opacity-0' : 'opacity-100'
  }`;
  
  // 默认的加载状态元素
  const defaultLoadingElement = (
    <div className={`flex items-center justify-center bg-muted/30 ${loadingClassName}`}>
      <Loader2 className="w-6 h-6 text-primary/60 animate-spin" />
    </div>
  );
  
  // 默认的错误状态元素
  const defaultErrorElement = (
    <div className={`flex items-center justify-center bg-muted/30 ${errorClassName}`}>
      <div className="flex flex-col items-center">
        <ImageIcon className="w-6 h-6 text-destructive/60 mb-1" />
        <p className="text-xs text-destructive/80">加载失败</p>
      </div>
    </div>
  );
  
  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden ${blurEffect && loaded ? 'after:absolute after:inset-0 after:bg-gradient-to-t after:from-black/5 after:to-transparent' : ''}`}
    >
      {/* 图片加载状态 */}
      {inView && !loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          {loadingElement || defaultLoadingElement}
        </div>
      )}
      
      {/* 图片错误状态 */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          {errorElement || defaultErrorElement}
        </div>
      )}
      
      {/* 实际图片 - 仅当在视口内才渲染 */}
      {inView && (
        <img
          src={imageSrc}
          alt={alt}
          className={imageClass}
          loading={priority ? 'eager' : 'lazy'}
          {...props}
        />
      )}
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