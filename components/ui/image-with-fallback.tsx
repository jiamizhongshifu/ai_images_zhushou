"use client"

import React, { useState } from 'react'
import Image, { ImageProps } from 'next/image'
import { Tag } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImageWithFallbackProps extends Omit<ImageProps, 'onError'> {
  fallback?: React.ReactNode
  fallbackClassName?: string
}

export function ImageWithFallback({
  alt,
  src,
  fallback,
  fallbackClassName,
  className,
  ...props
}: ImageWithFallbackProps) {
  const [error, setError] = useState(false)
  
  // 如果src是空字符串或不存在，直接显示fallback
  const showFallback = error || !src || src === ''

  // 默认fallback是一个Tag图标
  const defaultFallback = (
    <div className={cn(
      "flex items-center justify-center w-full h-full bg-muted", 
      fallbackClassName
    )}>
      <Tag className="h-8 w-8 text-muted-foreground" />
    </div>
  )

  if (showFallback) {
    return fallback || defaultFallback
  }

  return (
    <Image
      alt={alt}
      src={src}
      className={className}
      onError={() => setError(true)}
      {...props}
    />
  )
} 