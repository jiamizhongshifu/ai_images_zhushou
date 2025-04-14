/**
 * 客户端国际化工具
 * 简单实现，返回defaultValue或key
 */

export function useTranslation(namespace: string) {
  return {
    t: (key: string, options: { defaultValue: string } | undefined = undefined) => {
      return options?.defaultValue || key;
    }
  };
} 