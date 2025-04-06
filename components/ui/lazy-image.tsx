import React, { useState, useEffect, useRef, ImgHTMLAttributes } from 'react';
import { Loader2, ImageIcon } from 'lucide-react';

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
  ...props
}: LazyImageProps) {
  const [loaded, setLoaded] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);
  const [inView, setInView] = useState<boolean>(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  
  // 处理图片加载
  const handleImageLoad = () => {
    setLoaded(true);
    setError(false);
    if (onImageLoad) onImageLoad();
  };
  
  // 处理图片加载错误
  const handleImageError = () => {
    setLoaded(false);
    setError(true);
    if (onImageError) onImageError();
  };
  
  // 设置交叉观察器监听元素可见性
  useEffect(() => {
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setInView(true);
          // 一旦元素可见，停止观察
          if (observerRef.current && imgRef.current) {
            observerRef.current.unobserve(imgRef.current);
          }
        }
      });
    }, {
      rootMargin: '200px', // 提前200px开始加载图片
      threshold: 0.01 // 只需要1%可见就开始加载
    });
    
    if (imgRef.current) {
      observerRef.current.observe(imgRef.current);
    }
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);
  
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
      <div ref={imgRef} className={`relative ${placeholderClassName}`} style={props.style}>
        {errorElement || defaultErrorElement}
      </div>
    );
  }
  
  return (
    <div ref={imgRef} className={`relative ${placeholderClassName}`} style={props.style}>
      {/* 加载状态 */}
      {!loaded && (inView ? loadingElement || defaultLoadingElement : null)}
      
      {/* 只有在视口中才加载图片 */}
      {inView && (
        <img
          src={src}
          alt={alt}
          className={imageClass}
          onLoad={handleImageLoad}
          onError={handleImageError}
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
  ...props
}: Omit<LazyImageProps, 'alt'> & { children?: React.ReactNode }) {
  const [loaded, setLoaded] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);
  const [inView, setInView] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  
  // 预加载图片
  useEffect(() => {
    if (!inView || !src) return;
    
    const img = new Image();
    img.src = src;
    
    img.onload = () => {
      setLoaded(true);
      setError(false);
      if (props.onImageLoad) props.onImageLoad();
    };
    
    img.onerror = () => {
      setLoaded(false);
      setError(true);
      if (props.onImageError) props.onImageError();
    };
  }, [inView, src, props.onImageLoad, props.onImageError]);
  
  // 设置交叉观察器
  useEffect(() => {
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setInView(true);
          // 一旦元素可见，停止观察
          if (observerRef.current && containerRef.current) {
            observerRef.current.unobserve(containerRef.current);
          }
        }
      });
    }, {
      rootMargin: '200px',
      threshold: 0.01
    });
    
    if (containerRef.current) {
      observerRef.current.observe(containerRef.current);
    }
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);
  
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
      {inView && !loaded && !error && (loadingElement || defaultLoadingElement)}
      
      {/* 错误状态 */}
      {error && (errorElement || defaultErrorElement)}
      
      {/* 子元素 */}
      {children}
    </div>
  );
} 