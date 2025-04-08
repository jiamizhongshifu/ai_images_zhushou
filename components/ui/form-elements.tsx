import React, { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, X, Check, AlertCircle, Info } from 'lucide-react';
import { 
  Input as ShadcnInput
} from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// 接口定义
interface EnhancedInputProps extends React.ComponentProps<"input"> {
  label?: string;
  helperText?: string;
  errorMessage?: string;
  successMessage?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onClear?: () => void;
  showClearButton?: boolean;
  required?: boolean;
  labelClassName?: string;
  inputWrapperClassName?: string;
  helperTextClassName?: string;
  errorClassName?: string;
  successClassName?: string;
}

interface EnhancedPasswordInputProps extends Omit<EnhancedInputProps, 'type'> {
  showPasswordByDefault?: boolean;
}

interface EnhancedTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  errorMessage?: string;
  successMessage?: string;
  showCounter?: boolean;
  maxLength?: number;
  onClear?: () => void;
  showClearButton?: boolean;
  required?: boolean;
  labelClassName?: string;
  textareaWrapperClassName?: string;
  helperTextClassName?: string;
  errorClassName?: string;
  successClassName?: string;
  resizable?: boolean;
}

/**
 * 增强型输入框组件
 * 提供标签、辅助文本、错误消息、成功消息、图标、清除按钮等功能
 */
export function EnhancedInput({
  label,
  helperText,
  errorMessage,
  successMessage,
  leftIcon,
  rightIcon,
  onClear,
  showClearButton = false,
  required = false,
  className = '',
  labelClassName = '',
  inputWrapperClassName = '',
  helperTextClassName = '',
  errorClassName = '',
  successClassName = '',
  disabled = false,
  value,
  onChange,
  ...props
}: EnhancedInputProps) {
  const [focused, setFocused] = useState(false);
  const [innerValue, setInnerValue] = useState(value || '');
  const inputRef = useRef<HTMLInputElement>(null);
  
  // 同步外部value和内部state
  useEffect(() => {
    if (value !== undefined) {
      setInnerValue(value);
    }
  }, [value]);
  
  // 处理值变化
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInnerValue(e.target.value);
    if (onChange) {
      onChange(e);
    }
  };
  
  // 处理清除
  const handleClear = () => {
    setInnerValue('');
    if (onClear) {
      onClear();
    }
    if (onChange) {
      const event = {
        target: { value: '' }
      } as React.ChangeEvent<HTMLInputElement>;
      onChange(event);
    }
    // 聚焦输入框
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };
  
  // 构建样式类
  const inputContainerClass = cn(
    'ghibli-input flex items-center relative',
    inputWrapperClassName,
    {
      'border-destructive focus-within:border-destructive': !!errorMessage,
      'border-green-500 focus-within:border-green-500': !!successMessage && !errorMessage,
      'opacity-60 cursor-not-allowed': disabled
    }
  );
  
  const inputClass = cn(
    'flex-1 bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none py-2',
    className,
    {
      'pl-9': leftIcon,
      'pr-9': rightIcon || (showClearButton && innerValue)
    }
  );
  
  return (
    <div className="w-full space-y-1.5">
      {/* 标签 */}
      {label && (
        <label 
          className={cn(
            'text-sm font-medium flex items-center text-foreground/80 font-quicksand', 
            labelClassName,
            { 'text-destructive': !!errorMessage }
          )}
        >
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}
      
      {/* 输入框容器 */}
      <div 
        className={inputContainerClass}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        {/* 左侧图标 */}
        {leftIcon && (
          <div className="absolute left-2.5 text-muted-foreground">
            {leftIcon}
          </div>
        )}
        
        {/* 输入框 */}
        <ShadcnInput
          ref={inputRef}
          disabled={disabled}
          className={inputClass}
          value={innerValue}
          onChange={handleChange}
          {...props}
        />
        
        {/* 清除按钮 */}
        {showClearButton && innerValue && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        
        {/* 右侧图标 */}
        {rightIcon && !showClearButton && (
          <div className="absolute right-2.5 text-muted-foreground">
            {rightIcon}
          </div>
        )}
      </div>
      
      {/* 辅助文本区域 */}
      <div className="min-h-5">
        {errorMessage && (
          <p className={cn('text-xs text-destructive flex items-center', errorClassName)}>
            <AlertCircle className="h-3 w-3 mr-1" />
            {errorMessage}
          </p>
        )}
        
        {successMessage && !errorMessage && (
          <p className={cn('text-xs text-green-500 flex items-center', successClassName)}>
            <Check className="h-3 w-3 mr-1" />
            {successMessage}
          </p>
        )}
        
        {helperText && !errorMessage && !successMessage && (
          <p className={cn('text-xs text-muted-foreground', helperTextClassName)}>
            {helperText}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * 增强型密码输入框组件
 * 提供切换密码可见性功能
 */
export function EnhancedPasswordInput({
  showPasswordByDefault = false,
  ...props
}: EnhancedPasswordInputProps) {
  const [showPassword, setShowPassword] = useState(showPasswordByDefault);
  
  // 切换密码显示状态
  const toggleShowPassword = () => {
    setShowPassword(prev => !prev);
  };
  
  // 密码显示按钮
  const passwordToggleButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-transparent"
      onClick={toggleShowPassword}
      tabIndex={-1}
    >
      {showPassword ? (
        <EyeOff className="h-4 w-4" />
      ) : (
        <Eye className="h-4 w-4" />
      )}
    </Button>
  );
  
  return (
    <EnhancedInput
      type={showPassword ? 'text' : 'password'}
      rightIcon={passwordToggleButton}
      {...props}
    />
  );
}

/**
 * 增强型文本域组件
 * 提供计数器、自动调整高度等功能
 */
export function EnhancedTextarea({
  label,
  helperText,
  errorMessage,
  successMessage,
  showCounter = false,
  maxLength,
  onClear,
  showClearButton = false,
  required = false,
  className = '',
  labelClassName = '',
  textareaWrapperClassName = '',
  helperTextClassName = '',
  errorClassName = '',
  successClassName = '',
  disabled = false,
  value,
  onChange,
  resizable = true,
  ...props
}: EnhancedTextareaProps) {
  const [focused, setFocused] = useState(false);
  const [innerValue, setInnerValue] = useState(value ? String(value) : '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // 同步外部value和内部state
  useEffect(() => {
    if (value !== undefined) {
      setInnerValue(String(value));
    }
  }, [value]);
  
  // 处理值变化
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInnerValue(e.target.value);
    if (onChange) {
      onChange(e);
    }
  };
  
  // 处理清除
  const handleClear = () => {
    setInnerValue('');
    if (onClear) {
      onClear();
    }
    if (onChange) {
      const event = {
        target: { value: '' }
      } as React.ChangeEvent<HTMLTextAreaElement>;
      onChange(event);
    }
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };
  
  // 确保innerValue始终是字符串
  const stringValue: string = typeof innerValue === 'string' ? innerValue : String(innerValue || '');
  
  // 计算字符数
  const charCount = stringValue.length;
  const isOverLimit = maxLength !== undefined && charCount > maxLength;
  
  // 构建样式类
  const textareaContainerClass = cn(
    'ghibli-input flex flex-col relative',
    textareaWrapperClassName,
    {
      'border-destructive focus-within:border-destructive': !!errorMessage || isOverLimit,
      'border-green-500 focus-within:border-green-500': !!successMessage && !errorMessage && !isOverLimit,
      'opacity-60 cursor-not-allowed': disabled
    }
  );
  
  const textareaClass = cn(
    'flex-1 bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none min-h-[100px] py-2.5 px-3 font-quicksand',
    className,
    { 'resize-none': !resizable }
  );
  
  return (
    <div className="w-full space-y-1.5">
      {/* 标签 */}
      {label && (
        <label 
          className={cn(
            'text-sm font-medium flex items-center text-foreground/80 font-quicksand', 
            labelClassName,
            { 'text-destructive': !!errorMessage || isOverLimit }
          )}
        >
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}
      
      {/* 文本域容器 */}
      <div 
        className={textareaContainerClass}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        {/* 文本域 */}
        <textarea
          ref={textareaRef}
          disabled={disabled}
          className={textareaClass}
          value={stringValue}
          onChange={handleChange}
          maxLength={maxLength}
          {...props}
        />
        
        {/* 清除按钮 */}
        {showClearButton && stringValue && !disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-6 w-6 p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        
        {/* 字符计数器 */}
        {showCounter && (
          <div className={cn(
            'text-xs text-right pr-3 pb-1.5 pt-1', 
            isOverLimit ? 'text-destructive font-medium' : 'text-muted-foreground'
          )}>
            {charCount}
            {maxLength && ` / ${maxLength}`}
          </div>
        )}
      </div>
      
      {/* 辅助文本区域 */}
      <div className="min-h-5">
        {(errorMessage || isOverLimit) && (
          <p className={cn('text-xs text-destructive flex items-center', errorClassName)}>
            <AlertCircle className="h-3 w-3 mr-1" />
            {errorMessage || '已超出最大字符数限制'}
          </p>
        )}
        
        {successMessage && !errorMessage && !isOverLimit && (
          <p className={cn('text-xs text-green-500 flex items-center', successClassName)}>
            <Check className="h-3 w-3 mr-1" />
            {successMessage}
          </p>
        )}
        
        {helperText && !errorMessage && !successMessage && !isOverLimit && (
          <p className={cn('text-xs text-muted-foreground flex items-center', helperTextClassName)}>
            <Info className="h-3 w-3 mr-1 flex-shrink-0" />
            {helperText}
          </p>
        )}
      </div>
    </div>
  );
} 