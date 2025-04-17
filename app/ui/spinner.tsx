import React from 'react';
import { cn } from '@/lib/utils';

type SpinnerProps = {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeClasses = {
  xs: 'h-2 w-2 border',
  sm: 'h-3 w-3 border',
  md: 'h-4 w-4 border-2',
  lg: 'h-6 w-6 border-2'
};

export default function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div 
      className={cn(
        "animate-spin rounded-full border-gray-300 border-t-transparent", 
        sizeClasses[size],
        className
      )}
    />
  );
} 