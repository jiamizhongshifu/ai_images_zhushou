import React, { useState, useEffect, useRef, ImgHTMLAttributes } from 'react';
import { Loader2, ImageIcon } from 'lucide-react';

// 全局预加载队列管理
const PreloadManager = {
  queue: [] as string[],
  inProgress: new Set<string>(),
  maxConcurrent: 5, // 最大并发加载数
  
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
    
    const img = new Image();
    img.src = url;
    
    const handleComplete = () => {
      this.inProgress.delete(url);
      this.processQueue();
    };
    
    img.onload = handleComplete;
    img.onerror = handleComplete;
  }
};

// 图片缓存管理
const ImageCache = {
  cache: new Map<string, boolean>(),
  
  // 检查图片是否已缓存
  has(url: string): boolean {
    return this.cache.has(url);
  },
  
  // 添加到缓存
  add(url: string): void {
    this.cache.set(url, true);
  },
  
  // 从缓存中移除
  remove(url: string): void {
    this.cache.delete(url);
  }
};

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
  ...props
}: LazyImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const imageLoadedRef = useRef<boolean>(false);
  const onImageLoadRef = useRef(onImageLoad);
  const onImageErrorRef = useRef(onImageError);
  
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
    // 检查图片是否已在缓存中
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
    imageRef.current = img;
    
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
      // 清理事件监听
      if (imageRef.current) {
        imageRef.current.onload = null;
        imageRef.current.onerror = null;
      }
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
  
  // 渲染加载中的预览或错误状态
  if (error) {
    return (
      <div ref={containerRef} className={`relative ${placeholderClassName}`} style={props.style}>
        {errorElement || defaultErrorElement}
      </div>
    );
  }
  
  return (
    <div ref={containerRef} className={`relative ${placeholderClassName}`} style={props.style}>
      {/* 加载状态 */}
      {!loaded && (inView ? loadingElement || defaultLoadingElement : null)}
      
      {/* 只有在视口中或高优先级时才加载图片 */}
      {inView && (
        <img
          src={src}
          alt={alt}
          className={imageClass}
          onLoad={() => {
            // 使用引用中的回调函数，避免重新渲染导致的无限循环
            if (onImageLoadRef.current) {
              onImageLoadRef.current();
            }
          }}
          onError={() => {
            // 使用引用中的回调函数，避免重新渲染导致的无限循环
            if (onImageErrorRef.current) {
              onImageErrorRef.current();
            }
          }}
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
  const onImageLoadRef = useRef(onImageLoad);
  const onImageErrorRef = useRef(onImageError);
  
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