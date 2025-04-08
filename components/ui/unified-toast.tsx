"use client"

import { useEnhancedToast } from "./enhanced-toast";
import { useToast as useBasicToast } from "./use-toast";

export function useUnifiedToast(useEnhanced = true) {
  const enhancedToast = useEnhancedToast();
  const { toast: basicToast, ...basicMethods } = useBasicToast();
  
  if (useEnhanced) {
    return enhancedToast;
  } else {
    return {
      ...basicMethods,
      toast: basicToast,
    };
  }
} 